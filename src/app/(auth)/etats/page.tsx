"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { affectationLabel } from "@/components/moteur-statuts";

function fmtEur(v: number) {
  return `${Math.round(v).toLocaleString("fr-FR")} €`;
}

// Récupère toutes les lignes d'une vue filtrée, en paginant.
async function fetchAll(view: string, cols: string, filter: (q: any) => any): Promise<any[]> {
  const all: any[] = [];
  const PAGE = 5000;
  let from = 0;
  while (from < 200000) {
    const { data, error } = await filter(supabase.from(view).select(cols)).range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

type Inventaire = {
  motTotal: number;
  motReserves: number;
  motValo: number;
  motAvecPrix: number;
  bvTotal: number;
  bvReserves: number;
  bvValo: number;
  bvAvecPrix: number;
  parAffectation: { code: number; label: string; count: number; valo: number }[];
};

export default function EtatsPage() {
  const [inv, setInv] = useState<Inventaire | null>(null);
  const [loading, setLoading] = useState(true);
  const asOf = new Date();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [mot, bv] = await Promise.all([
        fetchAll("v_moteurs_dispo", "prix_achat_moteur, resa_client_moteur, n_affectation", (q) =>
          q.eq("est_disponible", 1)
        ),
        fetchAll("v_boites_dispo", "achat_bv, resa_client_bv", (q) => q.eq("est_disponible", 1)),
      ]);
      if (cancelled) return;

      const affMap = new Map<number, { count: number; valo: number }>();
      let motValo = 0;
      let motReserves = 0;
      let motAvecPrix = 0;
      for (const m of mot) {
        const prix = m.prix_achat_moteur || 0;
        if (prix > 0) motAvecPrix++;
        motValo += prix;
        if ((m.resa_client_moteur || "").trim()) motReserves++;
        const aff = m.n_affectation ?? 0;
        if (!affMap.has(aff)) affMap.set(aff, { count: 0, valo: 0 });
        const a = affMap.get(aff)!;
        a.count++;
        a.valo += prix;
      }

      let bvValo = 0;
      let bvReserves = 0;
      let bvAvecPrix = 0;
      for (const b of bv) {
        const prix = b.achat_bv || 0;
        if (prix > 0) bvAvecPrix++;
        bvValo += prix;
        if ((b.resa_client_bv || "").trim()) bvReserves++;
      }

      setInv({
        motTotal: mot.length,
        motReserves,
        motValo,
        motAvecPrix,
        bvTotal: bv.length,
        bvReserves,
        bvValo,
        bvAvecPrix,
        parAffectation: Array.from(affMap.entries())
          .map(([code, v]) => ({ code, label: affectationLabel(code) || "Non précisée", ...v }))
          .sort((a, b) => b.count - a.count),
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="États & rapports" description="Inventaire, valorisation du stock et statistiques" />
        <div className="flex gap-2 print:hidden">
          <Link href="/etats/constructeur">
            <Button variant="outline">
              <SlidersHorizontal size={14} className="mr-1" /> Constructeur d&apos;états
            </Button>
          </Link>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer size={14} className="mr-1" /> Imprimer
          </Button>
        </div>
      </div>

      {/* Navigation entre états */}
      <div className="mb-5 flex flex-wrap gap-2 print:hidden">
        <span className="rounded-full bg-brand px-3 py-1.5 text-xs font-medium text-white">Inventaire</span>
        <Link href="/etats/achats-mensuels" className="rounded-full bg-surface-alt px-3 py-1.5 text-xs font-medium text-text-dim transition hover:bg-surface-hover">
          Achats mensuels
        </Link>
        <Link href="/etats/top-ventes" className="rounded-full bg-surface-alt px-3 py-1.5 text-xs font-medium text-text-dim transition hover:bg-surface-hover">
          Top 15 ventes
        </Link>
        <Link href="/etats/constructeur" className="rounded-full bg-surface-alt px-3 py-1.5 text-xs font-medium text-text-dim transition hover:bg-surface-hover">
          Constructeur d&apos;états
        </Link>
      </div>

      <div className="mb-6 flex items-center gap-2 text-sm text-text-dim">
        <span className="font-semibold text-foreground">Inventaire du stock</span>
        <span>· arrêté au {asOf.toLocaleDateString("fr-FR")}</span>
      </div>

      {loading ? (
        <div className="py-16 text-center text-text-muted">Calcul de l&apos;inventaire…</div>
      ) : !inv ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">
          Inventaire indisponible.
        </div>
      ) : (
        <>
          {/* Valorisation globale */}
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase text-text-dim">Valorisation totale du stock</p>
                <p className="text-3xl font-bold text-brand">{fmtEur(inv.motValo + inv.bvValo)}</p>
                <p className="mt-1 text-xs text-text-muted">au prix d&apos;achat · moteurs + boîtes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase text-text-dim">Moteurs en stock</p>
                <p className="text-3xl font-bold text-foreground">{inv.motTotal.toLocaleString("fr-FR")}</p>
                <p className="mt-1 text-xs text-text-muted">
                  dont {inv.motReserves.toLocaleString("fr-FR")} réservés · {fmtEur(inv.motValo)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase text-text-dim">Boîtes en stock</p>
                <p className="text-3xl font-bold text-foreground">{inv.bvTotal.toLocaleString("fr-FR")}</p>
                <p className="mt-1 text-xs text-text-muted">
                  dont {inv.bvReserves.toLocaleString("fr-FR")} réservées · {fmtEur(inv.bvValo)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Note inventaire comptable */}
          <div className="mb-6 rounded-[14px] border border-[rgba(96,165,250,0.25)] bg-[rgba(96,165,250,0.06)] px-4 py-3 text-sm text-text-dim">
            Inventaire comptable : les articles <span className="font-semibold text-foreground">pré-réservés sont inclus</span>
            {" "}car physiquement présents en stock. La valorisation est calculée au prix d&apos;achat
            ({inv.motAvecPrix.toLocaleString("fr-FR")} moteurs et {inv.bvAvecPrix.toLocaleString("fr-FR")} boîtes avec un prix saisi).
          </div>

          {/* Répartition moteurs par affectation */}
          <h3 className="mb-3 font-semibold text-foreground">Moteurs par affectation</h3>
          <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-xs uppercase text-text-dim">
                <tr>
                  <th className="px-4 py-3 text-left">Affectation</th>
                  <th className="px-4 py-3 text-center">Nombre</th>
                  <th className="px-4 py-3 text-right">Valorisation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inv.parAffectation.map((a) => (
                  <tr key={a.code} className="transition-colors hover:bg-surface-hover">
                    <td className="px-4 py-3 font-medium text-foreground">{a.label}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-text-dim">{a.count.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-dim">{fmtEur(a.valo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-surface-alt font-semibold">
                  <td className="px-4 py-3 text-foreground">Total moteurs</td>
                  <td className="px-4 py-3 text-center tabular-nums text-foreground">{inv.motTotal.toLocaleString("fr-FR")}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-brand">{fmtEur(inv.motValo)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-6 text-xs text-text-muted">
            Prochaines briques du module : achats mensuels, top 15 ventes, déclarations douanières, export Excel.
          </p>
        </>
      )}
    </div>
  );
}
