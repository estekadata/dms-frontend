"use client";
import { useState, useEffect } from "react";
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

const TABS = ["En manque", "En surstock", "Tout voir"] as const;
type Tab = (typeof TABS)[number];

export default function BesoinsPage() {
  const [tab, setTab] = useState<Tab>("En manque");
  const [search, setSearch] = useState("");
  const [besoins, setBesoins] = useState<Besoin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_besoins_moteurs", {
        p_limit: 500,
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

  const filtered = besoins
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

  const nbManque = besoins.filter((b) => b.delta < 0).length;
  const nbSurstock = besoins.filter((b) => b.delta > 2).length;

  return (
    <div>
      <PageHeader
        title="Analyse des besoins"
        description="Besoins et surstock par référence moteur (ventes 3 derniers mois vs stock dispo)"
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-dim font-semibold uppercase">En manque</p>
            <p className="text-2xl font-bold text-red-600">{nbManque}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-dim font-semibold uppercase">En surstock</p>
            <p className="text-2xl font-bold text-blue-600">{nbSurstock}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-dim font-semibold uppercase">Total références</p>
            <p className="text-2xl font-bold text-foreground">{besoins.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex bg-surface-alt rounded-lg border border-border overflow-hidden">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-all ${
                tab === t
                  ? "bg-brand text-white"
                  : "text-text-dim hover:bg-surface-hover"
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
          className="max-w-xs bg-surface-alt border-border text-foreground placeholder:text-text-muted"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-text-muted">Chargement...</div>
      ) : (
        <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-text-dim text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Code moteur</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Marque</th>
                  <th className="px-4 py-3 text-left">Énergie</th>
                  <th className="px-4 py-3 text-center">Vendus (3 mois)</th>
                  <th className="px-4 py-3 text-center">Stock dispo</th>
                  <th className="px-4 py-3 text-center">Delta</th>
                  <th className="px-4 py-3 text-right">Prix moy. achat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((b) => (
                  <tr key={b.code_moteur} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground">{b.code_moteur}</td>
                    <td className="px-4 py-3 text-text-dim">{b.type_moteur || "—"}</td>
                    <td className="px-4 py-3 text-text-dim">{b.marque || "—"}</td>
                    <td className="px-4 py-3 text-text-dim">{b.energie || "—"}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-text-dim">{b.nb_vendus_3m}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-text-dim">{b.nb_stock_dispo}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        className={
                          b.delta < 0
                            ? "bg-[rgba(248,113,113,0.10)] text-red-600 border border-[rgba(248,113,113,0.20)] hover:bg-[rgba(248,113,113,0.15)]"
                            : b.delta > 2
                            ? "bg-[rgba(96,165,250,0.10)] text-blue-600 border border-[rgba(96,165,250,0.20)] hover:bg-[rgba(96,165,250,0.15)]"
                            : "bg-[rgba(90,100,120,0.10)] text-text-muted border border-[rgba(90,100,120,0.20)] hover:bg-[rgba(90,100,120,0.15)]"
                        }
                      >
                        {b.delta > 0 ? `+${b.delta}` : b.delta}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-dim">
                      {b.prix_moy_achat_3m != null
                        ? `${b.prix_moy_achat_3m.toFixed(0)} €`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <p className="text-center py-10 text-text-muted italic">Aucun résultat</p>
          )}
        </div>
      )}
    </div>
  );
}
