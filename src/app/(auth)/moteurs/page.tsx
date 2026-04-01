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

type Moteur = {
  n_moteur: number;
  code_moteur: string | null;
  num_serie: string | null;
  modele_saisi: string | null;
  prix_achat_moteur: number | null;
  marque: string | null;
  energie: string | null;
  statut: string;
  resa_client_moteur: string | null;
  fournisseur: string | null;
  date_achat: string | null;
};

function StatutBadge({ statut }: { statut: string }) {
  if (statut === "Disponible")
    return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Disponible</Badge>;
  if (statut === "Réservé")
    return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Réservé</Badge>;
  if (statut === "Vendu")
    return <Badge className="bg-red-100 text-red-600 hover:bg-red-100">Vendu</Badge>;
  return <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100">{statut || "—"}</Badge>;
}

export default function MoteursPage() {
  const [search, setSearch] = useState("");
  const [statut, setStatut] = useState("Tous");
  const [marque, setMarque] = useState("");
  const [energie, setEnergie] = useState("");
  const [moteurs, setMoteurs] = useState<Moteur[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [client, setClient] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("search_moteurs", {
        p_search: search || '',
        p_statut: statut === "Tous" ? '' : statut,
        p_limit: 500,
      });
      if (error) {
        toast.error("Erreur de chargement : " + error.message);
        setLoading(false);
        return;
      }
      let rows: Moteur[] = data || [];
      if (marque) rows = rows.filter((m) => (m.marque || "").toLowerCase().includes(marque.toLowerCase()));
      if (energie) rows = rows.filter((m) => (m.energie || "").toLowerCase().includes(energie.toLowerCase()));
      setMoteurs(rows);
    } catch (err: unknown) {
      toast.error("Erreur inattendue : " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, [search, statut, marque, energie]);

  useEffect(() => {
    load();
  }, [load]);

  const nbDispo = moteurs.filter((m) => m.statut === "Disponible").length;
  const nbReserve = moteurs.filter((m) => m.statut === "Réservé").length;
  const nbVendu = moteurs.filter((m) => m.statut === "Vendu").length;
  const disponibles = moteurs.filter((m) => m.statut === "Disponible");

  async function handleReserver() {
    if (!selectedId || !client.trim()) {
      toast.warning("Sélectionnez un moteur et saisissez un nom client.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tbl_moteurs")
        .update({ resa_client_moteur: client.trim(), date_resa_moteur: new Date().toISOString() })
        .eq("n_moteur", selectedId);
      if (error) {
        toast.error("Erreur : " + error.message);
        return;
      }
      toast.success(`Moteur réservé pour ${client.trim()}`);
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
      <PageHeader title="Identification Moteurs" icon="🔍" description="Recherche et consultation du stock moteurs" />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          placeholder="Code, num série, modèle..."
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
        <Input
          placeholder="Marque..."
          value={marque}
          onChange={(e) => setMarque(e.target.value)}
          className="max-w-[150px]"
        />
        <Input
          placeholder="Énergie..."
          value={energie}
          onChange={(e) => setEnergie(e.target.value)}
          className="max-w-[150px]"
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {([
          ["Résultats", moteurs.length, "text-[#C41E3A]"],
          ["Disponibles", nbDispo, "text-emerald-600"],
          ["Réservés", nbReserve, "text-amber-600"],
          ["Vendus", nbVendu, "text-red-600"],
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
                  {["N°", "Code moteur", "Num série", "Modèle", "Marque", "Énergie", "Prix achat", "Statut", "Client résa", "Fournisseur", "Date achat"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {moteurs.map((m) => (
                  <tr key={m.n_moteur} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{m.n_moteur}</td>
                    <td className="px-4 py-3 font-semibold">{m.code_moteur || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{m.num_serie || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{m.modele_saisi || "—"}</td>
                    <td className="px-4 py-3">{m.marque || "—"}</td>
                    <td className="px-4 py-3">{m.energie || "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-right">
                      {m.prix_achat_moteur ? `${Math.round(m.prix_achat_moteur).toLocaleString("fr-FR")} €` : "—"}
                    </td>
                    <td className="px-4 py-3"><StatutBadge statut={m.statut} /></td>
                    <td className="px-4 py-3 text-gray-600">{m.resa_client_moteur || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{m.fournisseur || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {m.date_achat ? new Date(m.date_achat).toLocaleDateString("fr-FR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {moteurs.length === 0 && (
            <p className="text-center py-10 text-gray-400">Aucun moteur trouvé</p>
          )}
        </div>
      )}

      {/* Reservation Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Réserver un moteur</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label className="mb-1 block text-sm">Moteur disponible</Label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : "")}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">— Sélectionner —</option>
              {disponibles.map((m) => (
                <option key={m.n_moteur} value={m.n_moteur}>
                  {m.n_moteur} — {m.code_moteur || m.modele_saisi || "Sans code"} {m.marque ? `(${m.marque})` : ""}
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
