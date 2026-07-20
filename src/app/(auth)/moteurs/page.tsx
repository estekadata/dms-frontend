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
import { SortHeader, type SortDir } from "@/components/sortable";
import { MoteurStatuts } from "@/components/moteur-statuts";
import { Search, X } from "lucide-react";

const ROW_LIMIT = 1000;
const STATUTS = ["Tous", "Disponible", "Réservé", "Vendu/Archivé"];
const ENERGIES = [
  { label: "Diesel", stem: "diesel" },
  { label: "Essence", stem: "essence" },
  { label: "Électrique", stem: "electr" },
];

function parseClientId(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(String(raw).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : null;
}

export default function MoteursPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statut, setStatut] = useState("Tous");
  const [energie, setEnergie] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string>("n_moteur");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [moteurs, setMoteurs] = useState<any[]>([]);
  const [counts, setCounts] = useState({ total: 0, dispo: 0, reserve: 0, archive: 0 });
  const [loading, setLoading] = useState(false);
  const [clientNamesById, setClientNamesById] = useState<Record<number, string>>({});
  const [reserveTarget, setReserveTarget] = useState<{ id: number; code: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Debounce de la recherche : évite de lancer 5 requêtes à chaque frappe.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  function applyFilters(q: any): any {
    let r = q;
    if (debouncedSearch) {
      r = r.or(
        `nom_type_moteur.ilike.%${debouncedSearch}%,code_moteur.ilike.%${debouncedSearch}%,num_serie.ilike.%${debouncedSearch}%,marque.ilike.%${debouncedSearch}%`
      );
    }
    if (energie) r = r.ilike("energie", `%${energie}%`);
    return r;
  }

  const loadMoteurs = useCallback(async () => {
    setLoading(true);

    let rowsQ = supabase
      .from("v_moteurs_dispo")
      .select(
        "n_moteur, code_moteur, nom_type_moteur, num_serie, marque, energie, prix_achat_moteur, est_disponible, archiver, resa_client_moteur, num_reception, compo_moteur, etat_moteur, n_affectation"
      )
      .order(sortKey, { ascending: sortDir === "asc" })
      .limit(ROW_LIMIT);
    rowsQ = applyFilters(rowsQ);
    if (statut === "Disponible") rowsQ = rowsQ.eq("est_disponible", 1).is("resa_client_moteur", null);
    if (statut === "Réservé") rowsQ = rowsQ.eq("est_disponible", 1).not("resa_client_moteur", "is", null);
    if (statut === "Vendu/Archivé") rowsQ = rowsQ.eq("est_disponible", 0);

    const countBase = () => applyFilters(supabase.from("v_moteurs_dispo").select("*", { count: "exact", head: true }));

    const [rowsRes, totalRes, dispoRes, reserveRes, archiveRes] = await Promise.all([
      rowsQ,
      countBase(),
      countBase().eq("est_disponible", 1).is("resa_client_moteur", null),
      countBase().eq("est_disponible", 1).not("resa_client_moteur", "is", null),
      countBase().eq("est_disponible", 0),
    ]);

    const rows = rowsRes.data || [];

    // Fallback prix : moyenne de la réception si prix individuel absent
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
      prix_affiche:
        m.prix_achat_moteur && m.prix_achat_moteur > 0 ? m.prix_achat_moteur : avgByReception[m.num_reception],
      prix_est_moyenne: !(m.prix_achat_moteur && m.prix_achat_moteur > 0) && !!avgByReception[m.num_reception],
      _resa_client_id: parseClientId(m.resa_client_moteur),
    }));

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
  }, [debouncedSearch, statut, energie, sortKey, sortDir]);

  function onSort(col: string) {
    if (col === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  useEffect(() => {
    loadMoteurs();
  }, [loadMoteurs]);

  async function reserveMoteur(n_moteur: number, n_client: number) {
    setBusyId(n_moteur);
    const { error } = await supabase
      .from("tbl_moteurs")
      .update({ resa_client_moteur: String(n_client), date_resa_moteur: new Date().toISOString() })
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
      .update({ resa_client_moteur: null, date_resa_moteur: null })
      .eq("n_moteur", n_moteur);
    setBusyId(null);
    if (error) {
      alert(`Erreur lors de la libération : ${error.message}`);
      return;
    }
    await loadMoteurs();
  }

  // Dérive l'état + les rendus partagés entre cartes (mobile) et table (desktop)
  function derive(m: any) {
    const code = m.nom_type_moteur || m.code_moteur || `Moteur #${m.n_moteur}`;
    const isArchived = !!m.archiver;
    const isSold = m.est_disponible === 0 && !isArchived;
    const isReserved = !isArchived && !isSold && !!m.resa_client_moteur;
    const isAvailable = !isArchived && !isSold && !isReserved;
    const clientLabel =
      m._resa_client_id !== null ? clientNamesById[m._resa_client_id] || `Client #${m._resa_client_id}` : null;
    return { code, isArchived, isSold, isReserved, isAvailable, clientLabel };
  }

  function statusBadge(d: ReturnType<typeof derive>): ReactNode {
    if (d.isArchived)
      return <Badge className="bg-[rgba(90,100,120,0.10)] text-text-muted border border-[rgba(90,100,120,0.20)]">Archivé</Badge>;
    if (d.isSold)
      return <Badge className="bg-[rgba(148,163,184,0.15)] text-slate-600 border border-[rgba(148,163,184,0.25)]">Vendu</Badge>;
    if (d.isReserved)
      return <Badge className="bg-[rgba(251,191,36,0.10)] text-amber-600 border border-[rgba(251,191,36,0.20)]">Réservé</Badge>;
    return <Badge className="bg-[rgba(52,211,153,0.10)] text-emerald-600 border border-[rgba(52,211,153,0.20)]">Disponible</Badge>;
  }

  function priceLabel(m: any): ReactNode {
    if (!m.prix_affiche) return <span className="text-text-muted">—</span>;
    return (
      <span title={m.prix_est_moyenne ? "Moyenne réception (prix individuel non saisi)" : "Prix d'achat saisi"}>
        {Math.round(m.prix_affiche).toLocaleString("fr-FR")} €{m.prix_est_moyenne && <span className="ml-1 text-text-muted">~</span>}
      </span>
    );
  }

  function action(m: any, d: ReturnType<typeof derive>): ReactNode {
    if (d.isAvailable)
      return (
        <Button size="sm" variant="outline" onClick={() => setReserveTarget({ id: m.n_moteur, code: d.code })} disabled={busyId === m.n_moteur}>
          Réserver
        </Button>
      );
    if (d.isReserved)
      return (
        <div className="flex items-center gap-2">
          {m._resa_client_id !== null ? (
            <Link href={`/clients/${m._resa_client_id}`} className="max-w-[180px] truncate text-sm font-medium text-brand hover:underline" title={d.clientLabel || ""}>
              {d.clientLabel}
            </Link>
          ) : (
            <span className="text-sm text-text-dim">—</span>
          )}
          <Button size="xs" variant="ghost" onClick={() => libererMoteur(m.n_moteur, d.code)} disabled={busyId === m.n_moteur} className="text-text-dim hover:text-destructive">
            Libérer
          </Button>
        </div>
      );
    return <span className="text-xs text-text-muted">—</span>;
  }

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-medium transition ${
      active ? "bg-brand text-white" : "bg-surface-alt text-text-dim hover:bg-surface-hover"
    }`;

  return (
    <div>
      <PageHeader title="Identification Moteurs" description="Recherche et consultation du stock moteurs" />

      {/* Recherche */}
      <div className="relative mb-3 max-w-xl">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input
          placeholder="Rechercher (code, n° série, marque…)"
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

      {/* Filtres en chips (statut + énergie) */}
      <div className="mb-2 flex flex-wrap gap-2">
        {STATUTS.map((s) => (
          <button key={s} onClick={() => setStatut(s)} className={chip(statut === s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        <button onClick={() => setEnergie(null)} className={chip(!energie) + " ring-1 ring-border"}>
          Toutes énergies
        </button>
        {ENERGIES.map((e) => (
          <button key={e.stem} onClick={() => setEnergie(energie === e.stem ? null : e.stem)} className={chip(energie === e.stem) + " ring-1 ring-border"}>
            {e.label}
          </button>
        ))}
      </div>

      {/* Compteurs */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Résultats</p><p className="text-2xl font-bold text-brand">{counts.total.toLocaleString("fr-FR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Disponibles</p><p className="text-2xl font-bold text-emerald-600">{counts.dispo.toLocaleString("fr-FR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Réservés</p><p className="text-2xl font-bold text-amber-600">{counts.reserve.toLocaleString("fr-FR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Vendus/Archivés</p><p className="text-2xl font-bold text-text-muted">{counts.archive.toLocaleString("fr-FR")}</p></CardContent></Card>
      </div>

      {counts.total > moteurs.length && !loading && (
        <p className="mb-3 text-xs text-text-muted">
          Affichage des {moteurs.length.toLocaleString("fr-FR")} derniers sur {counts.total.toLocaleString("fr-FR")} — affinez via la recherche.
        </p>
      )}

      {loading ? (
        <div className="py-12 text-center text-text-muted">Chargement…</div>
      ) : moteurs.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-surface py-12 text-center italic text-text-muted">Aucun moteur trouvé</div>
      ) : (
        <>
          {/* Mobile : cartes */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
            {moteurs.map((m) => {
              const d = derive(m);
              return (
                <div key={m.n_moteur} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{d.code}</p>
                      <p className="font-mono text-xs text-text-muted">n°{m.n_moteur}</p>
                    </div>
                    {statusBadge(d)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-text-dim">
                    {m.marque && <span className="rounded-full bg-surface-hover px-2 py-0.5">{m.marque}</span>}
                    {m.energie && <span className="rounded-full bg-surface-hover px-2 py-0.5">{m.energie}</span>}
                    {m.num_serie && <span className="rounded-full bg-surface-hover px-2 py-0.5">SN {m.num_serie}</span>}
                  </div>
                  <MoteurStatuts compo={m.compo_moteur} etat={m.etat_moteur} affect={m.n_affectation} className="mt-2" />
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                    <span className="text-sm font-semibold text-foreground">{priceLabel(m)}</span>
                    {action(m, d)}
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
                    <SortHeader label="N°" active={sortKey === "n_moteur"} dir={sortDir} onClick={() => onSort("n_moteur")} />
                    <SortHeader label="Code moteur" active={sortKey === "nom_type_moteur"} dir={sortDir} onClick={() => onSort("nom_type_moteur")} />
                    <SortHeader label="Num série" active={sortKey === "num_serie"} dir={sortDir} onClick={() => onSort("num_serie")} />
                    <SortHeader label="Marque" active={sortKey === "marque"} dir={sortDir} onClick={() => onSort("marque")} />
                    <SortHeader label="Énergie" active={sortKey === "energie"} dir={sortDir} onClick={() => onSort("energie")} />
                    <SortHeader label="Prix achat" align="right" active={sortKey === "prix_achat_moteur"} dir={sortDir} onClick={() => onSort("prix_achat_moteur")} />
                    <th className="px-4 py-3 text-center">Statut</th>
                    <th className="px-4 py-3 text-left">Client / Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {moteurs.map((m) => {
                    const d = derive(m);
                    return (
                      <tr key={m.n_moteur} className="transition-colors hover:bg-surface-hover">
                        <td className="px-4 py-3 font-mono text-xs text-text-muted">{m.n_moteur}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-foreground">{d.code}</div>
                          <MoteurStatuts compo={m.compo_moteur} etat={m.etat_moteur} affect={m.n_affectation} className="mt-1" />
                        </td>
                        <td className="px-4 py-3 text-text-dim">{m.num_serie || "—"}</td>
                        <td className="px-4 py-3 text-text-dim">{m.marque || "—"}</td>
                        <td className="px-4 py-3 text-text-dim">{m.energie || "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-text-dim">{priceLabel(m)}</td>
                        <td className="px-4 py-3 text-center">{statusBadge(d)}</td>
                        <td className="px-4 py-3">{action(m, d)}</td>
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
        onConfirm={(clientId) => (reserveTarget ? reserveMoteur(reserveTarget.id, clientId) : undefined)}
        title="Réserver ce moteur"
        pieceLabel={reserveTarget ? `${reserveTarget.code} — moteur n°${reserveTarget.id}` : ""}
      />
    </div>
  );
}
