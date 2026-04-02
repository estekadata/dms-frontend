"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Besoin = {
  code_moteur: string;
  type_moteur: string;
  marque: string;
  energie: string;
  type_nom: string;
  type_modele: string;
  type_annee: string;
  nb_vendus_3m: number;
  nb_stock_dispo: number;
  prix_moy_achat_3m: number | null;
  delta: number;
};

type SortKey = "code_moteur" | "marque" | "energie" | "nb_vendus_3m" | "nb_stock_dispo" | "delta" | "prix_moy_achat_3m";
type SortDir = "asc" | "desc";

const TABS = ["En manque", "En surstock", "Tout voir"] as const;
type Tab = (typeof TABS)[number];

export default function BesoinsPage() {
  const [tab, setTab] = useState<Tab>("En manque");
  const [search, setSearch] = useState("");
  const [besoins, setBesoins] = useState<Besoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("delta");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Offres VHU
  const [clickOffers, setClickOffers] = useState<any[]>([]);
  const [freeOffers, setFreeOffers] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_besoins_moteurs", {
        p_limit: 2000,
      });

      if (!error && data) {
        setBesoins(
          (data as Omit<Besoin, "delta">[]).map((r) => ({
            ...r,
            delta: r.nb_stock_dispo - r.nb_vendus_3m,
          }))
        );
      } else {
        console.error("get_besoins_moteurs error:", error);
        setBesoins([]);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Load recent offers from VHU
  useEffect(() => {
    async function loadOffers() {
      const { data: clicks } = await supabase
        .from("breaker_click_offers")
        .select("*, breakers(name)")
        .order("created_at", { ascending: false })
        .limit(20);
      setClickOffers(clicks || []);

      const { data: frees } = await supabase
        .from("breaker_free_offers")
        .select("*, breakers(name)")
        .order("created_at", { ascending: false })
        .limit(20);
      setFreeOffers(frees || []);
    }
    loadOffers();
  }, []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "delta" ? "asc" : "desc");
    }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return " \u2195";
    return sortDir === "asc" ? " \u2191" : " \u2193";
  }

  const filtered = useMemo(() => {
    const list = besoins
      .filter((b) => {
        if (tab === "En manque") return b.delta < 0;
        if (tab === "En surstock") return b.delta > 2;
        return true;
      })
      .filter((b) =>
        search
          ? b.code_moteur.toLowerCase().includes(search.toLowerCase()) ||
            b.marque?.toLowerCase().includes(search.toLowerCase()) ||
            b.type_nom?.toLowerCase().includes(search.toLowerCase())
          : true
      );

    return [...list].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [besoins, tab, search, sortKey, sortDir]);

  const nbManque = besoins.filter((b) => b.delta < 0).length;
  const nbSurstock = besoins.filter((b) => b.delta > 2).length;

  const thClass = "px-4 py-3 cursor-pointer hover:bg-gray-100 select-none transition";

  return (
    <div>
      <PageHeader
        title="Analyse des besoins"
        icon="&#127919;"
        description="Besoins et surstock par reference moteur (ventes 6 derniers mois vs stock dispo)"
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">En manque</p>
            <p className="text-2xl font-bold text-red-600">{nbManque}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">En surstock</p>
            <p className="text-2xl font-bold text-blue-600">{nbSurstock}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Total references</p>
            <p className="text-2xl font-bold text-gray-700">{besoins.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex bg-white rounded-lg shadow-sm border overflow-hidden">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition ${
                tab === t ? "bg-[#C41E3A] text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <Input
          placeholder="Filtrer par code, marque, type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className={`${thClass} text-left`} onClick={() => toggleSort("code_moteur")}>
                    Code moteur{sortIcon("code_moteur")}
                  </th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className={`${thClass} text-left`} onClick={() => toggleSort("marque")}>
                    Marque{sortIcon("marque")}
                  </th>
                  <th className={`${thClass} text-left`} onClick={() => toggleSort("energie")}>
                    Energie{sortIcon("energie")}
                  </th>
                  <th className={`${thClass} text-center`} onClick={() => toggleSort("nb_vendus_3m")}>
                    Vendus (6 mois){sortIcon("nb_vendus_3m")}
                  </th>
                  <th className={`${thClass} text-center`} onClick={() => toggleSort("nb_stock_dispo")}>
                    Stock dispo{sortIcon("nb_stock_dispo")}
                  </th>
                  <th className={`${thClass} text-center`} onClick={() => toggleSort("delta")}>
                    Delta{sortIcon("delta")}
                  </th>
                  <th className={`${thClass} text-right`} onClick={() => toggleSort("prix_moy_achat_3m")}>
                    Prix moy. achat{sortIcon("prix_moy_achat_3m")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((b) => (
                  <tr key={b.code_moteur} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold">{b.code_moteur}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[300px] truncate">{b.type_moteur || "\u2014"}</td>
                    <td className="px-4 py-3 text-gray-600">{b.marque || "\u2014"}</td>
                    <td className="px-4 py-3 text-gray-600">{b.energie || "\u2014"}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{b.nb_vendus_3m}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{b.nb_stock_dispo}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        className={
                          b.delta < 0
                            ? "bg-red-100 text-red-700 hover:bg-red-100"
                            : b.delta > 2
                            ? "bg-blue-100 text-blue-700 hover:bg-blue-100"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-100"
                        }
                      >
                        {b.delta > 0 ? `+${b.delta}` : b.delta}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {b.prix_moy_achat_3m != null ? `${b.prix_moy_achat_3m.toFixed(0)} \u20AC` : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <p className="text-center py-10 text-gray-400">Aucun resultat</p>
          )}
        </div>
      )}

      {/* Offres VHU recentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold text-gray-700 mb-4">Offres click recentes ({clickOffers.length})</h3>
            {clickOffers.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune offre click</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {clickOffers.map((o: any) => (
                  <div key={o.id} className="border rounded-lg p-3 text-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono font-bold">{o.code_moteur}</span>
                        <span className="ml-2 text-gray-500">{o.breakers?.name || "Centre inconnu"}</span>
                      </div>
                      <span className="font-semibold text-[#C41E3A]">{o.prix} EUR</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Qte: {o.quantite || 1} {o.note && `- ${o.note}`} - {new Date(o.created_at).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold text-gray-700 mb-4">Offres libres recentes ({freeOffers.length})</h3>
            {freeOffers.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune offre libre</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {freeOffers.map((o: any) => (
                  <div key={o.id} className="border rounded-lg p-3 text-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono font-bold">{o.code_moteur || o.description}</span>
                        <span className="ml-2 text-gray-500">{o.breakers?.name || "Centre inconnu"}</span>
                      </div>
                      {o.prix && <span className="font-semibold text-[#C41E3A]">{o.prix} EUR</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {o.description && o.code_moteur && <span>{o.description} - </span>}
                      {o.note && `${o.note} - `}{new Date(o.created_at).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
