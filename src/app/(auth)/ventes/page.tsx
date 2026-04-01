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

type VenteRow = { mois: string; nb_vendus: number; ca: number; type_moteur: string; marque: string };

export default function VentesPage() {
  const [piece, setPiece] = useState<"moteurs" | "boites">("moteurs");
  const [nMonths, setNMonths] = useState(6);
  const [rawData, setRawData] = useState<VenteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        if (piece === "moteurs") {
          const { data, error } = await supabase.rpc("get_ventes_par_mois", { p_months: nMonths });
          if (error) throw error;
          if (!cancelled) setRawData((data || []) as VenteRow[]);
        } else {
          const { data, error } = await supabase.rpc("get_ventes_boites_par_mois", { p_months: nMonths });
          if (error) throw error;
          if (!cancelled) setRawData((data || []).map((r: any) => ({ mois: r.mois, nb_vendus: Number(r.nb_vendus), ca: 0, type_moteur: r.code_boite || "", marque: "" })));
        }
      } catch (e: any) {
        console.error(e);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [piece, nMonths]);

  // Aggregate by month
  const ventesParMois = useMemo(() => {
    const map: Record<string, { nb: number; ca: number }> = {};
    rawData.forEach((r) => {
      if (!map[r.mois]) map[r.mois] = { nb: 0, ca: 0 };
      map[r.mois].nb += Number(r.nb_vendus);
      map[r.mois].ca += Number(r.ca);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([mois, v]) => ({ mois, nb_vendus: v.nb, ca: Math.round(v.ca) }));
  }, [rawData]);

  // Top 20 types
  const topTypes = useMemo(() => {
    const map: Record<string, number> = {};
    rawData.forEach((r) => {
      const code = (r.type_moteur || "").substring(0, 3).toUpperCase();
      if (code) map[code] = (map[code] || 0) + Number(r.nb_vendus);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([type_moteur, nb_vendus]) => ({ type_moteur, nb_vendus }));
  }, [rawData]);

  // Top 15 marques
  const topMarques = useMemo(() => {
    const map: Record<string, number> = {};
    rawData.forEach((r) => {
      const m = r.marque || "";
      if (m) map[m] = (map[m] || 0) + Number(r.nb_vendus);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([marque, nb_vendus]) => ({ marque, nb_vendus }));
  }, [rawData]);

  const totalVentes = ventesParMois.reduce((s, r) => s + r.nb_vendus, 0);
  const totalCA = ventesParMois.reduce((s, r) => s + r.ca, 0);

  return (
    <div>
      <PageHeader title="Analyse des ventes" icon="📈" />

      <div className="flex items-center gap-4 mb-6">
        <div className="flex bg-white rounded-lg shadow-sm border">
          <button onClick={() => setPiece("moteurs")} className={`px-4 py-2 text-sm font-medium rounded-lg transition ${piece === "moteurs" ? "bg-[#C41E3A] text-white" : "text-gray-600 hover:bg-gray-50"}`}>Moteurs</button>
          <button onClick={() => setPiece("boites")} className={`px-4 py-2 text-sm font-medium rounded-lg transition ${piece === "boites" ? "bg-[#C41E3A] text-white" : "text-gray-600 hover:bg-gray-50"}`}>Boites</button>
        </div>
        <span className="text-sm text-gray-500">Periode :</span>
        <select value={nMonths} onChange={(e) => setNMonths(Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
          <option value={3}>3 mois</option>
          <option value={6}>6 mois</option>
          <option value={12}>12 mois</option>
          <option value={24}>24 mois</option>
        </select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500 font-semibold">TOTAL VENTES</p><p className="text-2xl font-bold text-[#C41E3A]">{totalVentes.toLocaleString("fr-FR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500 font-semibold">CA TOTAL</p><p className="text-2xl font-bold text-gray-900">{totalCA.toLocaleString("fr-FR")} EUR</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500 font-semibold">MOY. / MOIS</p><p className="text-2xl font-bold text-gray-900">{ventesParMois.length > 0 ? Math.round(totalVentes / ventesParMois.length).toLocaleString("fr-FR") : 0}</p></CardContent></Card>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Chargement...</div>
      ) : ventesParMois.length === 0 ? (
        <div className="text-center py-16 text-gray-400">Aucune vente sur la periode</div>
      ) : (
        <div className="space-y-6">
          {/* Line chart */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">Ventes par mois (sur {nMonths} mois)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={ventesParMois}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="nb_vendus" stroke="#C41E3A" strokeWidth={3} dot={{ r: 5 }} name="Ventes" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top types */}
            {topTypes.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-700 mb-4">Top 20 types moteur vendus</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topTypes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="type_moteur" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="nb_vendus" fill="#8B1A2B" radius={[6, 6, 0, 0]} name="Ventes" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top marques */}
            {topMarques.length > 0 && piece === "moteurs" && (
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-700 mb-4">Top 15 marques vendues</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topMarques}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="marque" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="nb_vendus" fill="#2563EB" radius={[6, 6, 0, 0]} name="Ventes" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Detail table */}
          <details className="bg-white rounded-2xl shadow-sm">
            <summary className="px-6 py-4 cursor-pointer font-semibold text-gray-700 hover:bg-gray-50 rounded-2xl">
              Voir le detail des ventes par mois
            </summary>
            <div className="px-6 pb-4">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                  <tr><th className="px-3 py-2 text-left">Mois</th><th className="px-3 py-2 text-right">Ventes</th><th className="px-3 py-2 text-right">CA (EUR)</th></tr>
                </thead>
                <tbody className="divide-y">
                  {ventesParMois.map((r) => (
                    <tr key={r.mois} className="hover:bg-gray-50">
                      <td className="px-3 py-2">{r.mois}</td>
                      <td className="px-3 py-2 text-right font-semibold">{r.nb_vendus.toLocaleString("fr-FR")}</td>
                      <td className="px-3 py-2 text-right">{r.ca.toLocaleString("fr-FR")} EUR</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
