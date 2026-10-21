"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

type Exp = { n_expedition: number; date: string | null; client: string; transitaire: string };

export default function JustificatifsPage() {
  const [rows, setRows] = useState<Exp[] | null>(null);
  const [migMissing, setMigMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("tbl_expeditions")
        .select("n_expedition, n_client, n_transitaire, date_chargement")
        .eq("expedition_terminee", true)
        .eq("justificatif_recu", false)
        .order("date_chargement", { ascending: false, nullsFirst: false })
        .limit(500);
      if (cancelled) return;
      if (error) { setMigMissing(true); setRows([]); return; }
      const exps = (data as any[]) || [];
      const clientIds = [...new Set(exps.map((e) => e.n_client).filter(Boolean))] as number[];
      const nameById: Record<number, string> = {};
      for (let i = 0; i < clientIds.length; i += 400) {
        const slice = clientIds.slice(i, i + 400);
        const { data: c } = await supabase.from("tbl_clients").select("n_client, societe, nom_usage, nom_contact").in("n_client", slice);
        (c || []).forEach((x: any) => { nameById[x.n_client] = x.societe || x.nom_usage || x.nom_contact || `Client #${x.n_client}`; });
      }
      if (cancelled) return;
      setRows(exps.map((e) => ({
        n_expedition: e.n_expedition,
        date: e.date_chargement,
        client: e.n_client != null ? nameById[e.n_client] || `Client #${e.n_client}` : "—",
        transitaire: e.n_transitaire ? String(e.n_transitaire) : "—",
      })));
    })();
    return () => { cancelled = true; };
  }, []);

  // Regroupement par transitaire
  const groups = (() => {
    if (!rows) return [];
    const m = new Map<string, Exp[]>();
    for (const r of rows) { if (!m.has(r.transitaire)) m.set(r.transitaire, []); m.get(r.transitaire)!.push(r); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  })();

  return (
    <div>
      <Link href="/historique" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground">
        <ArrowLeft size={14} /> Retour à l&apos;historique
      </Link>
      <PageHeader title="Justificatifs d'export manquants" description="Expéditions terminées dont le justificatif de livraison n'a pas encore été reçu, par transitaire." />

      {migMissing ? (
        <div className="rounded-[14px] border border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.06)] px-4 py-3 text-sm text-amber-700">
          Fonction indisponible : exécute <span className="font-mono">create_col_justificatif_livraison.sql</span> dans Supabase.
        </div>
      ) : rows === null ? (
        <div className="py-16 text-center text-text-muted">Chargement…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-[14px] border border-[rgba(52,211,153,0.25)] bg-[rgba(52,211,153,0.06)] py-10 text-center text-emerald-600">Aucun justificatif manquant. 👍</div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3">
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Justificatifs manquants</p><p className="text-2xl font-bold text-amber-600">{rows.length}{rows.length >= 500 ? "+" : ""}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Transitaires concernés</p><p className="text-2xl font-bold text-foreground">{groups.length}</p></CardContent></Card>
          </div>
          {groups.map(([transitaire, list]) => (
            <div key={transitaire} className="mb-6">
              <h3 className="mb-2 flex items-center gap-2 font-semibold text-foreground"><AlertTriangle size={15} className="text-amber-600" /> Transitaire {transitaire} ({list.length})</h3>
              <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead className="bg-surface-alt text-xs uppercase text-text-dim"><tr><th className="px-4 py-3 text-left">N° expédition</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Client</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {list.map((e) => (
                      <tr key={e.n_expedition} className="transition-colors hover:bg-surface-hover">
                        <td className="px-4 py-2.5"><Link href={`/expeditions/${e.n_expedition}`} className="font-mono text-xs font-semibold text-brand hover:underline">#{e.n_expedition}</Link></td>
                        <td className="px-4 py-2.5 text-text-dim">{e.date ? new Date(e.date).toLocaleDateString("fr-FR") : "—"}</td>
                        <td className="px-4 py-2.5 font-medium text-foreground">{e.client}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <p className="mt-2 text-xs text-text-muted">500 plus récentes au maximum. Marque un justificatif comme reçu depuis la fiche expédition.</p>
        </>
      )}
    </div>
  );
}
