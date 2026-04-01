"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type MoteurRow = {
  n_moteur: number;
  code_moteur: string | null;
  nom_type_moteur?: string | null;
  num_serie: string | null;
  modele_saisi: string | null;
  prix_achat_moteur: number | null;
  resa_client_moteur: string;
  date_resa_moteur: string | null;
  marque?: string | null;
};

type BoiteRow = {
  n_bv: number;
  ref_bv: string | null;
  num_interne_bv: string | null;
  resa_client_bv: string;
  date_resa_bv: string | null;
};

type AvailMoteur = {
  n_moteur: number;
  code_moteur: string | null;
  nom_type_moteur?: string | null;
  modele_saisi: string | null;
  marque: string | null;
};

type AvailBoite = {
  n_bv: number;
  ref_bv: string | null;
  num_interne_bv: string | null;
};

function ReservationBadge() {
  return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Réservé</Badge>;
}

/* ─────────── Moteurs Tab ─────────── */
function MoteursTab() {
  const [reserved, setReserved] = useState<MoteurRow[]>([]);
  const [available, setAvailable] = useState<AvailMoteur[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchNew, setSearchNew] = useState("");
  const [clientNew, setClientNew] = useState("");
  const [selectedNew, setSelectedNew] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resaRes, dispoRes] = await Promise.all([
        supabase
          .from("v_moteurs_dispo")
          .select("n_moteur, code_moteur, num_serie, modele_saisi, prix_achat_moteur, resa_client_moteur, date_resa_moteur, nom_type_moteur")
          .not("resa_client_moteur", "is", null)
          .neq("resa_client_moteur", "")
          .is("n_expedition", null)
          .order("date_resa_moteur", { ascending: false }),
        supabase
          .from("v_moteurs_dispo")
          .select("n_moteur, code_moteur, modele_saisi, marque, nom_type_moteur")
          .is("resa_client_moteur", null)
          .is("n_expedition", null)
          .order("n_moteur", { ascending: false })
          .limit(300),
      ]);
      if (resaRes.error) toast.error("Erreur chargement réservations : " + resaRes.error.message);
      if (dispoRes.error) toast.error("Erreur chargement disponibles : " + dispoRes.error.message);
      setReserved((resaRes.data as unknown as MoteurRow[]) || []);
      setAvailable((dispoRes.data as unknown as AvailMoteur[]) || []);
    } catch (err: unknown) {
      toast.error("Erreur inattendue : " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredAvail = available.filter(
    (m) => !searchNew || [m.nom_type_moteur, m.code_moteur, m.modele_saisi, m.marque].some((v) => (v || "").toLowerCase().includes(searchNew.toLowerCase()))
  );

  async function handleReserver() {
    if (!selectedNew || !clientNew.trim()) {
      toast.warning("Sélectionnez un moteur et saisissez un client.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tbl_moteurs")
        .update({ resa_client_moteur: clientNew.trim(), date_resa_moteur: new Date().toISOString() })
        .eq("n_moteur", selectedNew);
      if (error) {
        toast.error("Erreur : " + error.message);
        return;
      }
      toast.success(`Moteur réservé pour ${clientNew.trim()}`);
      setSelectedNew("");
      setClientNew("");
      load();
    } catch (err: unknown) {
      toast.error("Erreur inattendue : " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  async function handleAnnuler(id: number) {
    setCancellingId(id);
    try {
      const { error } = await supabase
        .from("tbl_moteurs")
        .update({ resa_client_moteur: null, date_resa_moteur: null })
        .eq("n_moteur", id);
      if (error) {
        toast.error("Erreur : " + error.message);
        return;
      }
      toast.success("Réservation annulée.");
      load();
    } catch (err: unknown) {
      toast.error("Erreur inattendue : " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* New reservation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nouvelle réservation moteur</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="min-w-[180px]">
            <Label className="mb-1 block text-sm">Rechercher</Label>
            <Input placeholder="Code, modèle..." value={searchNew} onChange={(e) => setSearchNew(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <Label className="mb-1 block text-sm">Moteur disponible</Label>
            <select
              value={selectedNew}
              onChange={(e) => setSelectedNew(e.target.value ? Number(e.target.value) : "")}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">— Sélectionner —</option>
              {filteredAvail.map((m) => (
                <option key={m.n_moteur} value={m.n_moteur}>
                  {m.n_moteur} — {m.nom_type_moteur || m.code_moteur || m.modele_saisi || "Sans code"} {m.marque ? `(${m.marque})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <Label className="mb-1 block text-sm">Nom du client</Label>
            <Input placeholder="Nom client..." value={clientNew} onChange={(e) => setClientNew(e.target.value)} />
          </div>
          <Button
            onClick={handleReserver}
            disabled={saving || !selectedNew || !clientNew.trim()}
            className="bg-[#C41E3A] hover:bg-[#a01830] text-white"
          >
            {saving ? "En cours..." : "Réserver"}
          </Button>
        </CardContent>
      </Card>

      {/* Current reservations table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-sm text-gray-700">
          Réservations en cours — {reserved.length} moteur(s)
        </div>
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  {["N°", "Code moteur", "Num série", "Modèle", "Prix achat", "Client", "Date résa", "Statut", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reserved.map((m) => (
                  <tr key={m.n_moteur} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{m.n_moteur}</td>
                    <td className="px-4 py-3 font-semibold">{m.nom_type_moteur || m.code_moteur || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{m.num_serie || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{m.modele_saisi || "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-right">
                      {m.prix_achat_moteur ? `${Math.round(m.prix_achat_moteur).toLocaleString("fr-FR")} €` : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium">{m.resa_client_moteur}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {m.date_resa_moteur ? new Date(m.date_resa_moteur).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="px-4 py-3"><ReservationBadge /></td>
                    <td className="px-4 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAnnuler(m.n_moteur)}
                        disabled={cancellingId === m.n_moteur}
                        className="text-red-600 border-red-200 hover:bg-red-50 text-xs"
                      >
                        {cancellingId === m.n_moteur ? "..." : "Annuler"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {reserved.length === 0 && (
              <p className="text-center py-8 text-gray-400">Aucune réservation en cours</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────── Boites Tab ─────────── */
function BoitesTab() {
  const [reserved, setReserved] = useState<BoiteRow[]>([]);
  const [available, setAvailable] = useState<AvailBoite[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchNew, setSearchNew] = useState("");
  const [clientNew, setClientNew] = useState("");
  const [selectedNew, setSelectedNew] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resaRes, dispoRes] = await Promise.all([
        supabase
          .from("tbl_boites")
          .select("n_bv, ref_bv, num_interne_bv, resa_client_bv, date_resa_bv")
          .not("resa_client_bv", "is", null)
          .neq("resa_client_bv", "")
          .or("vendu.is.null,vendu.eq.false")
          .eq("stock", true)
          .order("date_resa_bv", { ascending: false }),
        supabase
          .from("tbl_boites")
          .select("n_bv, ref_bv, num_interne_bv")
          .is("resa_client_bv", null)
          .or("vendu.is.null,vendu.eq.false")
          .eq("stock", true)
          .order("n_bv", { ascending: false })
          .limit(300),
      ]);
      if (resaRes.error) toast.error("Erreur chargement réservations : " + resaRes.error.message);
      if (dispoRes.error) toast.error("Erreur chargement disponibles : " + dispoRes.error.message);
      setReserved((resaRes.data as BoiteRow[]) || []);
      setAvailable((dispoRes.data as AvailBoite[]) || []);
    } catch (err: unknown) {
      toast.error("Erreur inattendue : " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredAvail = available.filter(
    (b) => !searchNew || [b.ref_bv, b.num_interne_bv].some((v) => (v || "").toLowerCase().includes(searchNew.toLowerCase()))
  );

  async function handleReserver() {
    if (!selectedNew || !clientNew.trim()) {
      toast.warning("Sélectionnez une boîte et saisissez un client.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tbl_boites")
        .update({ resa_client_bv: clientNew.trim(), date_resa_bv: new Date().toISOString() })
        .eq("n_bv", selectedNew);
      if (error) {
        toast.error("Erreur : " + error.message);
        return;
      }
      toast.success(`Boîte réservée pour ${clientNew.trim()}`);
      setSelectedNew("");
      setClientNew("");
      load();
    } catch (err: unknown) {
      toast.error("Erreur inattendue : " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  async function handleAnnuler(id: number) {
    setCancellingId(id);
    try {
      const { error } = await supabase
        .from("tbl_boites")
        .update({ resa_client_bv: null, date_resa_bv: null })
        .eq("n_bv", id);
      if (error) {
        toast.error("Erreur : " + error.message);
        return;
      }
      toast.success("Réservation annulée.");
      load();
    } catch (err: unknown) {
      toast.error("Erreur inattendue : " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* New reservation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nouvelle réservation boîte</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="min-w-[180px]">
            <Label className="mb-1 block text-sm">Rechercher</Label>
            <Input placeholder="Réf, num interne..." value={searchNew} onChange={(e) => setSearchNew(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <Label className="mb-1 block text-sm">Boîte disponible</Label>
            <select
              value={selectedNew}
              onChange={(e) => setSelectedNew(e.target.value ? Number(e.target.value) : "")}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">— Sélectionner —</option>
              {filteredAvail.map((b) => (
                <option key={b.n_bv} value={b.n_bv}>
                  {b.n_bv} — {b.ref_bv || b.num_interne_bv || "Sans réf"}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <Label className="mb-1 block text-sm">Nom du client</Label>
            <Input placeholder="Nom client..." value={clientNew} onChange={(e) => setClientNew(e.target.value)} />
          </div>
          <Button
            onClick={handleReserver}
            disabled={saving || !selectedNew || !clientNew.trim()}
            className="bg-[#C41E3A] hover:bg-[#a01830] text-white"
          >
            {saving ? "En cours..." : "Réserver"}
          </Button>
        </CardContent>
      </Card>

      {/* Current reservations table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-sm text-gray-700">
          Réservations en cours — {reserved.length} boîte(s)
        </div>
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  {["N°", "Réf BV", "Num interne", "Client", "Date résa", "Statut", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reserved.map((b) => (
                  <tr key={b.n_bv} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{b.n_bv}</td>
                    <td className="px-4 py-3 font-semibold">{b.ref_bv || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{b.num_interne_bv || "—"}</td>
                    <td className="px-4 py-3 font-medium">{b.resa_client_bv}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {b.date_resa_bv ? new Date(b.date_resa_bv).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="px-4 py-3"><ReservationBadge /></td>
                    <td className="px-4 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAnnuler(b.n_bv)}
                        disabled={cancellingId === b.n_bv}
                        className="text-red-600 border-red-200 hover:bg-red-50 text-xs"
                      >
                        {cancellingId === b.n_bv ? "..." : "Annuler"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {reserved.length === 0 && (
              <p className="text-center py-8 text-gray-400">Aucune réservation en cours</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────── Main Page ─────────── */
export default function ReservationsPage() {
  return (
    <div>
      <PageHeader title="Réservations" icon="📋" description="Gestion des réservations clients — moteurs et boîtes de vitesse" />
      <Tabs defaultValue="moteurs" className="mt-2">
        <TabsList className="mb-6">
          <TabsTrigger value="moteurs">Moteurs</TabsTrigger>
          <TabsTrigger value="boites">Boîtes de vitesse</TabsTrigger>
        </TabsList>
        <TabsContent value="moteurs"><MoteursTab /></TabsContent>
        <TabsContent value="boites"><BoitesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
