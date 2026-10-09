"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer, Tag, Cog, Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Barcode } from "@/components/barcode";
import { compoLabel, affectationLabel } from "@/components/moteur-statuts";

const MAX_LABELS = 500;

type Source = "moteurs" | "boites";
type Mode = "reception" | "recherche" | "liste";

type Item = {
  key: string | number; // n_moteur / n_bv
  interne?: string | null;
  type?: string | null;
  sub?: string | null; // marque·énergie (moteur) / réf (boîte)
  serie?: string | null;
  code?: string | null;
  extra?: string | null; // compo·affectation (moteur)
  reception?: number | null;
  date?: string | null;
  prix?: number | null;
};

function fmtEur(v?: number | null) {
  return v == null || v === 0 ? "" : `${Math.round(v).toLocaleString("fr-FR")} €`;
}
function fmtDate(d?: string | null) {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "";
}

function EtiquettesInner() {
  const sp = useSearchParams();
  const [source, setSource] = useState<Source>((sp.get("source") as Source) === "boites" ? "boites" : "moteurs");
  const [mode, setMode] = useState<Mode>(sp.get("reception") ? "reception" : "recherche");
  const [reception, setReception] = useState(sp.get("reception") || "");
  const [terme, setTerme] = useState("");
  const [liste, setListe] = useState("");
  const [cols, setCols] = useState(3);
  const [withBarcode, setWithBarcode] = useState(true);
  const [withPrix, setWithPrix] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(false);

  const mapMoteur = (r: any): Item => ({
    key: r.n_moteur,
    interne: r.num_interne_moteur,
    type: r.nom_type_moteur || r.code_moteur,
    sub: [r.marque, r.energie].filter(Boolean).join(" · "),
    serie: r.num_serie,
    code: r.code_moteur,
    extra: [compoLabel(r.compo_moteur), affectationLabel(r.n_affectation)].filter(Boolean).join(" · "),
    reception: r.num_reception,
    date: r.date_entree_stock,
    prix: r.prix_achat_moteur,
  });
  const mapBoite = (r: any): Item => ({
    key: r.n_bv,
    interne: r.num_interne_bv,
    type: r.ref_bv || (r.type_bv != null ? `Type ${r.type_bv}` : `Boîte ${r.n_bv}`),
    sub: r.num_interne_moteur ? `Moteur ${r.num_interne_moteur}` : "",
    reception: r.n_reception,
    prix: r.prix_vte_bv || r.achat_bv,
  });

  const run = useCallback(async () => {
    setLoading(true);
    setItems(null);
    const isMot = source === "moteurs";
    const table = isMot ? "v_moteurs_dispo" : "v_boites_dispo";
    const recCol = isMot ? "num_reception" : "n_reception";
    const keyCol = isMot ? "n_moteur" : "n_bv";
    const sel = isMot
      ? "n_moteur,num_interne_moteur,num_reception,nom_type_moteur,code_moteur,num_serie,marque,energie,compo_moteur,n_affectation,date_entree_stock,prix_achat_moteur"
      : "n_bv,num_interne_bv,n_reception,type_bv,ref_bv,num_interne_moteur,prix_vte_bv,achat_bv";

    let q = supabase.from(table).select(sel).order(keyCol, { ascending: true }).limit(MAX_LABELS);
    if (mode === "reception") {
      const n = Number(reception);
      if (!Number.isFinite(n)) {
        setItems([]);
        setLoading(false);
        return;
      }
      q = q.eq(recCol, n);
    } else if (mode === "recherche") {
      const t = terme.trim();
      if (t) {
        q = isMot
          ? q.or(`nom_type_moteur.ilike.%${t}%,code_moteur.ilike.%${t}%,num_serie.ilike.%${t}%,marque.ilike.%${t}%`)
          : q.or(`ref_bv.ilike.%${t}%,num_interne_bv.ilike.%${t}%`);
      }
    } else {
      const ids = liste
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => Number.isFinite(n));
      if (ids.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }
      q = q.in(keyCol, ids.slice(0, MAX_LABELS));
    }

    const { data } = await q;
    const rows = (data as any[]) || [];
    setItems(rows.map(isMot ? mapMoteur : mapBoite));
    setLoading(false);
  }, [source, mode, reception, terme, liste]);

  // Auto-chargement si on arrive avec ?reception=... (depuis une fiche réception)
  useEffect(() => {
    if (sp.get("reception")) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colClass = cols === 2 ? "grid-cols-2" : cols === 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3";

  return (
    <div>
      <Link href="/etats" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground print:hidden">
        <ArrowLeft size={14} /> Retour aux états
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <PageHeader title="Étiquettes" description="Génère des étiquettes de stock (code-barres scannable) pour les moteurs ou les boîtes." />
        <Button variant="outline" onClick={() => window.print()} disabled={!items || items.length === 0}>
          <Printer size={14} className="mr-1" /> Imprimer les étiquettes
        </Button>
      </div>

      {/* Contrôles */}
      <Card className="mb-4 print:hidden">
        <CardContent className="space-y-4 p-4">
          {/* Source */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase text-text-dim">Articles</span>
            <div className="flex overflow-hidden rounded-lg border border-border bg-surface-alt">
              {([["moteurs", "Moteurs", Cog], ["boites", "Boîtes", Package]] as const).map(([v, l, Icon]) => (
                <button
                  key={v}
                  onClick={() => { setSource(v); setItems(null); }}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all ${source === v ? "bg-brand text-white" : "text-text-dim hover:bg-surface-hover"}`}
                >
                  <Icon size={14} /> {l}
                </button>
              ))}
            </div>
          </div>

          {/* Mode de sélection */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase text-text-dim">Sélection</span>
            {([["reception", "Par réception"], ["recherche", "Par recherche"], ["liste", "Liste de N°"]] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setMode(v)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${mode === v ? "bg-brand text-white" : "bg-surface-alt text-text-dim hover:bg-surface-hover"}`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Entrée selon le mode */}
          <div className="grid gap-3 md:grid-cols-3">
            {mode === "reception" && (
              <Input placeholder="N° de réception" value={reception} onChange={(e) => setReception(e.target.value)} className="border-border bg-surface-alt" />
            )}
            {mode === "recherche" && (
              <Input placeholder={source === "moteurs" ? "Type, code, série, marque…" : "Réf. ou n° interne boîte…"} value={terme} onChange={(e) => setTerme(e.target.value)} className="border-border bg-surface-alt md:col-span-2" />
            )}
            {mode === "liste" && (
              <textarea
                placeholder="Numéros séparés par des espaces, virgules ou retours à la ligne"
                value={liste}
                onChange={(e) => setListe(e.target.value)}
                rows={3}
                className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground md:col-span-3"
              />
            )}
          </div>

          {/* Options */}
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-text-dim">
              Colonnes
              <select value={cols} onChange={(e) => setCols(Number(e.target.value))} className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-foreground">
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-text-dim">
              <input type="checkbox" checked={withBarcode} onChange={(e) => setWithBarcode(e.target.checked)} /> Code-barres
            </label>
            <label className="flex items-center gap-2 text-sm text-text-dim">
              <input type="checkbox" checked={withPrix} onChange={(e) => setWithPrix(e.target.checked)} /> Afficher le prix
            </label>
            <Button onClick={run} disabled={loading} className="bg-brand text-white hover:bg-brand/80">
              <Tag size={14} className="mr-1" /> {loading ? "Chargement…" : "Générer les étiquettes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* En-tête d'impression */}
      {items && items.length > 0 && (
        <div className="mb-3 hidden items-end justify-between border-b border-foreground pb-2 print:flex">
          <span className="font-heading text-lg font-bold text-foreground">MULTIREX AUTO — Étiquettes {source === "moteurs" ? "moteurs" : "boîtes"}</span>
          <span className="text-sm text-foreground">{items.length} étiquette{items.length > 1 ? "s" : ""}{mode === "reception" && reception ? ` · réception n° ${reception}` : ""}</span>
        </div>
      )}

      {/* Rendu */}
      {items === null ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted print:hidden">
          Choisis les articles et la sélection, puis clique « Générer les étiquettes ».
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted print:hidden">Aucun article trouvé.</div>
      ) : (
        <>
          <p className="mb-3 text-sm text-text-dim print:hidden">
            {items.length} étiquette{items.length > 1 ? "s" : ""}{items.length >= MAX_LABELS ? ` (limité à ${MAX_LABELS})` : ""} — vérifie l&apos;aperçu puis imprime.
          </p>
          <div className={`grid gap-2 ${colClass}`}>
            {items.map((it) => (
              <div key={it.key} className="flex break-inside-avoid flex-col rounded-md border border-foreground/70 bg-white p-2 text-black">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-black/60">MULTIREX AUTO</p>
                    <p className="truncate text-lg font-bold leading-tight">N° {it.key}</p>
                  </div>
                  <div className="shrink-0 text-right text-[10px] text-black/70">
                    {it.interne ? <p>RAC {it.interne}</p> : null}
                    {it.reception != null ? <p>Réc. {it.reception}</p> : null}
                  </div>
                </div>

                {withBarcode && (
                  <div className="my-1 flex justify-center">
                    <Barcode value={it.key} height={38} />
                  </div>
                )}

                <p className="truncate text-sm font-semibold leading-tight">{it.type || "—"}</p>
                {it.sub ? <p className="truncate text-xs text-black/80">{it.sub}</p> : null}
                {it.serie ? <p className="truncate text-xs text-black/70">{source === "moteurs" ? `Série : ${it.serie}` : it.serie}{it.code && source === "moteurs" ? ` · ${it.code}` : ""}</p> : null}
                {it.extra ? <p className="truncate text-xs text-black/70">{it.extra}</p> : null}
                <div className="mt-auto flex items-center justify-between pt-1 text-[10px] text-black/60">
                  <span>{fmtDate(it.date)}</span>
                  {withPrix ? <span className="font-semibold">{fmtEur(it.prix)}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function EtiquettesPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-text-muted">Chargement…</div>}>
      <EtiquettesInner />
    </Suspense>
  );
}
