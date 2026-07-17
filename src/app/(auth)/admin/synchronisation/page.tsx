"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

type LogRow = {
  id: number;
  started_at: string | null;
  finished_at: string | null;
  source_file: string | null;
  table_name: string | null;
  sync_strategy: string | null;
  rows_read: number | null;
  rows_inserted: number | null;
  rows_updated: number | null;
  rows_skipped: number | null;
  error_message: string | null;
  mode: string | null;
};
type MetaRow = { table_name: string; last_sync_at: string | null; last_max_date: string | null };

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}
function timeAgo(iso?: string | null) {
  if (!iso) return "jamais";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "il y a moins d'une heure";
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}
const nf = (n: number | null | undefined) => new Intl.NumberFormat("fr-FR").format(n || 0);

function Stat({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="rounded-xl bg-surface-alt px-4 py-2 text-center">
      <p className={`text-xl font-bold leading-none ${cls}`}>{value}</p>
      <p className="mt-1 text-[10px] uppercase text-text-muted">{label}</p>
    </div>
  );
}

export default function SynchronisationPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [meta, setMeta] = useState<MetaRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: l }, { data: m }] = await Promise.all([
      supabase.from("import_log").select("*").order("id", { ascending: false }).limit(300),
      supabase.from("sync_metadata").select("*").order("table_name"),
    ]);
    setLogs((l as LogRow[]) || []);
    setMeta((m as MetaRow[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const info = useMemo(() => {
    const t = (r: LogRow) => new Date(r.finished_at || r.started_at || 0).getTime();
    const withTime = logs.filter((r) => r.finished_at || r.started_at);
    const lastTime = withTime.length ? Math.max(...withTime.map(t)) : 0;
    // Une "session" = les lignes de log dans les 2h autour de la plus récente.
    const session = withTime.filter((r) => lastTime - t(r) <= 2 * 3_600_000);
    const sum = (k: keyof LogRow) => session.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const errors = session.filter((r) => r.error_message).length + sum("rows_skipped");
    const hours = lastTime ? (Date.now() - lastTime) / 3_600_000 : Infinity;
    const health =
      hours < 30
        ? { label: "À jour", cls: "text-emerald-600", bg: "bg-emerald-500/10", Icon: CheckCircle2 }
        : hours < 72
        ? { label: "En retard", cls: "text-amber-600", bg: "bg-amber-500/10", Icon: Clock }
        : { label: "Aucune synchro récente", cls: "text-destructive", bg: "bg-destructive/10", Icon: AlertTriangle };
    return {
      lastIso: lastTime ? new Date(lastTime).toISOString() : null,
      source: session[0]?.source_file || null,
      inserted: sum("rows_inserted"),
      updated: sum("rows_updated"),
      errors,
      health,
      session,
    };
  }, [logs]);

  const perTable = useMemo(() => {
    const agg: Record<string, { inserted: number; updated: number; skipped: number; error: string | null }> = {};
    for (const r of info.session) {
      if (!r.table_name) continue;
      const a = agg[r.table_name] || { inserted: 0, updated: 0, skipped: 0, error: null };
      a.inserted += r.rows_inserted || 0;
      a.updated += r.rows_updated || 0;
      a.skipped += r.rows_skipped || 0;
      if (r.error_message) a.error = r.error_message;
      agg[r.table_name] = a;
    }
    const names = new Set<string>([...meta.map((m) => m.table_name), ...Object.keys(agg)]);
    return [...names].sort().map((name) => ({
      name,
      last_sync_at: meta.find((m) => m.table_name === name)?.last_sync_at || null,
      last_max_date: meta.find((m) => m.table_name === name)?.last_max_date || null,
      ...(agg[name] || { inserted: 0, updated: 0, skipped: 0, error: null }),
    }));
  }, [meta, info.session]);

  const H = info.health.Icon;

  return (
    <div>
      <PageHeader title="Synchronisation" description="Suivi des mises à jour Access → Supabase" />

      <div className="mb-4 flex items-start gap-3 rounded-[14px] border border-brand-mid bg-brand-soft px-4 py-3">
        <RefreshCw size={18} className="mt-0.5 shrink-0 text-brand" />
        <div className="text-sm">
          <p className="font-semibold text-foreground">Comment mettre à jour la base</p>
          <p className="mt-0.5 text-text-dim">
            Sur le PC, lancez l&apos;outil <span className="font-medium text-foreground">«&nbsp;Mettre à jour la base Multirex&nbsp;»</span> :
            choisissez le fichier <span className="font-mono text-foreground">Achats_données.accdb</span>, puis
            «&nbsp;Lancer la mise à jour&nbsp;». Cette page affiche ensuite l&apos;état de la dernière synchro.
          </p>
        </div>
      </div>

      <div className="mb-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className="mr-2" /> Rafraîchir
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-text-muted">Chargement…</div>
      ) : (
        <>
          {/* Statut global */}
          <Card className="mb-6">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${info.health.bg} ${info.health.cls}`}
                  >
                    <H size={16} /> {info.health.label}
                  </span>
                  <p className="mt-3 text-sm text-text-dim">
                    Dernière synchro : <span className="font-semibold text-foreground">{timeAgo(info.lastIso)}</span>
                    <span className="text-text-muted"> ({fmtDateTime(info.lastIso)})</span>
                  </p>
                  {info.source && <p className="mt-1 text-xs text-text-muted">Source : {info.source}</p>}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Ajoutées" value={nf(info.inserted)} cls="text-emerald-600" />
                  <Stat label="Modifiées" value={nf(info.updated)} cls="text-brand" />
                  <Stat label="Erreurs" value={nf(info.errors)} cls={info.errors > 0 ? "text-destructive" : "text-text-dim"} />
                </div>
              </div>
              {info.health.label !== "À jour" && (
                <p className="mt-4 rounded-lg bg-surface-alt px-3 py-2 text-xs text-text-dim">
                  La synchro est prévue chaque nuit (03:00) sur le PC du client. Si la date ci-dessus n&apos;avance pas,
                  vérifier que la tâche planifiée tourne (PC allumé la nuit) — voir le guide d&apos;installation.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Par table */}
          <h2 className="mb-3 text-base font-semibold text-text-dim">Par table</h2>
          <div className="mb-6 overflow-x-auto rounded-[14px] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-xs uppercase text-text-dim">
                <tr>
                  <th className="px-4 py-3 text-left">Table</th>
                  <th className="px-4 py-3 text-left">Dernière synchro</th>
                  <th className="px-4 py-3 text-left">Données jusqu&apos;au</th>
                  <th className="px-4 py-3 text-right">Ajoutées</th>
                  <th className="px-4 py-3 text-right">Modifiées</th>
                  <th className="px-4 py-3 text-center">Erreurs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {perTable.map((t) => (
                  <tr key={t.name} className="hover:bg-surface-hover">
                    <td className="px-4 py-3 font-medium text-foreground">{t.name}</td>
                    <td className="px-4 py-3 text-xs text-text-dim">{fmtDateTime(t.last_sync_at)}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {t.last_max_date ? new Date(t.last_max_date).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600">{nf(t.inserted)}</td>
                    <td className="px-4 py-3 text-right">{nf(t.updated)}</td>
                    <td className="px-4 py-3 text-center">
                      {t.error ? (
                        <span title={t.error} className="text-destructive">
                          ⚠
                        </span>
                      ) : t.skipped > 0 ? (
                        <span className="text-destructive">{t.skipped}</span>
                      ) : (
                        <span className="text-text-muted">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {perTable.length === 0 && <p className="py-8 text-center italic text-text-muted">Aucune donnée de synchro</p>}
          </div>

          {/* Historique */}
          <h2 className="mb-3 text-base font-semibold text-text-dim">Historique récent</h2>
          <div className="overflow-x-auto rounded-[14px] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-xs uppercase text-text-dim">
                <tr>
                  <th className="px-4 py-3 text-left">Quand</th>
                  <th className="px-4 py-3 text-left">Table</th>
                  <th className="px-4 py-3 text-left">Stratégie</th>
                  <th className="px-4 py-3 text-right">Lues</th>
                  <th className="px-4 py-3 text-right">Ajoutées</th>
                  <th className="px-4 py-3 text-right">Modifiées</th>
                  <th className="px-4 py-3 text-left">Erreur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.slice(0, 30).map((r) => (
                  <tr key={r.id} className="hover:bg-surface-hover">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-text-muted">
                      {fmtDateTime(r.finished_at || r.started_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{r.table_name}</td>
                    <td className="px-4 py-3 text-xs text-text-dim">{r.sync_strategy}</td>
                    <td className="px-4 py-3 text-right text-text-dim">{nf(r.rows_read)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{nf(r.rows_inserted)}</td>
                    <td className="px-4 py-3 text-right">{nf(r.rows_updated)}</td>
                    <td className="px-4 py-3 text-xs text-destructive">{r.error_message || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 && <p className="py-8 text-center italic text-text-muted">Aucun historique</p>}
          </div>
        </>
      )}
    </div>
  );
}
