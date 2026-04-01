"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

type ExpeditionRow = {
  date_validation: string;
  prix_vente_moteur?: number;
  n_moteur?: number;
  n_bv?: number;
};

type MotorInfo = { n_moteur: number; code_moteur: string };

export default function VentesPage() {
  const [piece, setPiece] = useState<"moteurs" | "boites">("moteurs");
  const [nMonths, setNMonths] = useState(6);
  const [rawData, setRawData] = useState<ExpeditionRow[]>([]);
  const [motorMap, setMotorMap] = useState<Record<number, string>>({});
  const [marqueMap, setMarqueMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setExpandedMonth(null);

      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - nMonths);
      const cutoffDate = cutoff.toISOString().split("T")[0];

      try {
        if (piece === "moteurs") {
          const { data, error: err } = await supabase
            .from("tbl_expeditions_moteurs")
            .select("date_validation, prix_vente_moteur, n_moteur")
            .gte("date_validation", cutoffDate)
            .order("date_validation");

          if (err) throw err;
          if (cancelled) return;
          const rows = data || [];
          setRawData(rows);

          const motorIds = [...new Set(rows.map((r) => r.n_moteur).filter(Boolean))] as number[];
          if (motorIds.length > 0) {
            // Fetch motor codes in batches of 1000
            const allMotors: MotorInfo[] = [];
            for (let i = 0; i < motorIds.length; i += 1000) {
              const batch = motorIds.slice(i, i + 1000);
              const { data: motors } = await supabase
                .from("tbl_moteurs")
                .select("n_moteur, code_moteur")
                .in("n_moteur", batch);
              if (motors) allMotors.push(...(motors as MotorInfo[]));
            }
            if (cancelled) return;
            const map: Record<number, string> = {};
            allMotors.forEach((m) => { map[m.n_moteur] = m.code_moteur || ""; });
            setMotorMap(map);

            // Fetch marques from v_moteurs_dispo
            const allMarques: { n_moteur: number; marque: string }[] = [];
            for (let i = 0; i < motorIds.length; i += 1000) {
              const batch = motorIds.slice(i, i + 1000);
              const { data: dispoData } = await supabase
                .from("v_moteurs_dispo")
                .select("n_moteur, marque")
                .in("n_moteur", batch);
              if (dispoData) allMarques.push(...(dispoData as any[]));
            }
            if (cancelled) return;
            const mMap: Record<number, string> = {};
            allMarques.forEach((m) => { mMap[m.n_moteur] = m.marque || ""; });
            setMarqueMap(mMap);
          } else {
            setMotorMap({});
            setMarqueMap({});
          }
        } else {
          const { data, error: err } = await supabase
            .from("tbl_expeditions_boites")
            .select("date_validation, n_bv")
            .gte("date_validation", cutoffDate)
            .order("date_validation");

          if (err) throw err;
          if (cancelled) return;
          setRawData(data || []);
          setMotorMap({});
          setMarqueMap({});
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Erreur lors du chargement");
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [piece, nMonths]);

  // --- Computed data ---
  const totalVentes = rawData.length;
  const totalCA = useMemo(
    () => rawData.reduce((s, r) => s + (r.prix_vente_moteur || 0), 0),
    [rawData]
  );

  const ventesParMois = useMemo(() => {
    const byMonth: Record<string, { count: number; ca: number }> = {};
    rawData.forEach((row) => {
      if (!row.date_validation) return;
      const d = new Date(row.date_validation);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!byMonth[key]) byMonth[key] = { count: 0, ca: 0 };
      byMonth[key].count++;
      byMonth[key].ca += row.prix_vente_moteur || 0;
    });
    return Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mois, v]) => ({ mois, nb_vendus: v.count, ca: Math.round(v.ca) }));
  }, [rawData]);

  const topCodes = useMemo(() => {
    if (piece !== "moteurs") return [];
    const codeCount: Record<string, number> = {};
    rawData.forEach((r) => {
      const code = (motorMap[r.n_moteur!] || "").substring(0, 3).toUpperCase();
      if (code) codeCount[code] = (codeCount[code] || 0) + 1;
    });
    return Object.entries(codeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([type_moteur, nb_vendus]) => ({ type_moteur, nb_vendus }));
  }, [rawData, motorMap, piece]);

  const topMarques = useMemo(() => {
    if (piece !== "moteurs") return [];
    const count: Record<string, number> = {};
    rawData.forEach((r) => {
      const marque = (marqueMap[r.n_moteur!] || "").toUpperCase().trim();
      if (marque) count[marque] = (count[marque] || 0) + 1;
    });
    return Object.entries(count)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([marque, nb_vendus]) => ({ marque, nb_vendus }));
  }, [rawData, marqueMap, piece]);

  // Detail rows for expanded month
  const detailRows = useMemo(() => {
    if (!expandedMonth) return [];
    return rawData.filter((r) => {
      if (!r.date_validation) return false;
      const d = new Date(r.date_validation);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return key === expandedMonth;
    });
  }, [rawData, expandedMonth]);

  return (
    <div>
      <PageHeader title="Analyse des ventes" icon="TrendingUp" description="Tendances et statistiques commerciales" />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex bg-white rounded-lg shadow-sm border overflow-hidden">
          {(["moteurs", "boites"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPiece(p)}
              className={`px-4 py-2 text-sm font-medium transition ${piece === p ? "bg-[#C41E3A] text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {p === "moteurs" ? "Moteurs" : "Boites"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Periode :</span>
          <select
            value={nMonths}
            onChange={(e) => setNMonths(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value={3}>3 mois</option>
            <option value={6}>6 mois</option>
            <option value={12}>12 mois</option>
            <option value={24}>24 mois</option>
          </select>
        </div>
      </div>

      {/* KPIs */}
      {!loading && !error && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 font-semibold uppercase">Total ventes</p>
              <p className="text-2xl font-bold text-[#C41E3A]">{totalVentes.toLocaleString("fr-FR")}</p>
            </CardContent>
          </Card>
          {piece === "moteurs" && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 font-semibold uppercase">CA total</p>
                <p className="text-2xl font-bold text-gray-700">{Math.round(totalCA).toLocaleString("fr-FR")} EUR</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 font-semibold uppercase">Moy. / mois</p>
              <p className="text-2xl font-bold text-gray-700">
                {ventesParMois.length > 0 ? Math.round(totalVentes / ventesParMois.length) : 0}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Chargement des donnees...</div>
      ) : ventesParMois.length === 0 && !error ? (
        <div className="text-center py-16 text-gray-400">Aucune vente sur la periode selectionnee</div>
      ) : (
        <>
          {/* LineChart: sales per month */}
          <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-700 mb-4">
              Ventes par mois — {nMonths} derniers mois
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={ventesParMois}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    Number(value).toLocaleString("fr-FR"),
                    name === "nb_vendus" ? "Ventes" : "CA (EUR)",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="nb_vendus"
                  stroke="#C41E3A"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#C41E3A" }}
                  name="nb_vendus"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* BarChart: top 20 motor types */}
          {topCodes.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
              <h3 className="font-semibold text-gray-700 mb-4">Top 20 types moteur vendus (3 premiers caracteres)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topCodes}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="type_moteur" tick={{ fontSize: 11 }} interval={0} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: any) => [v, "Ventes"]} />
                  <Bar dataKey="nb_vendus" fill="#8B1A2B" radius={[6, 6, 0, 0]} name="Ventes" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* BarChart: top 15 marques */}
          {topMarques.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
              <h3 className="font-semibold text-gray-700 mb-4">Top 15 marques vendues</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topMarques}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="marque" tick={{ fontSize: 11 }} interval={0} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: any) => [v, "Ventes"]} />
                  <Bar dataKey="nb_vendus" fill="#2563eb" radius={[6, 6, 0, 0]} name="Ventes" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Expandable detail table */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">Detail par mois</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Mois</th>
                    <th className="px-4 py-3 text-center">Nb ventes</th>
                    {piece === "moteurs" && <th className="px-4 py-3 text-right">CA (EUR)</th>}
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ventesParMois.map((row) => (
                    <>
                      <tr key={row.mois} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedMonth(expandedMonth === row.mois ? null : row.mois)}>
                        <td className="px-4 py-3 font-semibold">{row.mois}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{row.nb_vendus}</td>
                        {piece === "moteurs" && (
                          <td className="px-4 py-3 text-right tabular-nums">{row.ca.toLocaleString("fr-FR")} EUR</td>
                        )}
                        <td className="px-4 py-3 text-center">
                          <button className="text-xs text-[#C41E3A] hover:underline">
                            {expandedMonth === row.mois ? "Masquer" : "Voir detail"}
                          </button>
                        </td>
                      </tr>
                      {expandedMonth === row.mois && (
                        <tr key={`${row.mois}-detail`}>
                          <td colSpan={piece === "moteurs" ? 4 : 3} className="bg-gray-50 px-4 py-3">
                            <div className="max-h-64 overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead className="text-gray-500 uppercase">
                                  <tr>
                                    <th className="px-2 py-1 text-left">Date</th>
                                    {piece === "moteurs" ? (
                                      <>
                                        <th className="px-2 py-1 text-left">N moteur</th>
                                        <th className="px-2 py-1 text-left">Code</th>
                                        <th className="px-2 py-1 text-right">Prix vente</th>
                                      </>
                                    ) : (
                                      <th className="px-2 py-1 text-left">N boite</th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {detailRows.map((d, i) => (
                                    <tr key={i} className="hover:bg-white">
                                      <td className="px-2 py-1">{d.date_validation ? new Date(d.date_validation).toLocaleDateString("fr-FR") : "—"}</td>
                                      {piece === "moteurs" ? (
                                        <>
                                          <td className="px-2 py-1 font-mono">{d.n_moteur || "—"}</td>
                                          <td className="px-2 py-1">{motorMap[d.n_moteur!] || "—"}</td>
                                          <td className="px-2 py-1 text-right tabular-nums">{d.prix_vente_moteur ? `${Math.round(d.prix_vente_moteur).toLocaleString("fr-FR")} EUR` : "—"}</td>
                                        </>
                                      ) : (
                                        <td className="px-2 py-1 font-mono">{d.n_bv || "—"}</td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {detailRows.length === 0 && <p className="text-gray-400 py-2 text-center">Aucun detail</p>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
