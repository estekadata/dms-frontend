"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

type Tab = "Stock" | "Prix" | "Tendances" | "Offres";

const COLORS = ["#C41E3A", "#8B1A2B", "#E8526A", "#F4A0B0", "#2563EB", "#16A34A", "#D97706", "#7C3AED", "#0891B2", "#DC2626", "#4F46E5", "#059669"];

/* ────────── STOCK TAB ────────── */
function StockTab() {
  const [topMarques, setTopMarques] = useState<{ name: string; value: number }[]>([]);
  const [byEnergie, setByEnergie] = useState<{ name: string; value: number }[]>([]);
  const [evolution, setEvolution] = useState<{ mois: string; entrees: number; sorties: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // Stock repartition via RPC (no row limit)
      const { data: repartition } = await supabase.rpc("get_stock_repartition");

      const byMarqueMap: Record<string, number> = {};
      const byEnergieMap: Record<string, number> = {};
      (repartition || []).forEach((r: any) => {
        byMarqueMap[r.marque] = (byMarqueMap[r.marque] || 0) + Number(r.count);
        byEnergieMap[r.energie] = (byEnergieMap[r.energie] || 0) + Number(r.count);
      });

      setTopMarques(
        Object.entries(byMarqueMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([name, value]) => ({ name, value }))
      );
      setByEnergie(Object.entries(byEnergieMap).map(([name, value]) => ({ name, value })));

      // Stock evolution: entries/exits by month (RPC - no row limit)
      const { data: evoData } = await supabase.rpc("get_stock_evolution", { p_months: 12 });
      setEvolution((evoData || []).map((r: any) => ({ mois: r.mois, entrees: Number(r.entrees), sorties: Number(r.sorties) })));
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="text-center py-16 text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 15 marques */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4">Stock disponible par marque (Top 15)</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={topMarques} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#C41E3A" radius={[0, 4, 4, 0]} name="Disponibles" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie by energy */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4">Repartition par energie</h3>
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={byEnergie}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={120}
                label={(props: any) => `${props.name || ""} ${((props.percent || 0) * 100).toFixed(0)}%`}
              >
                {byEnergie.map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stock evolution */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-4">Evolution du stock : entrees / sorties par mois</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={evolution}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="entrees" fill="#2563EB" radius={[4, 4, 0, 0]} name="Entrees" />
            <Bar dataKey="sorties" fill="#C41E3A" radius={[4, 4, 0, 0]} name="Sorties" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ────────── PRIX TAB ────────── */
function PrixTab() {
  const [period, setPeriod] = useState(12);
  const [energieFilter, setEnergieFilter] = useState("");
  const [marqueFilter, setMarqueFilter] = useState("");
  const [energies, setEnergies] = useState<string[]>([]);
  const [marques, setMarques] = useState<string[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Load filter options
  useEffect(() => {
    async function loadFilters() {
      // Use stock repartition RPC to get distinct values (no row limit)
      const { data } = await supabase.rpc("get_stock_repartition");
      const eSet = new Set<string>();
      const mSet = new Set<string>();
      (data || []).forEach((d: any) => {
        if (d.energie && d.energie !== 'Inconnu') eSet.add(d.energie);
        if (d.marque && d.marque !== 'Inconnu') mSet.add(d.marque);
      });
      setEnergies([...eSet].sort());
      setMarques([...mSet].sort());
    }
    loadFilters();
  }, []);

  // Load price data
  useEffect(() => {
    async function loadPrices() {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_prix_evolution", {
        p_months: period,
        p_energie: energieFilter || "",
        p_marque: marqueFilter || "",
      });
      if (!error && data) {
        setChartData((data as any[]).map((r) => ({
          mois: r.mois,
          prixAchatMoyen: r.prix_achat_moy ? Number(r.prix_achat_moy) : null,
          prixVenteMoyen: r.prix_vente_moy ? Number(r.prix_vente_moy) : null,
          nbAchats: Number(r.nb_achats),
          nbVentes: Number(r.nb_ventes),
        })));
      }
      setLoading(false);
    }
    loadPrices();
  }, [period, energieFilter, marqueFilter]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-4">Filtres</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Periode : {period} mois</label>
            <input
              type="range"
              min={3}
              max={36}
              value={period}
              onChange={(e) => setPeriod(+e.target.value)}
              className="w-full accent-[#C41E3A]"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>3 mois</span>
              <span>36 mois</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Energie</label>
            <select
              value={energieFilter}
              onChange={(e) => setEnergieFilter(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Toutes</option>
              {energies.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Marque</label>
            <select
              value={marqueFilter}
              onChange={(e) => setMarqueFilter(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Toutes</option>
              {marques.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Chargement...</div>
      ) : (
        <>
          {/* Line chart */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">Prix moyen achat vs vente par mois</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => `${Number(v).toLocaleString("fr-FR")} EUR`} />
                <Legend />
                <Line type="monotone" dataKey="prixAchatMoyen" stroke="#2563EB" strokeWidth={2} name="Prix achat moyen" dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="prixVenteMoyen" stroke="#C41E3A" strokeWidth={2} name="Prix vente moyen" dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Data table */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Mois</th>
                    <th className="px-4 py-3 text-right">Prix achat moy.</th>
                    <th className="px-4 py-3 text-right">Prix vente moy.</th>
                    <th className="px-4 py-3 text-right">Nb achats</th>
                    <th className="px-4 py-3 text-right">Nb ventes</th>
                    <th className="px-4 py-3 text-right">Marge moy.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {chartData.map((row) => {
                    const marge = row.prixAchatMoyen && row.prixVenteMoyen
                      ? Math.round(((row.prixVenteMoyen - row.prixAchatMoyen) / row.prixAchatMoyen) * 100)
                      : null;
                    return (
                      <tr key={row.mois} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{row.mois}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.prixAchatMoyen ? `${row.prixAchatMoyen.toLocaleString("fr-FR")} EUR` : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.prixVenteMoyen ? `${row.prixVenteMoyen.toLocaleString("fr-FR")} EUR` : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.nbAchats}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.nbVentes}</td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${marge !== null ? (marge >= 0 ? "text-emerald-600" : "text-red-600") : "text-gray-400"}`}>
                          {marge !== null ? `${marge}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ────────── TENDANCES TAB ────────── */
function TendancesTab() {
  const [windowSize, setWindowSize] = useState(3);
  const [minObs, setMinObs] = useState(3);
  const [movers, setMovers] = useState<{
    achatsHausse: any[];
    achatsBaisse: any[];
    ventesHausse: any[];
    ventesBaisse: any[];
  }>({ achatsHausse: [], achatsBaisse: [], ventesHausse: [], ventesBaisse: [] });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - windowSize * 2);

      // Use RPC to get pre-aggregated tendances (no row limit)
      const { data: tendData } = await supabase.rpc("get_tendances_prix", { p_window_months: windowSize, p_min_obs: minObs });

      const achatsHausse: any[] = [];
      const achatsBaisse: any[] = [];
      const ventesHausse: any[] = [];
      const ventesBaisse: any[] = [];

      (tendData || []).forEach((r: any) => {
        const entry = {
          code: r.nom_type_moteur,
          recentAvg: Number(r.recent_avg),
          oldAvg: Number(r.old_avg),
          delta: Number(r.delta_pct),
          count: Number(r.recent_count) + Number(r.old_count),
        };
        if (r.source === "achat") {
          if (entry.delta > 0) achatsHausse.push(entry);
          else achatsBaisse.push(entry);
        } else {
          if (entry.delta > 0) ventesHausse.push(entry);
          else ventesBaisse.push(entry);
        }
      });

      achatsHausse.sort((a, b) => b.delta - a.delta);
      achatsBaisse.sort((a, b) => a.delta - b.delta);
      ventesHausse.sort((a, b) => b.delta - a.delta);
      ventesBaisse.sort((a, b) => a.delta - b.delta);

      setMovers({ achatsHausse, achatsBaisse, ventesHausse, ventesBaisse });
      setLoading(false);
    }
    load();
  }, [windowSize, minObs]);

  async function loadDetail(code: string) {
    if (expanded === code) { setExpanded(null); return; }
    setExpanded(code);
    const { data } = await supabase
      .from("v_moteurs_dispo")
      .select("date_entree_stock, prix_achat_moteur")
      .ilike("nom_type_moteur", `${code}%`)
      .not("prix_achat_moteur", "is", null)
      .order("date_entree_stock", { ascending: true })
      .limit(100);

    const byMonth: Record<string, number[]> = {};
    (data || []).forEach((d: any) => {
      const k = d.date_entree_stock?.substring(0, 7) || "";
      if (!k) return;
      if (!byMonth[k]) byMonth[k] = [];
      byMonth[k].push(d.prix_achat_moteur);
    });
    setDetailData(
      Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mois, prices]) => ({
          mois,
          prixMoyen: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
          nb: prices.length,
        }))
    );
  }

  function MoverSection({ title, items, color }: { title: string; items: any[]; color: string }) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h4 className={`font-semibold mb-3 ${color}`}>{title} ({items.length})</h4>
        {items.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun mouvement significatif</p>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 10).map((item) => (
              <div key={item.code}>
                <button
                  onClick={() => loadDetail(item.code)}
                  className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 transition"
                >
                  <span className="font-mono font-semibold text-sm">{item.code}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">{item.oldAvg} EUR &rarr; {item.recentAvg} EUR</span>
                    <span className={`text-sm font-bold ${item.delta > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {item.delta > 0 ? "+" : ""}{item.delta}%
                    </span>
                    <span className="text-xs text-gray-400">({item.count} obs.)</span>
                  </div>
                </button>
                {expanded === item.code && detailData.length > 0 && (
                  <div className="ml-4 mt-2 mb-3 bg-gray-50 rounded-xl p-4">
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={detailData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: any) => `${v} EUR`} />
                        <Line type="monotone" dataKey="prixMoyen" stroke="#C41E3A" strokeWidth={2} dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Fenetre de comparaison</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 6].map((w) => (
                <button
                  key={w}
                  onClick={() => setWindowSize(w)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    windowSize === w ? "bg-[#C41E3A] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {w} mois
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Observations minimum</label>
            <div className="flex gap-2">
              {[2, 3, 5, 8, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setMinObs(n)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    minObs === n ? "bg-[#C41E3A] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Chargement...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MoverSection title="Achats en hausse" items={movers.achatsHausse} color="text-red-700" />
          <MoverSection title="Achats en baisse" items={movers.achatsBaisse} color="text-emerald-700" />
          <MoverSection title="Ventes en hausse" items={movers.ventesHausse} color="text-red-700" />
          <MoverSection title="Ventes en baisse" items={movers.ventesBaisse} color="text-emerald-700" />
        </div>
      )}
    </div>
  );
}

/* ────────── OFFRES TAB ────────── */
function OffresTab() {
  const [clickOffers, setClickOffers] = useState<any[]>([]);
  const [freeOffers, setFreeOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadOffers() {
    setLoading(true);
    const [{ data: clicks }, { data: frees }] = await Promise.all([
      supabase
        .from("breaker_click_offers")
        .select("*, breakers(name)")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("breaker_free_offers")
        .select("*, breakers(name)")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    setClickOffers(clicks || []);
    setFreeOffers(frees || []);
    setLoading(false);
  }

  useEffect(() => { loadOffers(); }, []);

  async function handleDeleteClick(id: number) {
    if (!confirm("Supprimer cette offre ?")) return;
    await supabase.from("breaker_click_offers").delete().eq("id", id);
    setClickOffers((prev) => prev.filter((o) => o.id !== id));
  }

  async function handleValidateClick(offer: any) {
    if (!confirm("Valider et ajouter au stock ?")) return;
    const { error } = await supabase.from("tbl_moteurs").insert({
      code_moteur: offer.code_moteur,
      prix_achat_moteur: offer.prix_demande,
      observations: "Achat VHU " + (offer.breakers?.name || "") + " " + (offer.note || ""),
    });
    if (error) { alert("Erreur: " + error.message); return; }
    await supabase.from("breaker_click_offers").delete().eq("id", offer.id);
    setClickOffers((prev) => prev.filter((o) => o.id !== offer.id));
    alert("Moteur ajoute au stock !");
  }

  async function handleDeleteFree(id: number) {
    if (!confirm("Supprimer cette offre ?")) return;
    await supabase.from("breaker_free_offers").delete().eq("id", id);
    setFreeOffers((prev) => prev.filter((o) => o.id !== id));
  }

  async function handleValidateFree(offer: any) {
    if (!confirm("Valider et ajouter au stock ?")) return;
    const { error } = await supabase.from("tbl_moteurs").insert({
      code_moteur: offer.code_moteur || offer.texte || "",
      prix_achat_moteur: offer.prix_demande,
      observations: "Achat VHU " + (offer.breakers?.name || "") + " " + (offer.note || ""),
    });
    if (error) { alert("Erreur: " + error.message); return; }
    await supabase.from("breaker_free_offers").delete().eq("id", offer.id);
    setFreeOffers((prev) => prev.filter((o) => o.id !== offer.id));
    alert("Moteur ajoute au stock !");
  }

  async function handleClearAllClicks() {
    if (!confirm("Supprimer toutes les offres click ?")) return;
    const ids = clickOffers.map((o) => o.id);
    await supabase.from("breaker_click_offers").delete().in("id", ids);
    setClickOffers([]);
  }

  async function handleClearAllFrees() {
    if (!confirm("Supprimer toutes les offres libres ?")) return;
    const ids = freeOffers.map((o) => o.id);
    await supabase.from("breaker_free_offers").delete().in("id", ids);
    setFreeOffers([]);
  }

  if (loading) return <div className="text-center py-16 text-gray-400">Chargement...</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700">Offres click ({clickOffers.length})</h3>
          {clickOffers.length > 0 && (
            <button onClick={handleClearAllClicks} className="text-xs text-red-500 hover:text-red-700 font-medium">Tout effacer</button>
          )}
        </div>
        {clickOffers.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune offre click</p>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {clickOffers.map((o) => (
              <div key={o.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-semibold text-sm">{o.code_moteur || "—"}</span>
                  <span className="text-sm font-bold text-[#C41E3A]">{o.prix_demande ? o.prix_demande + " EUR" : "—"}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <span>{o.breakers?.name || "Centre inconnu"} {o.qty > 1 ? "x" + o.qty : ""}</span>
                  <span>{o.created_at ? new Date(o.created_at).toLocaleDateString("fr-FR") : ""}</span>
                </div>
                {o.note && <p className="text-xs text-gray-400 mb-2">{o.note}</p>}
                <div className="flex gap-2">
                  <button onClick={() => handleValidateClick(o)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium py-1.5 px-3 rounded-lg">Valider (stock)</button>
                  <button onClick={() => handleDeleteClick(o.id)} className="flex-1 bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-600 text-xs font-medium py-1.5 px-3 rounded-lg">Effacer</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700">Offres libres ({freeOffers.length})</h3>
          {freeOffers.length > 0 && (
            <button onClick={handleClearAllFrees} className="text-xs text-red-500 hover:text-red-700 font-medium">Tout effacer</button>
          )}
        </div>
        {freeOffers.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune offre libre</p>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {freeOffers.map((o) => (
              <div key={o.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-semibold text-sm">{o.code_moteur || o.texte || "—"}</span>
                  <span className="text-sm font-bold text-[#C41E3A]">{o.prix_demande ? o.prix_demande + " EUR" : "—"}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <span>{o.breakers?.name || "Centre inconnu"}</span>
                  <span>{o.created_at ? new Date(o.created_at).toLocaleDateString("fr-FR") : ""}</span>
                </div>
                {o.note && <p className="text-xs text-gray-400 mb-2">{o.note}</p>}
                <div className="flex gap-2">
                  <button onClick={() => handleValidateFree(o)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium py-1.5 px-3 rounded-lg">Valider (stock)</button>
                  <button onClick={() => handleDeleteFree(o.id)} className="flex-1 bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-600 text-xs font-medium py-1.5 px-3 rounded-lg">Effacer</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────── MAIN PAGE ────────── */
export default function AnalysePage() {
  const [tab, setTab] = useState<Tab>("Stock");

  return (
    <div>
      <PageHeader title="Analyse avancee" icon="📊" description="Statistiques detaillees du stock et des ventes" />

      <div className="flex bg-white rounded-lg shadow-sm border overflow-hidden mb-6 w-fit">
        {(["Stock", "Prix", "Tendances", "Offres"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium transition ${
              tab === t ? "bg-[#C41E3A] text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Stock" && <StockTab />}
      {tab === "Prix" && <PrixTab />}
      {tab === "Tendances" && <TendancesTab />}
      {tab === "Offres" && <OffresTab />}
    </div>
  );
}
