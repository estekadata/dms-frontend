"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type BoiteRaw = {
  n_bv: number;
  num_interne_bv: string | null;
  ref_bv: string | null;
  achat_bv: number | null;
  prix_vte_bv: number | null;
  resa_client_bv: string | null;
  date_resa_bv: string | null;
  stock: boolean | null;
  vendu: boolean | null;
};

type Boite = {
  n_bv: number;
  num_interne_bv: string | null;
  ref_bv: string | null;
  achat_bv: number | null;
  prix_vte_bv: number | null;
  statut: string;
  resa_client_bv: string | null;
  date_resa_bv: string | null;
};

function StatutBadge({ statut }: { statut: string }) {
  if (statut === "Disponible")
    return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Disponible</Badge>;
  if (statut === "Réservée")
    return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Réservée</Badge>;
  if (statut === "Vendue")
    return <Badge className="bg-red-100 text-red-600 hover:bg-red-100">Vendue</Badge>;
  return <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100">{statut || "—"}</Badge>;
}

export default function BoitesPage() {
  const [search, setSearch] = useState("");
  const [statut, setStatut] = useState("Tous");
  const [boites, setBoites] = useState<Boite[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [client, setClient] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("tbl_boites")
        .select("n_bv, num_interne_bv, ref_bv, achat_bv, prix_vte_bv, resa_client_bv, date_resa_bv, stock, vendu")
        .order("n_bv", { ascending: false })
        .limit(500);

      if (search) {
        query = query.or(`ref_bv.ilike.%${search}%,num_interne_bv.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) {
        toast.error("Erreur : " + error.message);
        setLoading(false);
        return;
      }

      const rows: Boite[] = ((data as BoiteRaw[]) || [])
        .map((b) => {
          let s = "Disponible";
          if (b.vendu) s = "Vendue";
          else if (b.resa_client_bv?.trim()) s = "Réservée";
          else if (!b.stock) s = "Hors stock";

          if (statut !== "Tous") {
            if (statut === "Disponible" && s !== "Disponible") return null;
            if (statut === "Réservé" && s !== "Réservée") return null;
            if (statut === "Vendu" && s !== "Vendue") return null;
          }

          return {
            n_bv: b.n_bv,
            num_interne_bv: b.num_interne_bv,
            ref_bv: b.ref_bv,
            achat_bv: b.achat_bv,
            prix_vte_bv: b.prix_vte_bv,
            statut: s,
            resa_client_bv: b.resa_client_bv,
            date_resa_bv: b.date_resa_bv,
          };
        })
        .filter(Boolean) as Boite[];

      setBoites(rows);
    } catch (err: unknown) {
      toast.error("Erreur inattendue : " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, [search, statut]);

  useEffect(() => {
    load();
  }, [load]);

  const nbDispo = boites.filter((b) => b.statut === "Disponible").length;
  const nbReserve = boites.filter((b) => b.statut === "Réservée").length;
  const nbVendu = boites.filter((b) => b.statut === "Vendue").length;
  const disponibles = boites.filter((b) => b.statut === "Disponible");

  async function handleReserver() {
    if (!selectedId || !client.trim()) {
      toast.warning("Sélectionnez une boîte et saisissez un nom client.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tbl_boites")
        .update({ resa_client_bv: client.trim(), date_resa_bv: new Date().toISOString() })
        .eq("n_bv", selectedId);
      if (error) {
        toast.error("Erreur : " + error.message);
        return;
      }
      toast.success(`Boîte réservée pour ${client.trim()}`);
      setSelectedId("");
      setClient("");
      load();
    } catch (err: unknown) {
      toast.error("Erreur inattendue : " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Identification Boîtes de vitesse" icon="⚙️" description="Recherche et consultation du stock BV" />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          placeholder="Réf BV, num interne..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option>Tous</option>
          <option>Disponible</option>
          <option>Réservé</option>
          <option>Vendu</option>
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {([
          ["Résultats", boites.length, "text-[#C41E3A]"],
          ["Disponibles", nbDispo, "text-emerald-600"],
          ["Réservées", nbReserve, "text-amber-600"],
          ["Vendues", nbVendu, "text-red-600"],
        ] as const).map(([label, val, cls]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 font-semibold uppercase">{label}</p>
              <p className={`text-2xl font-bold ${cls}`}>{val}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Data Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  {["N°", "Num interne", "Réf BV", "Prix achat", "Prix vente", "Statut", "Client résa", "Date résa"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {boites.map((b) => (
                  <tr key={b.n_bv} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{b.n_bv}</td>
                    <td className="px-4 py-3 text-gray-600">{b.num_interne_bv || "—"}</td>
                    <td className="px-4 py-3 font-semibold">{b.ref_bv || "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-right">
                      {b.achat_bv ? `${Math.round(b.achat_bv).toLocaleString("fr-FR")} €` : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-right">
                      {b.prix_vte_bv ? `${Math.round(b.prix_vte_bv).toLocaleString("fr-FR")} €` : "—"}
                    </td>
                    <td className="px-4 py-3"><StatutBadge statut={b.statut} /></td>
                    <td className="px-4 py-3 text-gray-600">{b.resa_client_bv || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {b.date_resa_bv ? new Date(b.date_resa_bv).toLocaleDateString("fr-FR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {boites.length === 0 && (
            <p className="text-center py-10 text-gray-400">Aucune boîte trouvée</p>
          )}
        </div>
      )}

      {/* Reservation Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Réserver une boîte de vitesse</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label className="mb-1 block text-sm">Boîte disponible</Label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : "")}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">— Sélectionner —</option>
              {disponibles.map((b) => (
                <option key={b.n_bv} value={b.n_bv}>
                  {b.n_bv} — {b.ref_bv || b.num_interne_bv || "Sans réf"}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <Label className="mb-1 block text-sm">Nom du client</Label>
            <Input placeholder="Nom client..." value={client} onChange={(e) => setClient(e.target.value)} />
          </div>
          <Button
            onClick={handleReserver}
            disabled={saving || !selectedId || !client.trim()}
            className="bg-[#C41E3A] hover:bg-[#a01830] text-white"
          >
            {saving ? "En cours..." : "Réserver"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
