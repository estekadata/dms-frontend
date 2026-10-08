"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Download, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { exportXlsx } from "@/lib/export";

type MoisRow = {
  mois: string;
  nb: number;
  montant: number;
  nbFact: number;
  montantFact: number;
};

function fmtEur(v: number) {
  return `${Math.round(v).toLocaleString("fr-FR")} €`;
}
function moisLabel(m: string) {
  // "2026-07" -> "juil. 2026"
  const [y, mo] = m.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}

export default function AchatsMensuelsPage() {
  const [rows, setRows] = useState<MoisRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // ~2300 réceptions : une seule requête paginée suffit
      const all: any[] = [];
      const PAGE = 5000;
      let from = 0;
      while (from < 100000) {
        const { data, error } = await supabase
          .from("tbl_receptions")
          .select("date_achat, montant_ht, facture")
          .order("date_achat", { ascending: false, nullsFirst: false })
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      const map = new Map<string, MoisRow>();
      for (const r of all) {
        if (!r.date_achat) continue;
        const k = String(r.date_achat).slice(0, 7);
        if (!map.has(k)) map.set(k, { mois: k, nb: 0, montant: 0, nbFact: 0, montantFact: 0 });
        const m = map.get(k)!;
        m.nb++;
        m.montant += r.montant_ht || 0;
        if (r.facture) {
          m.nbFact++;
          m.montantFact += r.montant_ht || 0;
        }
      }
      if (cancelled) return;
      setRows(Array.from(map.values()).sort((a, b) => b.mois.localeCompare(a.mois)));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function exportCsv() {
    if (!rows) return;
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = ["Mois", "Réceptions", "Montant HT", "Facturées", "Non facturées", "Montant facturé"].map(esc).join(";");
    const body = rows
      .map((r) =>
        [moisLabel(r.mois), String(r.nb), String(Math.round(r.montant)), String(r.nbFact), String(r.nb - r.nbFact), String(Math.round(r.montantFact))]
          .map(esc)
          .join(";")
      )
      .join("\n");
    const blob = new Blob(["﻿" + header + "\n" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `achats-mensuels-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportExcel() {
    if (!rows) return;
    const aoa: (string | number)[][] = [["Mois", "Réceptions", "Montant HT", "Facturées", "Non facturées", "Montant facturé"]];
    rows.forEach((r) => aoa.push([moisLabel(r.mois), r.nb, Math.round(r.montant), r.nbFact, r.nb - r.nbFact, Math.round(r.montantFact)]));
    exportXlsx(`achats-mensuels-${new Date().toISOString().slice(0, 10)}`, [{ name: "Achats mensuels", aoa }]);
  }

  const tot = rows
    ? rows.reduce((a, r) => ({ nb: a.nb + r.nb, montant: a.montant + r.montant, nbFact: a.nbFact + r.nbFact, montantFact: a.montantFact + r.montantFact }), { nb: 0, montant: 0, nbFact: 0, montantFact: 0 })
    : { nb: 0, montant: 0, nbFact: 0, montantFact: 0 };

  return (
    <div>
      <Link href="/etats" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground print:hidden">
        <ArrowLeft size={14} /> Retour aux états
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Achats mensuels" description="Réceptions fournisseurs par mois, montant HT et statut de facturation." />
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={exportExcel} disabled={!rows || rows.length === 0}>
            <FileSpreadsheet size={14} className="mr-1" /> Export Excel
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!rows || rows.length === 0}>
            <Download size={14} className="mr-1" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!rows || rows.length === 0}>
            <Printer size={14} className="mr-1" /> Imprimer
          </Button>
        </div>
      </div>

      {rows === null ? (
        <div className="py-16 text-center text-text-muted">Calcul des achats mensuels…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">Aucune réception.</div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Réceptions</p><p className="text-2xl font-bold text-foreground">{tot.nb.toLocaleString("fr-FR")}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Montant HT total</p><p className="text-2xl font-bold text-brand">{fmtEur(tot.montant)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Facturées</p><p className="text-2xl font-bold text-emerald-600">{tot.nbFact.toLocaleString("fr-FR")}<span className="ml-1 text-sm text-text-muted">/ {tot.nb}</span></p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Montant facturé</p><p className="text-2xl font-bold text-foreground">{fmtEur(tot.montantFact)}</p></CardContent></Card>
          </div>

          <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt text-xs uppercase text-text-dim">
                  <tr>
                    <th className="px-4 py-3 text-left">Mois</th>
                    <th className="px-4 py-3 text-center">Réceptions</th>
                    <th className="px-4 py-3 text-right">Montant HT</th>
                    <th className="px-4 py-3 text-center">Facturation</th>
                    <th className="px-4 py-3 text-right">Montant facturé</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.mois} className="transition-colors hover:bg-surface-hover">
                      <td className="px-4 py-2.5 font-medium text-foreground">{moisLabel(r.mois)}</td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-text-dim">{r.nb}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-dim">{fmtEur(r.montant)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {r.nb - r.nbFact === 0 ? (
                          <Badge className="border border-[rgba(52,211,153,0.20)] bg-[rgba(52,211,153,0.10)] text-emerald-600">Tout facturé</Badge>
                        ) : (
                          <Badge className="border border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.10)] text-amber-600">{r.nb - r.nbFact} non facturée{r.nb - r.nbFact > 1 ? "s" : ""}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-dim">{fmtEur(r.montantFact)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-surface-alt font-semibold">
                    <td className="px-4 py-3 text-foreground">Total</td>
                    <td className="px-4 py-3 text-center tabular-nums text-foreground">{tot.nb.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-brand">{fmtEur(tot.montant)}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-text-muted">{tot.nbFact}/{tot.nb} facturées</td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-dim">{fmtEur(tot.montantFact)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
