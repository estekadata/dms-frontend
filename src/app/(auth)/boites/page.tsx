"use client";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReserveClientDialog } from "@/components/reserve-client-dialog";
import { Search, X } from "lucide-react";

const ROW_LIMIT = 1000;
const STATUTS = ["Tous", "Disponible", "Réservée", "Vendue"];

function parseClientId(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(String(raw).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : null;
}

export default function BoitesPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statut, setStatut] = useState("Tous");
  const [boites, setBoites] = useState<any[]>([]);
  const [counts, setCounts] = useState({ total: 0, dispo: 0, reserve: 0, vendu: 0 });
  const [loading, setLoading] = useState(false);
  const [clientNamesById, setClientNamesById] = useState<Record<number, string>>({});
  const [reserveTarget, setReserveTarget] = useState<{ id: number; code: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  function applyFilters(q: any): any {
    return debouncedSearch
      ? q.or(
          `ref_bv.ilike.%${debouncedSearch}%,num_interne_bv.ilike.%${debouncedSearch}%,num_interne_moteur.ilike.%${debouncedSearch}%`
        )
      : q;
  }

  const loadBoites = useCallback(async () => {
    setLoading(true);

    let rowsQ = supabase
      .from("v_boites_dispo")
      .select(
        "n_bv, num_interne_bv, ref_bv, num_interne_moteur, achat_bv, prix_vte_bv, date_vente_bv, resa_client_bv, date_resa_bv, stock, vendu, est_disponible, n_reception"
      )
      .order("n_bv", { ascending: false })
      .limit(ROW_LIMIT);
    rowsQ = applyFilters(rowsQ);
    if (statut === "Disponible") rowsQ = rowsQ.eq("est_disponible", 1).is("resa_client_bv", null);
    if (statut === "Réservée") rowsQ = rowsQ.eq("est_disponible", 1).not("resa_client_bv", "is", null);
    if (statut === "Vendue") rowsQ = rowsQ.eq("est_disponible", 0);

    const countBase = () => applyFilters(supabase.from("v_boites_dispo").select("*", { count: "exact", head: true }));

    const [rowsRes, totalRes, dispoRes, reserveRes, venduRes] = await Promise.all([
      rowsQ,
      countBase(),
      countBase().eq("est_disponible", 1).is("resa_client_bv", null),
      countBase().eq("est_disponible", 1).not("resa_client_bv", "is", null),
      countBase().eq("est_disponible", 0),
    ]);

    const rows = (rowsRes.data || []).map((b: any) => ({ ...b, _resa_client_id: parseClientId(b.resa_client_bv) }));

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
  }, [debouncedSearch, statut]);

  useEffect(() => {
    loadBoites();
  }, [loadBoites]);

  async function reserveBoite(n_bv: number, n_client: number) {
    setBusyId(n_bv);
    const { error } = await supabase
      .from("tbl_boites")
      .update({ resa_client_bv: String(n_client), date_resa_bv: new Date().toISOString() })
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
      .update({ resa_client_bv: null, date_resa_bv: null })
      .eq("n_bv", n_bv);
    setBusyId(null);
    if (error) {
      alert(`Erreur lors de la libération : ${error.message}`);
      return;
    }
    await loadBoites();
  }

  function derive(b: any) {
    const code = b.ref_bv || b.num_interne_bv || `BV #${b.n_bv}`;
    const isSold = b.est_disponible === 0;
    const isReserved = !isSold && !!b.resa_client_bv;
    const isAvailable = !isSold && !isReserved;
    const clientLabel =
      b._resa_client_id !== null ? clientNamesById[b._resa_client_id] || `Client #${b._resa_client_id}` : null;
    return { code, isSold, isReserved, isAvailable, clientLabel };
  }

  function statusBadge(d: ReturnType<typeof derive>): ReactNode {
    if (d.isSold)
      return <Badge className="bg-[rgba(148,163,184,0.15)] text-slate-600 border border-[rgba(148,163,184,0.25)]">Vendue</Badge>;
    if (d.isReserved)
      return <Badge className="bg-[rgba(251,191,36,0.10)] text-amber-600 border border-[rgba(251,191,36,0.20)]">Réservée</Badge>;
    return <Badge className="bg-[rgba(52,211,153,0.10)] text-emerald-600 border border-[rgba(52,211,153,0.20)]">Disponible</Badge>;
  }

  function action(b: any, d: ReturnType<typeof derive>): ReactNode {
    if (d.isAvailable)
      return (
        <Button size="sm" variant="outline" onClick={() => setReserveTarget({ id: b.n_bv, code: d.code })} disabled={busyId === b.n_bv}>
          Réserver
        </Button>
      );
    if (d.isReserved)
      return (
        <div className="flex items-center gap-2">
          {b._resa_client_id !== null ? (
            <Link href={`/clients/${b._resa_client_id}`} className="max-w-[180px] truncate text-sm font-medium text-brand hover:underline" title={d.clientLabel || ""}>
              {d.clientLabel}
            </Link>
          ) : (
            <span className="text-sm text-text-dim">—</span>
          )}
          <Button size="xs" variant="ghost" onClick={() => libererBoite(b.n_bv, d.code)} disabled={busyId === b.n_bv} className="text-text-dim hover:text-destructive">
            Libérer
          </Button>
        </div>
      );
    return <span className="text-xs text-text-muted">—</span>;
  }

  const euro = (v: any) => (v ? `${Math.round(v).toLocaleString("fr-FR")} €` : "—");
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-medium transition ${
      active ? "bg-brand text-white" : "bg-surface-alt text-text-dim hover:bg-surface-hover"
    }`;

  return (
    <div>
      <PageHeader title="Identification Boîtes de vitesse" description="Recherche et consultation du stock BV" />

      {/* Recherche */}
      <div className="relative mb-3 max-w-xl">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input
          placeholder="Rechercher (réf BV, num interne, moteur…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-12 rounded-xl border-border bg-surface-alt pl-10 pr-10 text-base text-foreground placeholder:text-text-muted"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover"
            aria-label="Effacer"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Filtres statut en chips */}
      <div className="mb-6 flex flex-wrap gap-2">
        {STATUTS.map((s) => (
          <button key={s} onClick={() => setStatut(s)} className={chip(statut === s)}>
            {s}
          </button>
        ))}
      </div>

      {/* Compteurs */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Résultats</p><p className="text-2xl font-bold text-brand">{counts.total.toLocaleString("fr-FR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Disponibles</p><p className="text-2xl font-bold text-emerald-600">{counts.dispo.toLocaleString("fr-FR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Réservées</p><p className="text-2xl font-bold text-amber-600">{counts.reserve.toLocaleString("fr-FR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Vendues</p><p className="text-2xl font-bold text-text-muted">{counts.vendu.toLocaleString("fr-FR")}</p></CardContent></Card>
      </div>

      {counts.total > boites.length && !loading && (
        <p className="mb-3 text-xs text-text-muted">
          Affichage des {boites.length.toLocaleString("fr-FR")} dernières sur {counts.total.toLocaleString("fr-FR")} — affinez via la recherche.
        </p>
      )}

      {loading ? (
        <div className="py-12 text-center text-text-muted">Chargement…</div>
      ) : boites.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-surface py-12 text-center italic text-text-muted">Aucune boîte trouvée</div>
      ) : (
        <>
          {/* Mobile : cartes */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
            {boites.map((b) => {
              const d = derive(b);
              return (
                <div key={b.n_bv} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{d.code}</p>
                      <p className="font-mono text-xs text-text-muted">n°{b.n_bv}</p>
                    </div>
                    {statusBadge(d)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-text-dim">
                    {b.num_interne_bv && <span className="rounded-full bg-surface-hover px-2 py-0.5">Interne {b.num_interne_bv}</span>}
                    {b.num_interne_moteur && <span className="rounded-full bg-surface-hover px-2 py-0.5">Moteur {b.num_interne_moteur}</span>}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                    <div className="text-xs text-text-dim">
                      <span className="text-text-muted">Achat</span> {euro(b.achat_bv)}
                      <span className="mx-1 text-text-muted">·</span>
                      <span className="text-text-muted">Vente</span> {euro(b.prix_vte_bv)}
                    </div>
                    {action(b, d)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop : table */}
          <div className="hidden overflow-hidden rounded-[14px] border border-border bg-surface md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt text-xs uppercase text-text-dim">
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
                    const d = derive(b);
                    return (
                      <tr key={b.n_bv} className="transition-colors hover:bg-surface-hover">
                        <td className="px-4 py-3 font-mono text-xs text-text-muted">{b.n_bv}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">{b.ref_bv || "—"}</td>
                        <td className="px-4 py-3 text-text-dim">{b.num_interne_bv || "—"}</td>
                        <td className="px-4 py-3 text-text-dim">{b.num_interne_moteur || "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-text-dim">{euro(b.achat_bv)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-text-dim">{euro(b.prix_vte_bv)}</td>
                        <td className="px-4 py-3 text-center">{statusBadge(d)}</td>
                        <td className="px-4 py-3">{action(b, d)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <ReserveClientDialog
        open={reserveTarget !== null}
        onClose={() => setReserveTarget(null)}
        onConfirm={(clientId) => (reserveTarget ? reserveBoite(reserveTarget.id, clientId) : undefined)}
        title="Réserver cette boîte"
        pieceLabel={reserveTarget ? `${reserveTarget.code} — boîte n°${reserveTarget.id}` : ""}
      />
    </div>
  );
}
