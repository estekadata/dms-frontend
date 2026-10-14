"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { exportXlsx } from "@/lib/export";
import { etatMoteurLabel } from "@/components/moteur-statuts";

const AFFECT_DEMONTAGE = 4;
const ETATS_KO = new Set([5, 6, 7, 9]); // Bloqué, Sans compressions, Bloc cassé, HS
const ETAT_ORDER = [4, 5, 6, 7, 9];

type Mot = {
  n_moteur: number;
  interne: string | null;
  type: string;
  marque: string | null;
  etat: number | null;
  affect: number | null;
};

export default function DemontagePage() {
  const [mots, setMots] = useState<Mot[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all: Mot[] = [];
      const PAGE = 5000;
      let from = 0;
      while (from < 200000) {
        const { data, error } = await supabase
          .from("v_moteurs_dispo")
          .select("n_moteur, num_interne_moteur, nom_type_moteur, code_moteur, marque, etat_moteur, n_affectation")
          .eq("est_disponible", 1)
          .order("n_moteur", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        data.forEach((m: any) =>
          all.push({
            n_moteur: m.n_moteur,
            interne: m.num_interne_moteur,
            type: m.nom_type_moteur || m.code_moteur || `Moteur ${m.n_moteur}`,
            marque: m.marque,
            etat: m.etat_moteur ?? null,
            affect: m.n_affectation ?? null,
          })
        );
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (!cancelled) setMots(all);
    })();
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    if (!mots) return null;
    const total = mots.length;
    const avecEtat = mots.filter((m) => m.etat != null);
    const ko = avecEtat.filter((m) => ETATS_KO.has(m.etat!)).length;
    const ratioKo = avecEtat.length ? (ko / avecEtat.length) * 100 : 0;
    const parEtat = ETAT_ORDER.map((e) => ({ etat: e, label: etatMoteurLabel(e) || String(e), n: mots.filter((m) => m.etat === e).length }));
    // Ratio KO par marque (marques avec assez de volume)
    const byMarque = new Map<string, { total: number; ko: number }>();
    for (const m of avecEtat) {
      const k = m.marque || "—";
      if (!byMarque.has(k)) byMarque.set(k, { total: 0, ko: 0 });
      const g = byMarque.get(k)!;
      g.total++;
      if (ETATS_KO.has(m.etat!)) g.ko++;
    }
    const marques = Array.from(byMarque.entries())
      .filter(([, g]) => g.total >= 20)
      .map(([marque, g]) => ({ marque, total: g.total, ko: g.ko, ratio: (g.ko / g.total) * 100 }))
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 12);
    const aDemonter = mots.filter((m) => m.affect === AFFECT_DEMONTAGE).sort((a, b) => (a.interne || "").localeCompare(b.interne || "", "fr", { numeric: true }));
    return { total, ko, ratioKo, parEtat, marques, aDemonter };
  }, [mots]);

  function exportExcel() {
    if (!stats) return;
    const etatAoa: (string | number)[][] = [["État mécanique", "Nombre"]];
    stats.parEtat.forEach((e) => etatAoa.push([e.label, e.n]));
    etatAoa.push(["Ratio KO (%)", Number(stats.ratioKo.toFixed(1))]);
    const demAoa: (string | number)[][] = [["N° interne", "N° moteur", "Type", "Marque", "État"]];
    stats.aDemonter.forEach((m) => demAoa.push([m.interne || "", m.n_moteur, m.type, m.marque || "", etatMoteurLabel(m.etat) || ""]));
    exportXlsx(`demontage-qualite-${new Date().toISOString().slice(0, 10)}`, [
      { name: "Qualité (ratio KO)", aoa: etatAoa },
      { name: "À démonter", aoa: demAoa },
    ]);
  }

  return (
    <div>
      <Link href="/etats" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground print:hidden">
        <ArrowLeft size={14} /> Retour aux états
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Démontage & qualité (ratio KO)" description="Moteurs à démonter et indicateur de qualité mécanique du stock (ratio KO)." />
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={exportExcel} disabled={!stats}><FileSpreadsheet size={14} className="mr-1" /> Export Excel</Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!stats}><Printer size={14} className="mr-1" /> Imprimer</Button>
        </div>
      </div>

      {!stats ? (
        <div className="py-16 text-center text-text-muted">Analyse du stock…</div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Moteurs en stock</p><p className="text-2xl font-bold text-foreground">{stats.total.toLocaleString("fr-FR")}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Moteurs KO</p><p className="text-2xl font-bold text-destructive">{stats.ko.toLocaleString("fr-FR")}</p><p className="text-xs text-text-muted">bloqué / sans compression / bloc cassé / HS</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Ratio KO</p><p className={`text-2xl font-bold ${stats.ratioKo > 10 ? "text-destructive" : "text-amber-600"}`}>{stats.ratioKo.toFixed(1)} %</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">À démonter</p><p className="text-2xl font-bold text-brand">{stats.aDemonter.length.toLocaleString("fr-FR")}</p></CardContent></Card>
          </div>

          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            {/* État mécanique */}
            <div>
              <h3 className="mb-3 font-semibold text-foreground">Répartition par état mécanique</h3>
              <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead className="bg-surface-alt text-xs uppercase text-text-dim"><tr><th className="px-4 py-3 text-left">État</th><th className="px-4 py-3 text-center">Nombre</th><th className="px-4 py-3 text-right">%</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {stats.parEtat.map((e) => (
                      <tr key={e.etat} className={ETATS_KO.has(e.etat) ? "bg-[rgba(248,113,113,0.04)]" : ""}>
                        <td className="px-4 py-2.5 font-medium text-foreground">{e.label}{ETATS_KO.has(e.etat) ? <span className="ml-2 text-xs text-destructive">KO</span> : null}</td>
                        <td className="px-4 py-2.5 text-center tabular-nums text-text-dim">{e.n.toLocaleString("fr-FR")}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-text-dim">{stats.total ? ((e.n / stats.total) * 100).toFixed(1) : "0"} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Ratio KO par marque */}
            <div>
              <h3 className="mb-3 font-semibold text-foreground">Ratio KO par marque (≥ 20 moteurs)</h3>
              <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead className="bg-surface-alt text-xs uppercase text-text-dim"><tr><th className="px-4 py-3 text-left">Marque</th><th className="px-4 py-3 text-center">Stock</th><th className="px-4 py-3 text-center">KO</th><th className="px-4 py-3 text-right">Ratio</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {stats.marques.map((m) => (
                      <tr key={m.marque}>
                        <td className="px-4 py-2.5 font-medium text-foreground">{m.marque}</td>
                        <td className="px-4 py-2.5 text-center tabular-nums text-text-dim">{m.total}</td>
                        <td className="px-4 py-2.5 text-center tabular-nums text-text-dim">{m.ko}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${m.ratio > 10 ? "text-destructive" : "text-text-dim"}`}>{m.ratio.toFixed(1)} %</td>
                      </tr>
                    ))}
                    {stats.marques.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center italic text-text-muted">Pas assez de volume.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Liste à démonter */}
          <h3 className="mb-3 font-semibold text-foreground">Moteurs à démonter ({stats.aDemonter.length})</h3>
          {stats.aDemonter.length === 0 ? (
            <div className="rounded-[14px] border border-border bg-surface py-8 text-center italic text-text-muted">Aucun moteur affecté au démontage.</div>
          ) : (
            <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
              <div className="max-h-[60vh] overflow-y-auto print:max-h-none print:overflow-visible">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-alt text-xs uppercase text-text-dim"><tr><th className="px-4 py-3 text-left">N° interne</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Marque</th><th className="px-4 py-3 text-left">État</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {stats.aDemonter.map((m) => (
                      <tr key={m.n_moteur} className="transition-colors hover:bg-surface-hover">
                        <td className="px-4 py-2 font-mono text-xs text-text-dim">{m.interne || m.n_moteur}</td>
                        <td className="px-4 py-2 font-medium text-foreground">{m.type}</td>
                        <td className="px-4 py-2 text-text-dim">{m.marque || "—"}</td>
                        <td className="px-4 py-2 text-text-dim">{etatMoteurLabel(m.etat) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
