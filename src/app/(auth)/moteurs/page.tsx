"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReserveClientDialog } from "@/components/reserve-client-dialog";

const ROW_LIMIT = 1000;

function parseClientId(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(String(raw).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : null;
}

export default function MoteursPage() {
  const [search, setSearch] = useState("");
  const [statut, setStatut] = useState("Tous");
  const [moteurs, setMoteurs] = useState<any[]>([]);
  const [counts, setCounts] = useState({ total: 0, dispo: 0, reserve: 0, archive: 0 });
  const [loading, setLoading] = useState(false);
  const [clientNamesById, setClientNamesById] = useState<Record<number, string>>({});
  const [reserveTarget, setReserveTarget] = useState<{ id: number; code: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  function applySearch<T extends { or: (f: string) => T }>(q: T): T {
    return search
      ? q.or(`nom_type_moteur.ilike.%${search}%,code_moteur.ilike.%${search}%,num_serie.ilike.%${search}%`)
      : q;
  }

  const loadMoteurs = useCallback(async () => {
    setLoading(true);

    let rowsQ = supabase
      .from("v_moteurs_dispo")
      .select("n_moteur, code_moteur, nom_type_moteur, num_serie, marque, energie, prix_achat_moteur, est_disponible, archiver, resa_client_moteur, num_reception")
      .order("n_moteur", { ascending: false })
      .limit(ROW_LIMIT);
    rowsQ = applySearch(rowsQ as any) as any;
    if (statut === "Disponible") rowsQ = rowsQ.eq("est_disponible", 1).is("resa_client_moteur", null);
    if (statut === "Réservé") rowsQ = rowsQ.eq("est_disponible", 1).not("resa_client_moteur", "is", null);
    if (statut === "Vendu/Archivé") rowsQ = rowsQ.eq("est_disponible", 0);

    const countBase = () => applySearch(
      supabase.from("v_moteurs_dispo").select("*", { count: "exact", head: true }) as any
    );

    const [rowsRes, totalRes, dispoRes, reserveRes, archiveRes] = await Promise.all([
      rowsQ,
      countBase(),
      countBase().eq("est_disponible", 1).is("resa_client_moteur", null),
      countBase().eq("est_disponible", 1).not("resa_client_moteur", "is", null),
      countBase().eq("est_disponible", 0),
    ]);

    const rows = rowsRes.data || [];

    // Fallback prix : pour les moteurs sans prix_achat_moteur, utiliser la moyenne de la réception
    const receptionIds = [...new Set(rows.map((m: any) => m.num_reception).filter(Boolean))] as number[];
    const avgByReception: Record<number, number> = {};
    if (receptionIds.length > 0) {
      const { data: recs } = await supabase
        .from("v_receptions")
        .select("n_reception, montant_total, nb_moteurs")
        .in("n_reception", receptionIds);
      (recs || []).forEach((r: any) => {
        if (r.montant_total && r.nb_moteurs && r.nb_moteurs > 0) {
          avgByReception[r.n_reception] = r.montant_total / r.nb_moteurs;
        }
      });
    }
    const enriched = rows.map((m: any) => ({
      ...m,
      prix_affiche: m.prix_achat_moteur && m.prix_achat_moteur > 0
        ? m.prix_achat_moteur
        : avgByReception[m.num_reception],
      prix_est_moyenne: !(m.prix_achat_moteur && m.prix_achat_moteur > 0) && !!avgByReception[m.num_reception],
      _resa_client_id: parseClientId(m.resa_client_moteur),
    }));

    // Resolve client names for reserved moteurs
    const clientIds = Array.from(
      new Set(enriched.map((m: any) => m._resa_client_id).filter((x: number | null): x is number => x !== null))
    );
    const namesMap: Record<number, string> = {};
    if (clientIds.length) {
      const { data: cliRes } = await supabase
        .from("tbl_clients")
        .select("n_client, societe, nom_contact, nom_usage")
        .in("n_client", clientIds);
      (cliRes || []).forEach((c: any) => {
        namesMap[c.n_client] = c.societe || c.nom_usage || c.nom_contact || `Client #${c.n_client}`;
      });
    }
    setClientNamesById(namesMap);
    setMoteurs(enriched);
    setCounts({
      total: totalRes.count || 0,
      dispo: dispoRes.count || 0,
      reserve: reserveRes.count || 0,
      archive: archiveRes.count || 0,
    });
    setLoading(false);
  }, [search, statut]);

  useEffect(() => {
    loadMoteurs();
  }, [loadMoteurs]);

  async function reserveMoteur(n_moteur: number, n_client: number) {
    setBusyId(n_moteur);
    const { error } = await supabase
      .from("tbl_moteurs")
      .update({
        resa_client_moteur: String(n_client),
        date_resa_moteur: new Date().toISOString(),
      })
      .eq("n_moteur", n_moteur);
    setBusyId(null);
    if (error) {
      alert(`Erreur lors de la réservation : ${error.message}`);
      return;
    }
    setReserveTarget(null);
    await loadMoteurs();
  }

  async function libererMoteur(n_moteur: number, code: string) {
    if (!confirm(`Libérer la réservation du moteur ${code} (n°${n_moteur}) ?`)) return;
    setBusyId(n_moteur);
    const { error } = await supabase
      .from("tbl_moteurs")
      .update({
        resa_client_moteur: null,
        date_resa_moteur: null,
      })
      .eq("n_moteur", n_moteur);
    setBusyId(null);
    if (error) {
      alert(`Erreur lors de la libération : ${error.message}`);
      return;
    }
    await loadMoteurs();
  }

  return (
    <div>
      <PageHeader title="Identification Moteurs" description="Recherche et consultation du stock moteurs" />

      <div className="flex flex-wrap gap-3 mb-6">
        <Input
          placeholder="Rechercher (code moteur, num série...)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm bg-surface-alt border-border text-foreground placeholder:text-text-muted"
        />
        <select
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-surface-alt text-foreground"
        >
          <option>Tous</option>
          <option>Disponible</option>
          <option>Réservé</option>
          <option>Vendu/Archivé</option>
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4"><p className="text-xs text-text-dim font-semibold uppercase">Résultats</p><p className="text-2xl font-bold text-brand">{counts.total.toLocaleString("fr-FR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-text-dim font-semibold uppercase">Disponibles</p><p className="text-2xl font-bold text-emerald-600">{counts.dispo.toLocaleString("fr-FR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-text-dim font-semibold uppercase">Réservés</p><p className="text-2xl font-bold text-amber-600">{counts.reserve.toLocaleString("fr-FR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-text-dim font-semibold uppercase">Vendus/Archivés</p><p className="text-2xl font-bold text-text-muted">{counts.archive.toLocaleString("fr-FR")}</p></CardContent></Card>
      </div>
      {counts.total > moteurs.length && !loading && (
        <p className="text-xs text-text-muted mb-3">Affichage des {moteurs.length.toLocaleString("fr-FR")} derniers moteurs sur {counts.total.toLocaleString("fr-FR")} — affinez via la recherche.</p>
      )}

      {loading ? (
        <div className="text-center py-12 text-text-muted">Chargement...</div>
      ) : (
        <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-text-dim text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">N°</th>
                  <th className="px-4 py-3 text-left">Code moteur</th>
                  <th className="px-4 py-3 text-left">Num série</th>
                  <th className="px-4 py-3 text-left">Marque</th>
                  <th className="px-4 py-3 text-left">Énergie</th>
                  <th className="px-4 py-3 text-right">Prix achat</th>
                  <th className="px-4 py-3 text-center">Statut</th>
                  <th className="px-4 py-3 text-left">Client / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {moteurs.map((m) => {
                  const code = m.nom_type_moteur || m.code_moteur || `Moteur #${m.n_moteur}`;
                  const isArchived = !!m.archiver;
                  const isSold = m.est_disponible === 0 && !isArchived;
                  const isReserved = !isArchived && !isSold && !!m.resa_client_moteur;
                  const isAvailable = !isArchived && !isSold && !isReserved;
                  const clientLabel = m._resa_client_id !== null
                    ? clientNamesById[m._resa_client_id] || `Client #${m._resa_client_id}`
                    : null;
                  return (
                    <tr key={m.n_moteur} className="hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-text-muted">{m.n_moteur}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{code}</td>
                      <td className="px-4 py-3 text-text-dim">{m.num_serie || "—"}</td>
                      <td className="px-4 py-3 text-text-dim">{m.marque || "—"}</td>
                      <td className="px-4 py-3 text-text-dim">{m.energie || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-dim">
                        {m.prix_affiche ? (
                          <span title={m.prix_est_moyenne ? "Moyenne réception (prix individuel non saisi)" : "Prix d'achat saisi"}>
                            {Math.round(m.prix_affiche).toLocaleString("fr-FR")} €
                            {m.prix_est_moyenne && <span className="ml-1 text-text-muted">~</span>}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isArchived ? (
                          <Badge className="bg-[rgba(90,100,120,0.10)] text-text-muted border border-[rgba(90,100,120,0.20)] hover:bg-[rgba(90,100,120,0.15)]">Archivé</Badge>
                        ) : isSold ? (
                          <Badge className="bg-[rgba(148,163,184,0.15)] text-slate-600 border border-[rgba(148,163,184,0.25)] hover:bg-[rgba(148,163,184,0.20)]">Vendu</Badge>
                        ) : isReserved ? (
                          <Badge className="bg-[rgba(251,191,36,0.10)] text-amber-600 border border-[rgba(251,191,36,0.20)] hover:bg-[rgba(251,191,36,0.15)]">Réservé</Badge>
                        ) : (
                          <Badge className="bg-[rgba(52,211,153,0.10)] text-emerald-600 border border-[rgba(52,211,153,0.20)] hover:bg-[rgba(52,211,153,0.15)]">Disponible</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isAvailable ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReserveTarget({ id: m.n_moteur, code })}
                            disabled={busyId === m.n_moteur}
                          >
                            Réserver
                          </Button>
                        ) : isReserved ? (
                          <div className="flex items-center gap-2">
                            {m._resa_client_id !== null ? (
                              <Link
                                href={`/clients/${m._resa_client_id}`}
                                className="text-brand hover:underline text-sm font-medium truncate max-w-[180px]"
                                title={clientLabel || ""}
                              >
                                {clientLabel}
                              </Link>
                            ) : (
                              <span className="text-text-dim text-sm">—</span>
                            )}
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => libererMoteur(m.n_moteur, code)}
                              disabled={busyId === m.n_moteur}
                              className="text-text-dim hover:text-destructive"
                            >
                              Libérer
                            </Button>
                          </div>
                        ) : (
                          <span className="text-text-muted text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {moteurs.length === 0 && (
            <p className="text-center py-10 text-text-muted italic">Aucun moteur trouvé</p>
          )}
        </div>
      )}

      <ReserveClientDialog
        open={reserveTarget !== null}
        onClose={() => setReserveTarget(null)}
        onConfirm={(clientId) =>
          reserveTarget ? reserveMoteur(reserveTarget.id, clientId) : undefined
        }
        title="Réserver ce moteur"
        pieceLabel={
          reserveTarget ? `${reserveTarget.code} — moteur n°${reserveTarget.id}` : ""
        }
      />
    </div>
  );
}
