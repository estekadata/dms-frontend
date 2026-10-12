"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { exportXlsx } from "@/lib/export";

type Mot = { n_moteur: number; interne: string | null; type: string; marque: string | null; prix: number };
type Suspect = Mot & { mediane: number; ratio: number; nType: number; motif: string };

const MIN_SAMPLES = 4; // nb mini de moteurs du même type pour avoir une référence fiable

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function fmtEur(v: number) {
  return `${Math.round(v).toLocaleString("fr-FR")} €`;
}

export default function AuditPrixPage() {
  const [mots, setMots] = useState<Mot[] | null>(null);
  const [ratioSeuil, setRatioSeuil] = useState(6);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all: Mot[] = [];
      const PAGE = 5000;
      let from = 0;
      while (from < 100000) {
        const { data, error } = await supabase
          .from("v_moteurs_dispo")
          .select("n_moteur, num_interne_moteur, nom_type_moteur, code_moteur, marque, prix_achat_moteur")
          .eq("est_disponible", 1)
          .gt("prix_achat_moteur", 0)
          .order("n_moteur", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        data.forEach((m: any) =>
          all.push({
            n_moteur: m.n_moteur,
            interne: m.num_interne_moteur,
            type: m.nom_type_moteur || m.code_moteur || "—",
            marque: m.marque,
            prix: m.prix_achat_moteur,
          })
        );
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (!cancelled) setMots(all);
    })();
    return () => { cancelled = true; };
  }, []);

  const { suspects, nbTypes } = useMemo(() => {
    if (!mots) return { suspects: [] as Suspect[], nbTypes: 0 };
    // médiane par type
    const byType = new Map<string, number[]>();
    for (const m of mots) {
      if (!byType.has(m.type)) byType.set(m.type, []);
      byType.get(m.type)!.push(m.prix);
    }
    const med = new Map<string, { mediane: number; n: number }>();
    byType.forEach((prices, t) => med.set(t, { mediane: median(prices), n: prices.length }));

    const out: Suspect[] = [];
    for (const m of mots) {
      const ref = med.get(m.type)!;
      const ratio = ref.mediane > 0 ? m.prix / ref.mediane : 0;
      // 1) prix anormalement élevé par rapport aux autres moteurs du même type
      const anomalieType = ref.n >= MIN_SAMPLES && ratio >= ratioSeuil;
      // 2) signature "virgule manquante" : prix entier sans décimale et élevé
      const virguleManquante = Number.isInteger(m.prix) && m.prix >= 1000 && (ref.n < MIN_SAMPLES || ratio >= 3);
      if (anomalieType || virguleManquante) {
        out.push({
          ...m,
          mediane: ref.mediane,
          ratio,
          nType: ref.n,
          motif: anomalieType ? `×${ratio.toFixed(1)} la médiane du type` : "prix entier élevé (virgule ?)",
        });
      }
    }
    return { suspects: out.sort((a, b) => b.ratio - a.ratio), nbTypes: byType.size };
  }, [mots, ratioSeuil]);

  function exportExcel() {
    const aoa: (string | number)[][] = [["N° interne", "N° moteur", "Type", "Marque", "Prix saisi (€)", "Médiane du type (€)", "Ratio", "Nb du type", "Motif"]];
    suspects.forEach((s) => aoa.push([s.interne || "", s.n_moteur, s.type, s.marque || "", Math.round(s.prix), Math.round(s.mediane), Number(s.ratio.toFixed(1)), s.nType, s.motif]));
    exportXlsx(`audit-prix-${new Date().toISOString().slice(0, 10)}`, [{ name: "Prix suspects", aoa }]);
  }

  return (
    <div>
      <Link href="/etats" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground print:hidden">
        <ArrowLeft size={14} /> Retour aux états
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Audit des prix" description="Repère les prix d'achat suspects (erreurs de saisie, virgule manquante) par comparaison à la médiane du type." />
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={exportExcel} disabled={!mots || suspects.length === 0}>
            <FileSpreadsheet size={14} className="mr-1" /> Export Excel
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!mots || suspects.length === 0}>
            <Printer size={14} className="mr-1" /> Imprimer
          </Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
        <span className="text-xs font-semibold uppercase text-text-dim">Sensibilité</span>
        {[5, 6, 8, 10].map((r) => (
          <button
            key={r}
            onClick={() => setRatioSeuil(r)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${ratioSeuil === r ? "bg-brand text-white" : "bg-surface-alt text-text-dim hover:bg-surface-hover"}`}
          >
            ×{r} la médiane
          </button>
        ))}
        <span className="text-xs text-text-muted">— un prix ≥ {ratioSeuil}× la médiane de son type est signalé.</span>
      </div>

      {mots === null ? (
        <div className="py-16 text-center text-text-muted">Analyse des prix…</div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 print:hidden">
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Moteurs analysés</p><p className="text-2xl font-bold text-foreground">{mots.length.toLocaleString("fr-FR")}</p><p className="text-xs text-text-muted">en stock, avec prix · {nbTypes} types</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Prix suspects</p><p className={`text-2xl font-bold ${suspects.length > 0 ? "text-amber-600" : "text-emerald-600"}`}>{suspects.length.toLocaleString("fr-FR")}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Montant en jeu</p><p className="text-2xl font-bold text-brand">{fmtEur(suspects.reduce((a, s) => a + s.prix, 0))}</p></CardContent></Card>
          </div>

          {suspects.length === 0 ? (
            <div className="rounded-[14px] border border-[rgba(52,211,153,0.25)] bg-[rgba(52,211,153,0.06)] py-10 text-center text-emerald-600">
              Aucun prix suspect à ce niveau de sensibilité. 👍
            </div>
          ) : (
            <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-alt text-xs uppercase text-text-dim">
                    <tr>
                      <th className="px-4 py-3 text-left">N° interne</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Marque</th>
                      <th className="px-4 py-3 text-right">Prix saisi</th>
                      <th className="px-4 py-3 text-right">Médiane du type</th>
                      <th className="px-4 py-3 text-center">Écart</th>
                      <th className="px-4 py-3 text-left">Motif</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {suspects.map((s) => (
                      <tr key={s.n_moteur} className="transition-colors hover:bg-surface-hover">
                        <td className="px-4 py-2.5 font-mono text-xs text-text-dim">{s.interne || s.n_moteur}</td>
                        <td className="px-4 py-2.5 font-medium text-foreground">{s.type}</td>
                        <td className="px-4 py-2.5 text-text-dim">{s.marque || "—"}</td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-amber-600">{fmtEur(s.prix)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-text-dim">{s.mediane > 0 ? fmtEur(s.mediane) : "—"}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600">
                            <AlertTriangle size={11} /> {s.ratio >= 1 ? `×${s.ratio.toFixed(1)}` : "?"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-text-muted">{s.motif}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="mt-4 text-xs text-text-muted">
            Les corrections se font dans Access (la base est synchronisée depuis Access). Cette liste sert à repérer les lignes à vérifier.
          </p>
        </>
      )}
    </div>
  );
}
