"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Raw = { date_reception: string | null; nb_moteurs: number | null };
type JourRow = { jour: string; nb: number; moteurs: number };

const PERIODS = [
  { label: "30 jours", days: 30 },
  { label: "90 jours", days: 90 },
  { label: "1 an", days: 365 },
  { label: "Tout", days: 0 },
];

function jourLabel(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function ReceptionsJourPage() {
  const [raw, setRaw] = useState<Raw[] | null>(null);
  const [days, setDays] = useState(90);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all: Raw[] = [];
      const PAGE = 5000;
      let from = 0;
      while (from < 100000) {
        const { data, error } = await supabase
          .from("v_receptions")
          .select("date_reception, nb_moteurs")
          .order("date_reception", { ascending: false, nullsFirst: false })
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (!cancelled) setRaw(all);
    })();
    return () => { cancelled = true; };
  }, []);

  const rows: JourRow[] | null = useMemo(() => {
    if (!raw) return null;
    const cutoff = days > 0 ? new Date(Date.now() - days * 86400000) : null;
    const map = new Map<string, JourRow>();
    for (const r of raw) {
      if (!r.date_reception) continue;
      const d = new Date(r.date_reception);
      if (cutoff && d < cutoff) continue;
      const k = String(r.date_reception).slice(0, 10);
      if (!map.has(k)) map.set(k, { jour: k, nb: 0, moteurs: 0 });
      const j = map.get(k)!;
      j.nb++;
      j.moteurs += r.nb_moteurs || 0;
    }
    return Array.from(map.values()).sort((a, b) => b.jour.localeCompare(a.jour));
  }, [raw, days]);

  const tot = useMemo(
    () => (rows ? rows.reduce((a, r) => ({ nb: a.nb + r.nb, moteurs: a.moteurs + r.moteurs }), { nb: 0, moteurs: 0 }) : { nb: 0, moteurs: 0 }),
    [rows]
  );
  const moyenne = rows && rows.length ? Math.round(tot.moteurs / rows.length) : 0;

  function exportCsv() {
    if (!rows) return;
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = ["Jour", "Réceptions", "Moteurs reçus"].map(esc).join(";");
    const body = rows.map((r) => [jourLabel(r.jour), String(r.nb), String(r.moteurs)].map(esc).join(";")).join("\n");
    const blob = new Blob(["﻿" + header + "\n" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receptions-par-jour-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <Link href="/etats" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground print:hidden">
        <ArrowLeft size={14} /> Retour aux états
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Réceptions par jour" description="Nombre de réceptions et de moteurs reçus, jour par jour." />
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={exportCsv} disabled={!rows || rows.length === 0}>
            <Download size={14} className="mr-1" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!rows || rows.length === 0}>
            <Printer size={14} className="mr-1" /> Imprimer
          </Button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
        <span className="mr-1 text-xs font-semibold uppercase text-text-muted">Période</span>
        {PERIODS.map((p) => (
          <button
            key={p.days}
            onClick={() => setDays(p.days)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${days === p.days ? "bg-brand text-white" : "bg-surface-alt text-text-dim hover:bg-surface-hover"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="py-16 text-center text-text-muted">Calcul…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">Aucune réception sur la période.</div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-3 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Jours avec réception</p><p className="text-2xl font-bold text-foreground">{rows.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Moteurs reçus</p><p className="text-2xl font-bold text-brand">{tot.moteurs.toLocaleString("fr-FR")}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Moyenne / jour</p><p className="text-2xl font-bold text-foreground">{moyenne}</p></CardContent></Card>
          </div>

          <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
            <div className="max-h-[70vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-alt text-xs uppercase text-text-dim">
                  <tr>
                    <th className="px-4 py-3 text-left">Jour</th>
                    <th className="px-4 py-3 text-center">Réceptions</th>
                    <th className="px-4 py-3 text-center">Moteurs reçus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.jour} className="transition-colors hover:bg-surface-hover">
                      <td className="px-4 py-2.5 font-medium text-foreground">{jourLabel(r.jour)}</td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-text-dim">{r.nb}</td>
                      <td className="px-4 py-2.5 text-center font-semibold tabular-nums text-brand">{r.moteurs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
