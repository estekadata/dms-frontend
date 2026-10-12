"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { exportXlsx } from "@/lib/export";

type Marge = {
  type_moteur: string;
  marque: string;
  nb_vendus: number;
  prix_achat_moy: number;
  prix_vente_moy: number;
  marge_unitaire: number;
  marge_pct: number;
};

const PERIODS = [
  { label: "3 mois", v: 3 },
  { label: "6 mois", v: 6 },
  { label: "12 mois", v: 12 },
  { label: "24 mois", v: 24 },
];

function fmtEur(v: number | null | undefined) {
  return v == null ? "—" : `${Math.round(v).toLocaleString("fr-FR")} €`;
}

export default function MargesPage() {
  const [rows, setRows] = useState<Marge[] | null>(null);
  const [months, setMonths] = useState(12);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRows(null);
      const { data, error } = await supabase.rpc("get_marges_moteurs", { p_months: months, p_limit: 1000 });
      if (cancelled) return;
      if (error) {
        setMissing(true);
        setRows([]);
        return;
      }
      setMissing(false);
      setRows((data as Marge[]) || []);
    })();
    return () => { cancelled = true; };
  }, [months]);

  const tot = rows
    ? rows.reduce(
        (a, r) => ({
          nb: a.nb + r.nb_vendus,
          ca: a.ca + r.prix_vente_moy * r.nb_vendus,
          marge: a.marge + r.marge_unitaire * r.nb_vendus,
        }),
        { nb: 0, ca: 0, marge: 0 }
      )
    : { nb: 0, ca: 0, marge: 0 };
  const margePctGlobal = tot.ca > 0 ? (tot.marge / tot.ca) * 100 : 0;

  function exportExcel() {
    if (!rows) return;
    const aoa: (string | number)[][] = [["Type", "Marque", "Vendus", "Prix achat moy (€)", "Prix vente moy (€)", "Marge unit. (€)", "Marge %"]];
    rows.forEach((r) => aoa.push([r.type_moteur, r.marque, r.nb_vendus, r.prix_achat_moy, r.prix_vente_moy, r.marge_unitaire, r.marge_pct]));
    exportXlsx(`marges-moteurs-${months}mois-${new Date().toISOString().slice(0, 10)}`, [{ name: "Marges", aoa }]);
  }

  return (
    <div>
      <Link href="/etats" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground print:hidden">
        <ArrowLeft size={14} /> Retour aux états
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Marges par type" description="Prix d'achat vs prix de vente moyens et marge, par type de moteur, sur la période." />
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={exportExcel} disabled={!rows || rows.length === 0}>
            <FileSpreadsheet size={14} className="mr-1" /> Export Excel
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
            key={p.v}
            onClick={() => setMonths(p.v)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${months === p.v ? "bg-brand text-white" : "bg-surface-alt text-text-dim hover:bg-surface-hover"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {missing ? (
        <div className="rounded-[14px] border border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.06)] p-5 text-sm text-amber-700">
          <p className="font-semibold">Fonction SQL manquante</p>
          <p className="mt-1">Exécute la migration <span className="font-mono">create_get_marges_moteurs.sql</span> dans le SQL Editor de Supabase pour activer ce rapport.</p>
        </div>
      ) : rows === null ? (
        <div className="py-16 text-center text-text-muted">Calcul des marges…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">Aucune vente sur la période.</div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Moteurs vendus</p><p className="text-2xl font-bold text-foreground">{tot.nb.toLocaleString("fr-FR")}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">CA (vente)</p><p className="text-2xl font-bold text-foreground">{fmtEur(tot.ca)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Marge totale</p><p className="text-2xl font-bold text-brand">{fmtEur(tot.marge)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Marge moyenne</p><p className={`text-2xl font-bold ${margePctGlobal >= 0 ? "text-emerald-600" : "text-destructive"}`}>{margePctGlobal.toFixed(1)} %</p></CardContent></Card>
          </div>

          <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
            <div className="max-h-[70vh] overflow-y-auto print:max-h-none print:overflow-visible">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-alt text-xs uppercase text-text-dim">
                  <tr>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Marque</th>
                    <th className="px-4 py-3 text-center">Vendus</th>
                    <th className="px-4 py-3 text-right">Achat moy.</th>
                    <th className="px-4 py-3 text-right">Vente moy.</th>
                    <th className="px-4 py-3 text-right">Marge unit.</th>
                    <th className="px-4 py-3 text-right">Marge %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r, i) => (
                    <tr key={`${r.type_moteur}-${i}`} className="transition-colors hover:bg-surface-hover">
                      <td className="px-4 py-2.5 font-medium text-foreground">{r.type_moteur}</td>
                      <td className="px-4 py-2.5 text-text-dim">{r.marque || "—"}</td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-text-dim">{r.nb_vendus}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-dim">{fmtEur(r.prix_achat_moy)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-dim">{fmtEur(r.prix_vente_moy)}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${r.marge_unitaire >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmtEur(r.marge_unitaire)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${r.marge_pct >= 0 ? "text-emerald-600" : "text-destructive"}`}>{r.marge_pct?.toFixed(1)} %</td>
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
