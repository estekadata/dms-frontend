"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Users, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type Kind = "moteurs" | "boites";
type View = "client" | "type";

type ResaItem = {
  pieceId: number;
  type: string;
  ref: string;
  clientId: number | null;
  clientLabel: string;
  date: string | null;
};

function parseClientId(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(String(raw).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Récupère toutes les lignes d'une vue en paginant (au-delà du plafond PostgREST).
async function fetchAll(view: string, cols: string, filter: (q: any) => any): Promise<any[]> {
  const all: any[] = [];
  const PAGE = 1000;
  let from = 0;
  while (from < 100000) {
    const { data, error } = await filter(supabase.from(view).select(cols)).range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export default function SyntheseReservationsPage() {
  const [kind, setKind] = useState<Kind>("moteurs");
  const [view, setView] = useState<View>("client");
  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const [moteurs, setMoteurs] = useState<ResaItem[]>([]);
  const [boites, setBoites] = useState<ResaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setSearch(rawSearch.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [rawSearch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const [motRows, bvRows] = await Promise.all([
        fetchAll(
          "v_moteurs_dispo",
          "n_moteur, nom_type_moteur, code_moteur, resa_client_moteur, date_resa_moteur",
          (q) => q.not("resa_client_moteur", "is", null).eq("est_disponible", 1)
        ),
        fetchAll(
          "v_boites_dispo",
          "n_bv, ref_bv, num_interne_bv, type_bv, resa_client_bv, date_resa_bv",
          (q) => q.not("resa_client_bv", "is", null).eq("est_disponible", 1)
        ),
      ]);

      // Résolution des noms clients
      const ids = new Set<number>();
      motRows.forEach((m) => {
        const c = parseClientId(m.resa_client_moteur);
        if (c !== null) ids.add(c);
      });
      bvRows.forEach((b) => {
        const c = parseClientId(b.resa_client_bv);
        if (c !== null) ids.add(c);
      });

      const clientMap: Record<number, string> = {};
      const idList = Array.from(ids);
      for (let i = 0; i < idList.length; i += 300) {
        const slice = idList.slice(i, i + 300);
        const { data } = await supabase
          .from("tbl_clients")
          .select("n_client, societe, nom_contact, nom_usage")
          .in("n_client", slice);
        (data || []).forEach((c: any) => {
          clientMap[c.n_client] = c.societe || c.nom_usage || c.nom_contact || `Client #${c.n_client}`;
        });
      }

      const toItem = (raw: any, k: Kind): ResaItem => {
        const cid = parseClientId(k === "moteurs" ? raw.resa_client_moteur : raw.resa_client_bv);
        return {
          pieceId: k === "moteurs" ? raw.n_moteur : raw.n_bv,
          type: (k === "moteurs" ? raw.nom_type_moteur : raw.type_bv) || "—",
          ref: (k === "moteurs" ? raw.code_moteur : raw.ref_bv || raw.num_interne_bv) || "—",
          clientId: cid,
          clientLabel: cid !== null ? clientMap[cid] || `Client #${cid}` : "—",
          date: k === "moteurs" ? raw.date_resa_moteur : raw.date_resa_bv,
        };
      };

      if (cancelled) return;
      setMoteurs(motRows.map((r) => toItem(r, "moteurs")));
      setBoites(bvRows.map((r) => toItem(r, "boites")));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = kind === "moteurs" ? moteurs : boites;

  const filtered = useMemo(() => {
    if (!search) return items;
    return items.filter(
      (i) =>
        i.clientLabel.toLowerCase().includes(search) ||
        i.type.toLowerCase().includes(search) ||
        i.ref.toLowerCase().includes(search)
    );
  }, [items, search]);

  // Agrégation par client → types → refs
  const parClient = useMemo(() => {
    const map = new Map<
      string,
      { clientId: number | null; label: string; total: number; types: Map<string, { count: number; refs: Set<string> }> }
    >();
    for (const i of filtered) {
      const key = i.clientId !== null ? `c${i.clientId}` : `label:${i.clientLabel}`;
      if (!map.has(key)) map.set(key, { clientId: i.clientId, label: i.clientLabel, total: 0, types: new Map() });
      const g = map.get(key)!;
      g.total++;
      if (!g.types.has(i.type)) g.types.set(i.type, { count: 0, refs: new Set() });
      const t = g.types.get(i.type)!;
      t.count++;
      if (i.ref && i.ref !== "—") t.refs.add(i.ref);
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({
        key,
        clientId: v.clientId,
        label: v.label,
        total: v.total,
        types: Array.from(v.types.entries())
          .map(([type, d]) => ({ type, count: d.count, refs: Array.from(d.refs) }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  // Agrégation par type → clients
  const parType = useMemo(() => {
    const map = new Map<string, { total: number; clients: Map<string, { label: string; clientId: number | null; count: number }> }>();
    for (const i of filtered) {
      if (!map.has(i.type)) map.set(i.type, { total: 0, clients: new Map() });
      const g = map.get(i.type)!;
      g.total++;
      const ck = i.clientId !== null ? `c${i.clientId}` : `label:${i.clientLabel}`;
      if (!g.clients.has(ck)) g.clients.set(ck, { label: i.clientLabel, clientId: i.clientId, count: 0 });
      g.clients.get(ck)!.count++;
    }
    return Array.from(map.entries())
      .map(([type, v]) => ({
        key: `t:${type}`,
        type,
        total: v.total,
        clients: Array.from(v.clients.values()).sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  const nbClients = useMemo(() => new Set(filtered.map((i) => i.clientId ?? i.clientLabel)).size, [filtered]);
  const nbTypes = useMemo(() => new Set(filtered.map((i) => i.type)).size, [filtered]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const label = kind === "moteurs" ? "moteurs" : "boîtes";

  return (
    <div>
      <PageHeader title="Synthèse des réservations" description="Moteurs et boîtes réservés, cumulés par client et par type" />

      {/* Onglets moteurs / boîtes */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-border bg-surface-alt">
          {(["moteurs", "boites"] as Kind[]).map((k) => (
            <button
              key={k}
              onClick={() => { setKind(k); setExpanded(new Set()); }}
              className={`px-4 py-2 text-sm font-medium transition-all ${kind === k ? "bg-brand text-white" : "text-text-dim hover:bg-surface-hover"}`}
            >
              {k === "moteurs" ? "Moteurs" : "Boîtes"}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-lg border border-border bg-surface-alt">
          {(["client", "type"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => { setView(v); setExpanded(new Set()); }}
              className={`px-4 py-2 text-sm font-medium transition-all ${view === v ? "bg-brand text-white" : "text-text-dim hover:bg-surface-hover"}`}
            >
              {v === "client" ? "Par client" : "Par type"}
            </button>
          ))}
        </div>
        <Input
          placeholder="Filtrer par client, type ou référence…"
          value={rawSearch}
          onChange={(e) => setRawSearch(e.target.value)}
          className="max-w-xs bg-surface-alt border-border text-foreground placeholder:text-text-muted"
        />
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">{label} réservés</p><p className="text-2xl font-bold text-brand">{filtered.length.toLocaleString("fr-FR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Clients</p><p className="text-2xl font-bold text-foreground">{nbClients}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Types distincts</p><p className="text-2xl font-bold text-foreground">{nbTypes}</p></CardContent></Card>
      </div>

      {loading ? (
        <div className="py-16 text-center text-text-muted">Chargement des réservations…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">
          Aucune réservation {search ? "ne correspond au filtre" : ""}
        </div>
      ) : view === "client" ? (
        <div className="space-y-2">
          {parClient.map((c) => {
            const open = expanded.has(c.key);
            return (
              <div key={c.key} className="overflow-hidden rounded-[14px] border border-border bg-surface">
                <button
                  onClick={() => toggle(c.key)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ChevronRight size={16} className={`shrink-0 text-text-muted transition-transform ${open ? "rotate-90" : ""}`} />
                    <Users size={15} className="shrink-0 text-text-dim" />
                    <span className="truncate font-semibold text-foreground">{c.label}</span>
                  </span>
                  <Badge className="shrink-0 border border-[rgba(196,30,58,0.20)] bg-brand-soft text-brand">{c.total} {label}</Badge>
                </button>
                {open && (
                  <div className="border-t border-border px-4 py-2">
                    {c.clientId !== null && (
                      <Link href={`/clients/${c.clientId}`} className="mb-2 inline-block text-xs text-brand hover:underline">
                        Voir la fiche client →
                      </Link>
                    )}
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase text-text-dim">
                        <tr>
                          <th className="py-2 text-left">Type</th>
                          <th className="py-2 text-center">Qté</th>
                          <th className="py-2 text-left">Références</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {c.types.map((t) => (
                          <tr key={t.type}>
                            <td className="py-2 pr-3 font-medium text-foreground">{t.type}</td>
                            <td className="py-2 text-center tabular-nums text-text-dim">{t.count}</td>
                            <td className="py-2 text-xs text-text-muted">{t.refs.length ? t.refs.join(", ") : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {parType.map((t) => {
            const open = expanded.has(t.key);
            return (
              <div key={t.key} className="overflow-hidden rounded-[14px] border border-border bg-surface">
                <button
                  onClick={() => toggle(t.key)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ChevronRight size={16} className={`shrink-0 text-text-muted transition-transform ${open ? "rotate-90" : ""}`} />
                    <Wrench size={15} className="shrink-0 text-text-dim" />
                    <span className="truncate font-semibold text-foreground">{t.type}</span>
                  </span>
                  <Badge className="shrink-0 border border-[rgba(196,30,58,0.20)] bg-brand-soft text-brand">{t.total} {label}</Badge>
                </button>
                {open && (
                  <div className="border-t border-border px-4 py-2">
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase text-text-dim">
                        <tr>
                          <th className="py-2 text-left">Client</th>
                          <th className="py-2 text-center">Qté réservée</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {t.clients.map((cl) => (
                          <tr key={cl.clientId ?? cl.label}>
                            <td className="py-2 font-medium text-foreground">
                              {cl.clientId !== null ? (
                                <Link href={`/clients/${cl.clientId}`} className="text-brand hover:underline">{cl.label}</Link>
                              ) : (
                                cl.label
                              )}
                            </td>
                            <td className="py-2 text-center tabular-nums text-text-dim">{cl.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
