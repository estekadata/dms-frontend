"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

type Tab = "Receptions" | "Expeditions" | "Statistiques";

/* ---- Receptions ---- */
type ReceptionRow = {
  n_reception: number;
  date_achat: string | null;
  montant_ht: number | null;
  n_fournisseur: number | null;
  tbl_fournisseurs: { nom_fournisseur: string } | null;
};

/* ---- Expeditions ---- */
type ExpeditionRow = {
  n_expedition: number;
  date_validation: string | null;
  n_client: number | null;
  tbl_clients: { nom_client: string } | null;
  montant_ht: number | null;
};

type ExpeditionMoteur = {
  n_moteur: number;
  prix_vente_moteur: number | null;
  tbl_moteurs: { code_moteur: string | null; num_serie: string | null } | null;
};

/* ---- Stats ---- */
type MonthlyCA = { mois: string; ca_vente: number; ca_achat: number; marge: number };
type ClientStat = { nom: string; total: number; count: number };
type FournisseurStat = { nom: string; total: number; count: number };

export default function HistoriquePage() {
  const [tab, setTab] = useState<Tab>("Receptions");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Receptions
  const [receptions, setReceptions] = useState<ReceptionRow[]>([]);
  const [recMoteurs, setRecMoteurs] = useState<any[]>([]);
  const [selectedRec, setSelectedRec] = useState<number | null>(null);
  const [recDetailLoading, setRecDetailLoading] = useState(false);
  const [recDetailMoteurs, setRecDetailMoteurs] = useState<any[]>([]);

  // Expeditions
  const [expeditions, setExpeditions] = useState<ExpeditionRow[]>([]);
  const [selectedExp, setSelectedExp] = useState<number | null>(null);
  const [expDetailLoading, setExpDetailLoading] = useState(false);
  const [expDetailMoteurs, setExpDetailMoteurs] = useState<ExpeditionMoteur[]>([]);

  // Stats
  const [monthlyCA, setMonthlyCA] = useState<MonthlyCA[]>([]);
  const [topClients, setTopClients] = useState<ClientStat[]>([]);
  const [topFournisseurs, setTopFournisseurs] = useState<FournisseurStat[]>([]);
  const [stockRotation, setStockRotation] = useState<{ fast: any[]; slow: any[]; dead: any[] }>({ fast: [], slow: [], dead: [] });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);

      try {
        if (tab === "Receptions") {
          const { data, error: err } = await supabase
            .from("tbl_receptions")
            .select("n_reception, date_achat, montant_ht, n_fournisseur, tbl_fournisseurs(nom_fournisseur)")
            .order("n_reception", { ascending: false })
            .limit(500);
          if (err) throw err;
          if (cancelled) return;
          const rows = (data || []) as unknown as ReceptionRow[];
          setReceptions(rows);

          // Build monthly charts
          const byMonth: Record<string, { receptions: number; moteurs: number }> = {};
          rows.forEach((r) => {
            const k = r.date_achat?.substring(0, 7) || "Inconnu";
            if (!byMonth[k]) byMonth[k] = { receptions: 0, moteurs: 0 };
            byMonth[k].receptions++;
          });
          // Get moteurs count per reception
          const recIds = rows.map((r) => r.n_reception);
          if (recIds.length > 0) {
            const { data: moteurs } = await supabase
              .from("tbl_moteurs")
              .select("num_reception")
              .in("num_reception", recIds.slice(0, 1000));
            if (cancelled) return;
            (moteurs || []).forEach((m: any) => {
              const rec = rows.find((r) => r.n_reception === m.num_reception);
              if (rec) {
                const k = rec.date_achat?.substring(0, 7) || "Inconnu";
                if (byMonth[k]) byMonth[k].moteurs++;
              }
            });
          }
          setRecMoteurs(
            Object.entries(byMonth)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([mois, v]) => ({ mois, ...v }))
          );

        } else if (tab === "Expeditions") {
          const { data, error: err } = await supabase
            .from("tbl_expeditions")
            .select("n_expedition, date_validation, n_client, tbl_clients(nom_client), montant_ht")
            .order("n_expedition", { ascending: false })
            .limit(500);
          if (err) throw err;
          if (cancelled) return;
          setExpeditions((data || []) as unknown as ExpeditionRow[]);

        } else {
          // Statistiques
          const cutoff12 = new Date();
          cutoff12.setMonth(cutoff12.getMonth() - 12);
          const cutoffStr = cutoff12.toISOString().split("T")[0];

          // Fetch expeditions moteurs for CA
          const { data: expMot } = await supabase
            .from("tbl_expeditions_moteurs")
            .select("date_validation, prix_vente_moteur, n_moteur")
            .gte("date_validation", cutoffStr);

          if (cancelled) return;
          const expMotRows = expMot || [];

          // Fetch achat prices
          const motorIds = [...new Set(expMotRows.map((r: any) => r.n_moteur).filter(Boolean))];
          let achatMap: Record<number, number> = {};
          if (motorIds.length > 0) {
            for (let i = 0; i < motorIds.length; i += 1000) {
              const batch = motorIds.slice(i, i + 1000);
              const { data: mots } = await supabase
                .from("tbl_moteurs")
                .select("n_moteur, prix_achat_moteur")
                .in("n_moteur", batch);
              (mots || []).forEach((m: any) => { achatMap[m.n_moteur] = m.prix_achat_moteur || 0; });
            }
          }
          if (cancelled) return;

          // Monthly CA + marge
          const byMonth: Record<string, { ca_vente: number; ca_achat: number }> = {};
          expMotRows.forEach((r: any) => {
            const k = r.date_validation?.substring(0, 7) || "";
            if (!k) return;
            if (!byMonth[k]) byMonth[k] = { ca_vente: 0, ca_achat: 0 };
            byMonth[k].ca_vente += r.prix_vente_moteur || 0;
            byMonth[k].ca_achat += achatMap[r.n_moteur] || 0;
          });
          setMonthlyCA(
            Object.entries(byMonth)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([mois, v]) => ({
                mois,
                ca_vente: Math.round(v.ca_vente),
                ca_achat: Math.round(v.ca_achat),
                marge: Math.round(v.ca_vente - v.ca_achat),
              }))
          );

          // Top 10 clients
          const { data: expAll } = await supabase
            .from("tbl_expeditions")
            .select("n_client, montant_ht, tbl_clients(nom_client)")
            .gte("date_validation", cutoffStr);
          if (cancelled) return;

          const clientMap: Record<string, { total: number; count: number }> = {};
          (expAll || []).forEach((e: any) => {
            const nom = e.tbl_clients?.nom_client || "Inconnu";
            if (!clientMap[nom]) clientMap[nom] = { total: 0, count: 0 };
            clientMap[nom].total += e.montant_ht || 0;
            clientMap[nom].count++;
          });
          setTopClients(
            Object.entries(clientMap)
              .map(([nom, v]) => ({ nom, ...v }))
              .sort((a, b) => b.total - a.total)
              .slice(0, 10)
          );

          // Top 10 fournisseurs
          const { data: recAll } = await supabase
            .from("tbl_receptions")
            .select("montant_ht, tbl_fournisseurs(nom_fournisseur)")
            .gte("date_achat", cutoffStr);
          if (cancelled) return;

          const fournMap: Record<string, { total: number; count: number }> = {};
          (recAll || []).forEach((r: any) => {
            const nom = r.tbl_fournisseurs?.nom_fournisseur || "Inconnu";
            if (!fournMap[nom]) fournMap[nom] = { total: 0, count: 0 };
            fournMap[nom].total += r.montant_ht || 0;
            fournMap[nom].count++;
          });
          setTopFournisseurs(
            Object.entries(fournMap)
              .map(([nom, v]) => ({ nom, ...v }))
              .sort((a, b) => b.total - a.total)
              .slice(0, 10)
          );

          // Stock rotation: fetch all stock moteurs + their last sale
          const { data: stockData } = await supabase
            .from("v_moteurs_dispo")
            .select("n_moteur, code_moteur, marque, date_entree")
            .eq("est_disponible", 1)
            .limit(500);
          if (cancelled) return;

          const now = new Date();
          const fast: any[] = [];
          const slow: any[] = [];
          const dead: any[] = [];
          (stockData || []).forEach((m: any) => {
            const entree = m.date_entree ? new Date(m.date_entree) : null;
            const jourEnStock = entree ? Math.floor((now.getTime() - entree.getTime()) / 86400000) : 999;
            const item = { ...m, jours_en_stock: jourEnStock };
            if (jourEnStock <= 30) fast.push(item);
            else if (jourEnStock <= 180) slow.push(item);
            else dead.push(item);
          });
          setStockRotation({ fast, slow, dead });
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Erreur");
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [tab]);

  // Detail drill-down: receptions
  async function openRecDetail(id: number) {
    setSelectedRec(id);
    setRecDetailLoading(true);
    const { data } = await supabase
      .from("tbl_moteurs")
      .select("n_moteur, code_moteur, num_serie, prix_achat_moteur, etat_moteur")
      .eq("num_reception", id);
    setRecDetailMoteurs(data || []);
    setRecDetailLoading(false);
  }

  // Detail drill-down: expeditions
  async function openExpDetail(id: number) {
    setSelectedExp(id);
    setExpDetailLoading(true);
    const { data } = await supabase
      .from("tbl_expeditions_moteurs")
      .select("n_moteur, prix_vente_moteur, tbl_moteurs(code_moteur, num_serie)")
      .eq("n_expedition", id);
    setExpDetailMoteurs((data || []) as unknown as ExpeditionMoteur[]);
    setExpDetailLoading(false);
  }

  // Receptions monthly chart data
  const recChartData = recMoteurs;

  // Expeditions monthly chart
  const expChartData = useMemo(() => {
    const byMonth: Record<string, { expeditions: number; moteurs: number }> = {};
    expeditions.forEach((e) => {
      const k = e.date_validation?.substring(0, 7) || "Inconnu";
      if (!byMonth[k]) byMonth[k] = { expeditions: 0, moteurs: 0 };
      byMonth[k].expeditions++;
    });
    return Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mois, v]) => ({ mois, ...v }));
  }, [expeditions]);

  // Total marge for stats
  const totalMargeStats = useMemo(() => {
    const totalVente = monthlyCA.reduce((s, m) => s + m.ca_vente, 0);
    const totalAchat = monthlyCA.reduce((s, m) => s + m.ca_achat, 0);
    const marge = totalVente - totalAchat;
    const pctMarge = totalVente > 0 ? ((marge / totalVente) * 100).toFixed(1) : "0";
    return { totalVente, totalAchat, marge, pctMarge };
  }, [monthlyCA]);

  return (
    <div>
      <PageHeader title="Historique" icon="History" description="Receptions, expeditions et statistiques" />

      {/* Tabs */}
      <div className="flex bg-white rounded-lg shadow-sm border overflow-hidden mb-6 w-fit">
        {(["Receptions", "Expeditions", "Statistiques"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSelectedRec(null); setSelectedExp(null); }}
            className={`px-5 py-2 text-sm font-medium transition ${tab === t ? "bg-[#C41E3A] text-white" : "text-gray-600 hover:bg-gray-50"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      ) : tab === "Receptions" ? (
        /* ===================== RECEPTIONS TAB ===================== */
        <>
          {/* Charts */}
          {recChartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-700 mb-4">Receptions par mois</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={recChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="receptions" fill="#C41E3A" radius={[6, 6, 0, 0]} name="Receptions" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-700 mb-4">Moteurs recus par mois</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={recChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="moteurs" fill="#2563eb" radius={[6, 6, 0, 0]} name="Moteurs recus" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Table + detail */}
          <div className={`grid gap-6 ${selectedRec ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">N</th>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Fournisseur</th>
                      <th className="px-4 py-3 text-right">Montant HT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {receptions.map((r) => (
                      <tr
                        key={r.n_reception}
                        onClick={() => openRecDetail(r.n_reception)}
                        className={`hover:bg-gray-50 cursor-pointer ${selectedRec === r.n_reception ? "bg-red-50" : ""}`}
                      >
                        <td className="px-4 py-3 font-mono text-xs">{r.n_reception}</td>
                        <td className="px-4 py-3">{r.date_achat ? new Date(r.date_achat).toLocaleDateString("fr-FR") : "—"}</td>
                        <td className="px-4 py-3 font-medium">{r.tbl_fournisseurs?.nom_fournisseur || "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.montant_ht ? `${Math.round(r.montant_ht).toLocaleString("fr-FR")} EUR` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {receptions.length === 0 && <p className="text-center py-10 text-gray-400">Aucune reception</p>}
            </div>

            {selectedRec && (
              <div className="bg-white rounded-xl shadow-sm p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-gray-900">Detail reception #{selectedRec}</h3>
                  <button onClick={() => setSelectedRec(null)} className="text-gray-400 hover:text-gray-600">X</button>
                </div>
                {recDetailLoading ? (
                  <p className="text-gray-400 text-sm">Chargement...</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">N moteur</th>
                        <th className="px-3 py-2 text-left">Code</th>
                        <th className="px-3 py-2 text-left">Num serie</th>
                        <th className="px-3 py-2 text-right">Prix achat</th>
                        <th className="px-3 py-2 text-center">Etat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recDetailMoteurs.map((m: any) => (
                        <tr key={m.n_moteur} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono">{m.n_moteur}</td>
                          <td className="px-3 py-2 font-semibold">{m.code_moteur || "—"}</td>
                          <td className="px-3 py-2 text-gray-500">{m.num_serie || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.prix_achat_moteur ? `${Math.round(m.prix_achat_moteur)} EUR` : "—"}</td>
                          <td className="px-3 py-2 text-center">{m.etat_moteur || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {!recDetailLoading && recDetailMoteurs.length === 0 && <p className="text-gray-400 text-sm mt-2">Aucun moteur</p>}
              </div>
            )}
          </div>
        </>

      ) : tab === "Expeditions" ? (
        /* ===================== EXPEDITIONS TAB ===================== */
        <>
          {/* Charts */}
          {expChartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-700 mb-4">Expeditions par mois</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={expChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="expeditions" fill="#C41E3A" radius={[6, 6, 0, 0]} name="Expeditions" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-700 mb-4">Moteurs expedies par mois</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={expChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="expeditions" fill="#2563eb" radius={[6, 6, 0, 0]} name="Moteurs expedies" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Table + detail */}
          <div className={`grid gap-6 ${selectedExp ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">N</th>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Client</th>
                      <th className="px-4 py-3 text-right">Montant HT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {expeditions.map((e) => (
                      <tr
                        key={e.n_expedition}
                        onClick={() => openExpDetail(e.n_expedition)}
                        className={`hover:bg-gray-50 cursor-pointer ${selectedExp === e.n_expedition ? "bg-red-50" : ""}`}
                      >
                        <td className="px-4 py-3 font-mono text-xs">{e.n_expedition}</td>
                        <td className="px-4 py-3">{e.date_validation ? new Date(e.date_validation).toLocaleDateString("fr-FR") : "—"}</td>
                        <td className="px-4 py-3 font-medium">{e.tbl_clients?.nom_client || "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{e.montant_ht ? `${Math.round(e.montant_ht).toLocaleString("fr-FR")} EUR` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {expeditions.length === 0 && <p className="text-center py-10 text-gray-400">Aucune expedition</p>}
            </div>

            {selectedExp && (
              <div className="bg-white rounded-xl shadow-sm p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-gray-900">Detail expedition #{selectedExp}</h3>
                  <button onClick={() => setSelectedExp(null)} className="text-gray-400 hover:text-gray-600">X</button>
                </div>
                {expDetailLoading ? (
                  <p className="text-gray-400 text-sm">Chargement...</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">N moteur</th>
                        <th className="px-3 py-2 text-left">Code</th>
                        <th className="px-3 py-2 text-left">Num serie</th>
                        <th className="px-3 py-2 text-right">Prix vente</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {expDetailMoteurs.map((m) => (
                        <tr key={m.n_moteur} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono">{m.n_moteur}</td>
                          <td className="px-3 py-2 font-semibold">{m.tbl_moteurs?.code_moteur || "—"}</td>
                          <td className="px-3 py-2 text-gray-500">{m.tbl_moteurs?.num_serie || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.prix_vente_moteur ? `${Math.round(m.prix_vente_moteur).toLocaleString("fr-FR")} EUR` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {!expDetailLoading && expDetailMoteurs.length === 0 && <p className="text-gray-400 text-sm mt-2">Aucun moteur</p>}
              </div>
            )}
          </div>
        </>

      ) : (
        /* ===================== STATISTIQUES TAB ===================== */
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 font-semibold uppercase">CA Vente (12 mois)</p>
                <p className="text-2xl font-bold text-[#C41E3A]">{Math.round(totalMargeStats.totalVente).toLocaleString("fr-FR")} EUR</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 font-semibold uppercase">CA Achat (12 mois)</p>
                <p className="text-2xl font-bold text-gray-700">{Math.round(totalMargeStats.totalAchat).toLocaleString("fr-FR")} EUR</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 font-semibold uppercase">Marge totale</p>
                <p className="text-2xl font-bold text-green-600">{Math.round(totalMargeStats.marge).toLocaleString("fr-FR")} EUR</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 font-semibold uppercase">% Marge</p>
                <p className="text-2xl font-bold text-green-600">{totalMargeStats.pctMarge}%</p>
              </CardContent>
            </Card>
          </div>

          {/* Explanation */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            <strong>Calcul de la marge :</strong> Marge EUR = Total prix vente - Total prix achat. % Marge = Marge / Total prix vente x 100
          </div>

          {/* CA par mois chart (bar + line dual axis) */}
          {monthlyCA.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-semibold text-gray-700 mb-4">CA par mois (12 derniers mois)</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={monthlyCA}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: any, name: any) => [`${Number(v).toLocaleString("fr-FR")} EUR`, name]} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="ca_vente" fill="#C41E3A" radius={[6, 6, 0, 0]} name="CA Vente" />
                  <Bar yAxisId="left" dataKey="ca_achat" fill="#93c5fd" radius={[6, 6, 0, 0]} name="CA Achat" />
                  <Line yAxisId="right" type="monotone" dataKey="marge" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} name="Marge" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Marge estimee chart */}
          {monthlyCA.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-semibold text-gray-700 mb-4">Marge estimee par mois</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyCA}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString("fr-FR")} EUR`, "Marge"]} />
                  <Bar dataKey="marge" fill="#16a34a" radius={[6, 6, 0, 0]} name="Marge" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top 10 clients */}
          {topClients.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-700 mb-4">Top 10 clients (CA)</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topClients} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="nom" type="category" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString("fr-FR")} EUR`, "CA"]} />
                    <Bar dataKey="total" fill="#C41E3A" radius={[0, 6, 6, 0]} name="CA" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">#</th>
                      <th className="px-4 py-3 text-left">Client</th>
                      <th className="px-4 py-3 text-center">Nb expeditions</th>
                      <th className="px-4 py-3 text-right">CA total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {topClients.map((c, i) => (
                      <tr key={c.nom} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                        <td className="px-4 py-3 font-medium">{c.nom}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{c.count}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{Math.round(c.total).toLocaleString("fr-FR")} EUR</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top 10 fournisseurs */}
          {topFournisseurs.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-700 mb-4">Top 10 fournisseurs (achats)</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topFournisseurs} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="nom" type="category" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString("fr-FR")} EUR`, "Achats"]} />
                    <Bar dataKey="total" fill="#2563eb" radius={[0, 6, 6, 0]} name="Achats" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">#</th>
                      <th className="px-4 py-3 text-left">Fournisseur</th>
                      <th className="px-4 py-3 text-center">Nb receptions</th>
                      <th className="px-4 py-3 text-right">Total achats</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {topFournisseurs.map((f, i) => (
                      <tr key={f.nom} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                        <td className="px-4 py-3 font-medium">{f.nom}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{f.count}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{Math.round(f.total).toLocaleString("fr-FR")} EUR</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Rotation de stock */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">Rotation de stock</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 font-semibold uppercase">Rotation rapide (&lt;= 30j)</p>
                  <p className="text-2xl font-bold text-green-600">{stockRotation.fast.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 font-semibold uppercase">Rotation lente (31-180j)</p>
                  <p className="text-2xl font-bold text-amber-600">{stockRotation.slow.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 font-semibold uppercase">Stock mort (&gt; 180j)</p>
                  <p className="text-2xl font-bold text-red-600">{stockRotation.dead.length}</p>
                </CardContent>
              </Card>
            </div>

            {/* Fast stock */}
            {stockRotation.fast.length > 0 && (
              <details className="mb-3">
                <summary className="cursor-pointer text-sm font-semibold text-green-700 mb-2">
                  Rotation rapide ({stockRotation.fast.length} moteurs)
                </summary>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-green-50 text-green-700 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">Code</th>
                        <th className="px-3 py-2 text-left">Marque</th>
                        <th className="px-3 py-2 text-right">Jours en stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {stockRotation.fast.slice(0, 20).map((m: any) => (
                        <tr key={m.n_moteur} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-semibold">{m.code_moteur || "—"}</td>
                          <td className="px-3 py-2">{m.marque || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.jours_en_stock}j</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {/* Slow stock */}
            {stockRotation.slow.length > 0 && (
              <details className="mb-3">
                <summary className="cursor-pointer text-sm font-semibold text-amber-700 mb-2">
                  Rotation lente ({stockRotation.slow.length} moteurs)
                </summary>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-amber-50 text-amber-700 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">Code</th>
                        <th className="px-3 py-2 text-left">Marque</th>
                        <th className="px-3 py-2 text-right">Jours en stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {stockRotation.slow.slice(0, 20).map((m: any) => (
                        <tr key={m.n_moteur} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-semibold">{m.code_moteur || "—"}</td>
                          <td className="px-3 py-2">{m.marque || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.jours_en_stock}j</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {/* Dead stock */}
            {stockRotation.dead.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-red-700 mb-2">
                  Stock mort ({stockRotation.dead.length} moteurs)
                </summary>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-red-50 text-red-700 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">Code</th>
                        <th className="px-3 py-2 text-left">Marque</th>
                        <th className="px-3 py-2 text-right">Jours en stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {stockRotation.dead.slice(0, 30).map((m: any) => (
                        <tr key={m.n_moteur} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-semibold">{m.code_moteur || "—"}</td>
                          <td className="px-3 py-2">{m.marque || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.jours_en_stock}j</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
