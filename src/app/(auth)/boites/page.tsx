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

export default function BoitesPage() {
  const [search, setSearch] = useState("");
  const [statut, setStatut] = useState("Tous");
  const [boites, setBoites] = useState<any[]>([]);
  const [counts, setCounts] = useState({ total: 0, dispo: 0, reserve: 0, vendu: 0 });
  const [loading, setLoading] = useState(false);
  const [clientNamesById, setClientNamesById] = useState<Record<number, string>>({});
  const [reserveTarget, setReserveTarget] = useState<{ id: number; code: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  function applySearch<T extends { or: (f: string) => T }>(q: T): T {
    return search
      ? q.or(`ref_bv.ilike.%${search}%,num_interne_bv.ilike.%${search}%,num_interne_moteur.ilike.%${search}%`)
      : q;
  }

  const loadBoites = useCallback(async () => {
    setLoading(true);

    let rowsQ = supabase
      .from("v_boites_dispo")
      .select("n_bv, num_interne_bv, ref_bv, num_interne_moteur, achat_bv, prix_vte_bv, date_vente_bv, resa_client_bv, date_resa_bv, stock, vendu, est_disponible, n_reception")
      .order("n_bv", { ascending: false })
      .limit(ROW_LIMIT);
    rowsQ = applySearch(rowsQ as any) as any;
    if (statut === "Disponible") rowsQ = rowsQ.eq("est_disponible", 1).is("resa_client_bv", null);
    if (statut === "Réservée") rowsQ = rowsQ.eq("est_disponible", 1).not("resa_client_bv", "is", null);
    if (statut === "Vendue") rowsQ = rowsQ.eq("est_disponible", 0);

    const countBase = () => applySearch(
      supabase.from("v_boites_dispo").select("*", { count: "exact", head: true }) as any
    );

    const [rowsRes, totalRes, dispoRes, reserveRes, venduRes] = await Promise.all([
      rowsQ,
      countBase(),
      countBase().eq("est_disponible", 1).is("resa_client_bv", null),
      countBase().eq("est_disponible", 1).not("resa_client_bv", "is", null),
      countBase().eq("est_disponible", 0),
    ]);

    const rows = (rowsRes.data || []).map((b: any) => ({
      ...b,
      _resa_client_id: parseClientId(b.resa_client_bv),
    }));

    const clientIds = Array.from(
      new Set(rows.map((b: any) => b._resa_client_id).filter((x: number | null): x is number => x !== null))
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
    setBoites(rows);
    setCounts({
      total: totalRes.count || 0,
      dispo: dispoRes.count || 0,
      reserve: reserveRes.count || 0,
      vendu: venduRes.count || 0,
    });
    setLoading(false);
  }, [search, statut]);

  useEffect(() => {
    loadBoites();
  }, [loadBoites]);

  async function reserveBoite(n_bv: number, n_client: number) {
    setBusyId(n_bv);
    const { error } = await supabase
      .from("tbl_boites")
      .update({
        resa_client_bv: String(n_client),
        date_resa_bv: new Date().toISOString(),
      })
      .eq("n_bv", n_bv);
    setBusyId(null);
    if (error) {
      alert(`Erreur lors de la réservation : ${error.message}`);
      return;
    }
    setReserveTarget(null);
    await loadBoites();
  }

  async function libererBoite(n_bv: number, code: string) {
    if (!confirm(`Libérer la réservation de la boîte ${code} (n°${n_bv}) ?`)) return;
    setBusyId(n_bv);
    const { error } = await supabase
      .from("tbl_boites")
      .update({
        resa_client_bv: null,
        date_resa_bv: null,
      })
      .eq("n_bv", n_bv);
    setBusyId(null);
    if (error) {
      alert(`Erreur lors de la libération : ${error.message}`);
      return;
    }
    await loadBoites();
  }

  return (
    <div>
      <PageHeader title="Identification Boîtes de vitesse" description="Recherche et consultation du stock BV" />

      <div className="flex flex-wrap gap-3 mb-6">
        <Input
          placeholder="Rechercher (réf BV, num interne...)"
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
          <option>Réservée</option>
          <option>Vendue</option>
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4"><p className="text-xs text-text-dim font-semibold uppercase">Résultats</p><p className="text-2xl font-bold text-brand">{counts.total.toLocaleString("fr-FR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-text-dim font-semibold uppercase">Disponibles</p><p className="text-2xl font-bold text-emerald-600">{counts.dispo.toLocaleString("fr-FR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-text-dim font-semibold uppercase">Réservées</p><p className="text-2xl font-bold text-amber-600">{counts.reserve.toLocaleString("fr-FR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-text-dim font-semibold uppercase">Vendues</p><p className="text-2xl font-bold text-text-muted">{counts.vendu.toLocaleString("fr-FR")}</p></CardContent></Card>
      </div>
      {counts.total > boites.length && !loading && (
        <p className="text-xs text-text-muted mb-3">Affichage des {boites.length.toLocaleString("fr-FR")} dernières boîtes sur {counts.total.toLocaleString("fr-FR")} — affinez via la recherche.</p>
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
                  <th className="px-4 py-3 text-left">Réf BV</th>
                  <th className="px-4 py-3 text-left">Num interne</th>
                  <th className="px-4 py-3 text-left">Moteur lié</th>
                  <th className="px-4 py-3 text-right">Prix achat</th>
                  <th className="px-4 py-3 text-right">Prix vente</th>
                  <th className="px-4 py-3 text-center">Statut</th>
                  <th className="px-4 py-3 text-left">Client / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {boites.map((b) => {
                  const code = b.ref_bv || b.num_interne_bv || `BV #${b.n_bv}`;
                  const isSold = b.est_disponible === 0;
                  const isReserved = !isSold && !!b.resa_client_bv;
                  const isAvailable = !isSold && !isReserved;
                  const clientLabel = b._resa_client_id !== null
                    ? clientNamesById[b._resa_client_id] || `Client #${b._resa_client_id}`
                    : null;
                  return (
                    <tr key={b.n_bv} className="hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-text-muted">{b.n_bv}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{b.ref_bv || "—"}</td>
                      <td className="px-4 py-3 text-text-dim">{b.num_interne_bv || "—"}</td>
                      <td className="px-4 py-3 text-text-dim">{b.num_interne_moteur || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-dim">
                        {b.achat_bv ? `${Math.round(b.achat_bv).toLocaleString("fr-FR")} €` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-dim">
                        {b.prix_vte_bv ? `${Math.round(b.prix_vte_bv).toLocaleString("fr-FR")} €` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isSold ? (
                          <Badge className="bg-[rgba(148,163,184,0.15)] text-slate-600 border border-[rgba(148,163,184,0.25)] hover:bg-[rgba(148,163,184,0.20)]">Vendue</Badge>
                        ) : isReserved ? (
                          <Badge className="bg-[rgba(251,191,36,0.10)] text-amber-600 border border-[rgba(251,191,36,0.20)] hover:bg-[rgba(251,191,36,0.15)]">Réservée</Badge>
                        ) : (
                          <Badge className="bg-[rgba(52,211,153,0.10)] text-emerald-600 border border-[rgba(52,211,153,0.20)] hover:bg-[rgba(52,211,153,0.15)]">Disponible</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isAvailable ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReserveTarget({ id: b.n_bv, code })}
                            disabled={busyId === b.n_bv}
                          >
                            Réserver
                          </Button>
                        ) : isReserved ? (
                          <div className="flex items-center gap-2">
                            {b._resa_client_id !== null ? (
                              <Link
                                href={`/clients/${b._resa_client_id}`}
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
                              onClick={() => libererBoite(b.n_bv, code)}
                              disabled={busyId === b.n_bv}
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
          {boites.length === 0 && (
            <p className="text-center py-10 text-text-muted italic">Aucune boîte trouvée</p>
          )}
        </div>
      )}

      <ReserveClientDialog
        open={reserveTarget !== null}
        onClose={() => setReserveTarget(null)}
        onConfirm={(clientId) =>
          reserveTarget ? reserveBoite(reserveTarget.id, clientId) : undefined
        }
        title="Réserver cette boîte"
        pieceLabel={
          reserveTarget ? `${reserveTarget.code} — boîte n°${reserveTarget.id}` : ""
        }
      />
    </div>
  );
}
