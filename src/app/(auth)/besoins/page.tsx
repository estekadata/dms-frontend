"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

type BesoinRaw = {
  code_moteur: string;
  marque: string | null;
  energie: string | null;
  nb_vendus_3m: number;
  nb_stock_dispo: number;
};

type Besoin = BesoinRaw & {
  score_urgence: number;
};

const TABS = ["En manque", "En surstock", "Tout voir"] as const;
type Tab = (typeof TABS)[number];

function scoreBadge(score: number) {
  if (score >= 1.0) return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Urgent</Badge>;
  if (score >= 0.5) return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Modere</Badge>;
  return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">OK</Badge>;
}

export default function BesoinsPage() {
  const [tab, setTab] = useState<Tab>("En manque");
  const [search, setSearch] = useState("");
  const [besoins, setBesoins] = useState<Besoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topN, setTopN] = useState(100);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase.rpc("get_besoins_moteurs", { p_limit: topN });
        if (err) throw err;
        if (cancelled) return;

        const computed: Besoin[] = (data || []).map((row: BesoinRaw) => ({
          ...row,
          score_urgence: parseFloat((row.nb_vendus_3m / (row.nb_stock_dispo + 1)).toFixed(2)),
        }));

        // Sort by score descending
        computed.sort((a, b) => b.score_urgence - a.score_urgence);
        setBesoins(computed);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Erreur lors du chargement");
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [topN]);

  const filtered = useMemo(() => {
    return besoins
      .filter((b) => {
        if (tab === "En manque") return b.score_urgence >= 1.0;
        if (tab === "En surstock") return b.nb_stock_dispo > 0 && b.score_urgence < 0.5;
        return true;
      })
      .filter((b) =>
        search
          ? b.code_moteur.toLowerCase().includes(search.toLowerCase()) ||
            (b.marque || "").toLowerCase().includes(search.toLowerCase())
          : true
      );
  }, [besoins, tab, search]);

  const chartData = useMemo(() => {
    return filtered.slice(0, 30).map((b) => ({
      code: b.code_moteur,
      score: b.score_urgence,
    }));
  }, [filtered]);

  const nbManque = besoins.filter((b) => b.score_urgence >= 1.0).length;
  const nbSurstock = besoins.filter((b) => b.nb_stock_dispo > 0 && b.score_urgence < 0.5).length;

  return (
    <div>
      <PageHeader title="Analyse des besoins" icon="Target" description="Besoins et surstock par reference moteur" />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">En manque</p>
            <p className="text-2xl font-bold text-red-600">{nbManque}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">En surstock</p>
            <p className="text-2xl font-bold text-amber-600">{nbSurstock}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Total references</p>
            <p className="text-2xl font-bold text-gray-700">{besoins.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Affichage (top N)</p>
            <p className="text-2xl font-bold text-gray-700">{topN}</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex bg-white rounded-lg shadow-sm border overflow-hidden">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition ${tab === t ? "bg-[#C41E3A] text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <Input
          placeholder="Filtrer par code ou marque..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-gray-500">Top N :</span>
          <input
            type="range"
            min={10}
            max={500}
            step={10}
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            className="w-32 accent-[#C41E3A]"
          />
          <span className="text-sm font-semibold text-gray-700 w-10 text-right">{topN}</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      ) : (
        <>
          {/* Chart */}
          {chartData.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
              <h3 className="font-semibold text-gray-700 mb-4">
                Score d&apos;urgence — {tab} (top {Math.min(30, filtered.length)})
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="code" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: any) => [Number(v).toFixed(2), "Score"]} />
                  <Bar
                    dataKey="score"
                    radius={[6, 6, 0, 0]}
                    name="Score urgence"
                    fill={tab === "En manque" ? "#dc2626" : tab === "En surstock" ? "#d97706" : "#6b7280"}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Code moteur</th>
                    <th className="px-4 py-3 text-left">Marque</th>
                    <th className="px-4 py-3 text-left">Energie</th>
                    <th className="px-4 py-3 text-center">Vendus (3 mois)</th>
                    <th className="px-4 py-3 text-center">Stock dispo</th>
                    <th className="px-4 py-3 text-center">Score urgence</th>
                    <th className="px-4 py-3 text-center">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((b) => (
                    <tr key={b.code_moteur} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold">{b.code_moteur}</td>
                      <td className="px-4 py-3 text-gray-600">{b.marque || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{b.energie || "—"}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{b.nb_vendus_3m}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{b.nb_stock_dispo}</td>
                      <td className="px-4 py-3 text-center tabular-nums font-semibold">{b.score_urgence.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">{scoreBadge(b.score_urgence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <p className="text-center py-10 text-gray-400">Aucun resultat</p>
            )}
            <div className="px-4 py-3 bg-gray-50 text-xs text-gray-500 border-t">
              {filtered.length} reference(s) affichee(s) sur {besoins.length} — Score = nb_vendus_3m / (nb_stock_dispo + 1)
            </div>
          </div>
        </>
      )}
    </div>
  );
}
