"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

const PERIODS = [
  { label: "3 mois", v: 3 },
  { label: "6 mois", v: 6 },
  { label: "12 mois", v: 12 },
  { label: "24 mois", v: 24 },
];
const TOP_N = 15;

type TopRow = { label: string; sub: string; nb: number; ca: number | null };

function fmtEur(v: number | null) {
  return v == null || v === 0 ? "—" : `${Math.round(v).toLocaleString("fr-FR")} €`;
}

export default function TopVentesPage() {
  const [months, setMonths] = useState(6);
  const [topMot, setTopMot] = useState<TopRow[] | null>(null);
  const [topBv, setTopBv] = useState<TopRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setTopMot(null);
    setTopBv(null);

    // --- Moteurs : via la RPC besoins (nb_vendus par type) ---
    const { data: besoins } = await supabase.rpc("get_besoins_moteurs", { p_limit: 5000, p_months: months });
    const mot: TopRow[] = ((besoins as any[]) || [])
      .filter((b) => (b.nb_vendus_3m || 0) > 0)
      .sort((a, b) => b.nb_vendus_3m - a.nb_vendus_3m)
      .slice(0, TOP_N)
      .map((b) => ({ label: b.code_moteur || "—", sub: b.marque || "", nb: b.nb_vendus_3m, ca: null }));
    setTopMot(mot);

    // --- Boîtes : expeditions_boites filtrées + résolution du type ---
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffIso = cutoff.toISOString();
    const ventes: any[] = [];
    let from = 0;
    while (from < 100000) {
      const { data, error } = await supabase
        .from("tbl_expeditions_boites")
        .select("n_bv, prix_vente_bv")
        .gte("date_validation", cutoffIso)
        .order("n_bv", { ascending: true })
        .range(from, from + 4999);
      if (error || !data || data.length === 0) break;
      ventes.push(...data);
      if (data.length < 5000) break;
      from += 5000;
    }
    const bvIds = [...new Set(ventes.map((v) => v.n_bv).filter(Boolean))] as number[];
    const typeByBv: Record<number, string> = {};
    for (let i = 0; i < bvIds.length; i += 500) {
      const slice = bvIds.slice(i, i + 500);
      const { data } = await supabase.from("v_boites_dispo").select("n_bv, type_bv, ref_bv").in("n_bv", slice);
      (data || []).forEach((b: any) => {
        typeByBv[b.n_bv] = b.type_bv || b.ref_bv || "—";
      });
    }
    const bvMap = new Map<string, { nb: number; ca: number }>();
    for (const v of ventes) {
      const k = typeByBv[v.n_bv] || "—";
      if (!bvMap.has(k)) bvMap.set(k, { nb: 0, ca: 0 });
      const g = bvMap.get(k)!;
      g.nb++;
      g.ca += v.prix_vente_bv || 0;
    }
    const bv: TopRow[] = Array.from(bvMap.entries())
      .map(([label, g]) => ({ label, sub: "", nb: g.nb, ca: g.ca }))
      .sort((a, b) => b.nb - a.nb)
      .slice(0, TOP_N);
    setTopBv(bv);
    setLoading(false);
  }, [months]);

  useEffect(() => {
    load();
  }, [load]);

  function exportCsv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines: string[] = [];
    lines.push(esc(`Top ${TOP_N} moteurs vendus (${months} mois)`));
    lines.push(["Rang", "Type moteur", "Marque", "Vendus"].map(esc).join(";"));
    (topMot || []).forEach((r, i) => lines.push([String(i + 1), r.label, r.sub, String(r.nb)].map(esc).join(";")));
    lines.push("");
    lines.push(esc(`Top ${TOP_N} boîtes vendues (${months} mois)`));
    lines.push(["Rang", "Type BV", "Vendues", "CA"].map(esc).join(";"));
    (topBv || []).forEach((r, i) => lines.push([String(i + 1), r.label, String(r.nb), String(Math.round(r.ca || 0))].map(esc).join(";")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `top-ventes-${months}mois-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const TopTable = ({ title, rows, colLabel, withCa }: { title: string; rows: TopRow[] | null; colLabel: string; withCa?: boolean }) => (
    <div>
      <h3 className="mb-3 font-semibold text-foreground">{title}</h3>
      <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-xs uppercase text-text-dim">
            <tr>
              <th className="w-10 px-4 py-3 text-center">#</th>
              <th className="px-4 py-3 text-left">{colLabel}</th>
              <th className="px-4 py-3 text-center">Vendus</th>
              {withCa && <th className="px-4 py-3 text-right">CA</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {!rows ? (
              <tr><td colSpan={withCa ? 4 : 3} className="px-4 py-6 text-center text-text-muted">Chargement…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={withCa ? 4 : 3} className="px-4 py-6 text-center italic text-text-muted">Aucune vente sur la période.</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.label + i} className="transition-colors hover:bg-surface-hover">
                  <td className="px-4 py-2.5 text-center tabular-nums text-text-muted">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {r.label}
                    {r.sub ? <span className="ml-2 text-xs font-normal text-text-muted">{r.sub}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-center font-semibold tabular-nums text-brand">{r.nb}</td>
                  {withCa && <td className="px-4 py-2.5 text-right tabular-nums text-text-dim">{fmtEur(r.ca)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      <Link href="/etats" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground print:hidden">
        <ArrowLeft size={14} /> Retour aux états
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Top 15 des ventes" description="Moteurs et boîtes les plus vendus sur la période." />
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={exportCsv} disabled={loading}>
            <Download size={14} className="mr-1" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={loading}>
            <Printer size={14} className="mr-1" /> Imprimer
          </Button>
        </div>
      </div>

      {/* Période */}
      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
        <span className="mr-1 text-xs font-semibold uppercase text-text-muted">Période</span>
        {PERIODS.map((p) => (
          <button
            key={p.v}
            onClick={() => setMonths(p.v)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${months === p.v ? "bg-brand text-white" : "bg-surface-alt text-text-dim hover:bg-surface-hover"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TopTable title={`Top ${TOP_N} moteurs vendus`} rows={topMot} colLabel="Type moteur" />
        <TopTable title={`Top ${TOP_N} boîtes vendues`} rows={topBv} colLabel="Type BV" withCa />
      </div>
    </div>
  );
}
