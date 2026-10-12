"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer, FileSpreadsheet, FileText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportXlsx } from "@/lib/export";

// Nomenclature douanière indicative (code SH) — à valider avec le transitaire.
const HS_MOTEUR_DIESEL = "8408.90";
const HS_MOTEUR_ESSENCE = "8407.34";
const HS_BOITE = "8708.40";

function hsMoteur(energie?: string | null): string {
  const e = (energie || "").toLowerCase();
  if (e.includes("diesel")) return HS_MOTEUR_DIESEL;
  if (e.includes("essence") || e.includes("ess")) return HS_MOTEUR_ESSENCE;
  return HS_MOTEUR_DIESEL;
}
function catMoteur(energie?: string | null): string {
  const e = (energie || "").toLowerCase();
  if (e.includes("essence") || e.includes("ess")) return "Moteurs essence d'occasion";
  if (e.includes("diesel")) return "Moteurs diesel d'occasion";
  return "Moteurs d'occasion";
}

type Client = { societe: string; adresse: string | null; ville: string | null; cp: string | null; pays: string | null; tva: string | null };
type Header = {
  n_expedition: number;
  date_chargement: string | null;
  type_container: string | null;
  ref_container: string | null;
  n_plomb: string | null;
  n_transitaire: string | null;
  nb_cartons: number | null;
  nb_palettes: number | null;
  poids: number | null;
  tare_container: number | null;
  num_facture: string | null;
  montant_ht: number | null;
  cfr: number | null;
  autres_info: string | null;
};
type Article = { kind: "moteur" | "boite"; n: number; designation: string; serie: string; cat: string; hs: string; valeur: number };
type Groupe = { cat: string; hs: string; nb: number; valeur: number };

function fmtEur(v?: number | null) {
  return v == null ? "—" : `${Math.round(v).toLocaleString("fr-FR")} €`;
}
function fmtDate(d?: string | null) {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "—";
}

function DouaneInner() {
  const sp = useSearchParams();
  const [expNum, setExpNum] = useState(sp.get("expedition") || "");
  const [header, setHeader] = useState<Header | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const run = useCallback(async (num: string) => {
    const id = Number(num);
    if (!Number.isFinite(id)) return;
    setLoading(true);
    setNotFound(false);
    setHeader(null);
    setClient(null);
    setArticles(null);

    const { data: exp } = await supabase
      .from("tbl_expeditions")
      .select("n_expedition, n_client, date_chargement, type_container, ref_container, n_plomb, n_transitaire, nb_cartons, nb_palettes, poids, tare_container, num_facture, montant_ht, cfr, autres_info")
      .eq("n_expedition", id)
      .maybeSingle();
    if (!exp) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const e = exp as any;
    setHeader({
      n_expedition: e.n_expedition,
      date_chargement: e.date_chargement,
      type_container: e.type_container,
      ref_container: e.ref_container,
      n_plomb: e.n_plomb,
      n_transitaire: e.n_transitaire,
      nb_cartons: e.nb_cartons,
      nb_palettes: e.nb_palettes,
      poids: e.poids,
      tare_container: e.tare_container,
      num_facture: e.num_facture,
      montant_ht: e.montant_ht,
      cfr: e.cfr,
      autres_info: e.autres_info,
    });

    // Client + pays
    if (e.n_client != null) {
      const { data: c } = await supabase
        .from("tbl_clients")
        .select("societe, nom_usage, nom_contact, adresse, ville, code_postal, pays, ident_tva")
        .eq("n_client", e.n_client)
        .maybeSingle();
      const cc = c as any;
      let paysNom: string | null = null;
      if (cc?.pays != null) {
        const { data: p } = await supabase.from("tbl_pays").select("nom_pays").eq("n_pays", cc.pays).maybeSingle();
        paysNom = (p as any)?.nom_pays || null;
      }
      setClient({
        societe: cc?.societe || cc?.nom_usage || cc?.nom_contact || `Client #${e.n_client}`,
        adresse: cc?.adresse || null,
        ville: cc?.ville || null,
        cp: cc?.code_postal || null,
        pays: paysNom,
        tva: cc?.ident_tva || null,
      });
    }

    // Moteurs expédiés (paginé)
    const em: any[] = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await supabase
        .from("tbl_expeditions_moteurs")
        .select("n_moteur, prix_vente_moteur")
        .eq("n_expedition", id)
        .range(from, from + 999);
      if (error || !data || data.length === 0) break;
      em.push(...data);
      if (data.length < 1000) break;
    }
    const motIds = [...new Set(em.map((r) => r.n_moteur).filter(Boolean))] as number[];
    const motInfo: Record<number, { type: string; marque: string; energie: string; serie: string }> = {};
    for (let i = 0; i < motIds.length; i += 500) {
      const slice = motIds.slice(i, i + 500);
      const { data } = await supabase.from("v_moteurs_dispo").select("n_moteur, nom_type_moteur, code_moteur, marque, energie, num_serie").in("n_moteur", slice);
      (data || []).forEach((m: any) => {
        motInfo[m.n_moteur] = { type: m.nom_type_moteur || m.code_moteur || `Moteur ${m.n_moteur}`, marque: m.marque || "", energie: m.energie || "", serie: m.num_serie || "" };
      });
    }

    // Boîtes expédiées
    const eb: any[] = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await supabase
        .from("tbl_expeditions_boites")
        .select("n_bv, prix_vente_bv")
        .eq("n_expedition", id)
        .range(from, from + 999);
      if (error || !data || data.length === 0) break;
      eb.push(...data);
      if (data.length < 1000) break;
    }
    const bvIds = [...new Set(eb.map((r) => r.n_bv).filter(Boolean))] as number[];
    const bvInfo: Record<number, { type: string; serie: string }> = {};
    for (let i = 0; i < bvIds.length; i += 500) {
      const slice = bvIds.slice(i, i + 500);
      const { data } = await supabase.from("v_boites_dispo").select("n_bv, type_bv, ref_bv, num_interne_bv").in("n_bv", slice);
      (data || []).forEach((b: any) => {
        bvInfo[b.n_bv] = { type: b.ref_bv || (b.type_bv != null ? `Boîte type ${b.type_bv}` : `Boîte ${b.n_bv}`), serie: b.num_interne_bv || "" };
      });
    }

    const arts: Article[] = [];
    for (const r of em) {
      const info = motInfo[r.n_moteur] || { type: `Moteur ${r.n_moteur}`, marque: "", energie: "", serie: "" };
      arts.push({
        kind: "moteur",
        n: r.n_moteur,
        designation: [info.type, info.marque].filter(Boolean).join(" "),
        serie: info.serie,
        cat: catMoteur(info.energie),
        hs: hsMoteur(info.energie),
        valeur: r.prix_vente_moteur || 0,
      });
    }
    for (const r of eb) {
      const info = bvInfo[r.n_bv] || { type: `Boîte ${r.n_bv}`, serie: "" };
      arts.push({ kind: "boite", n: r.n_bv, designation: info.type, serie: info.serie, cat: "Boîtes de vitesses d'occasion", hs: HS_BOITE, valeur: r.prix_vente_bv || 0 });
    }
    setArticles(arts);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (sp.get("expedition")) run(sp.get("expedition") as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Regroupement par catégorie / code SH
  const groupes: Groupe[] = (() => {
    if (!articles) return [];
    const map = new Map<string, Groupe>();
    for (const a of articles) {
      const k = `${a.cat}|${a.hs}`;
      if (!map.has(k)) map.set(k, { cat: a.cat, hs: a.hs, nb: 0, valeur: 0 });
      const g = map.get(k)!;
      g.nb++;
      g.valeur += a.valeur;
    }
    return Array.from(map.values()).sort((a, b) => b.nb - a.nb);
  })();

  const valeurArticles = articles ? articles.reduce((s, a) => s + a.valeur, 0) : 0;
  const valeurDeclaree = valeurArticles > 0 ? valeurArticles : header?.montant_ht || 0;
  const nbColis = (header?.nb_cartons || 0) + (header?.nb_palettes || 0);

  function exportExcel() {
    if (!header || !articles) return;
    const synth: (string | number)[][] = [["Désignation", "Code SH", "Quantité", "Valeur (€)"]];
    groupes.forEach((g) => synth.push([g.cat, g.hs, g.nb, Math.round(g.valeur)]));
    synth.push(["TOTAL", "", articles.length, Math.round(valeurDeclaree)]);

    const detail: (string | number)[][] = [["Type", "N°", "Désignation", "N° série / interne", "Code SH", "Valeur (€)"]];
    articles.forEach((a) => detail.push([a.kind === "moteur" ? "Moteur" : "Boîte", a.n, a.designation, a.serie, a.hs, Math.round(a.valeur)]));

    const ent: (string | number)[][] = [
      ["Déclaration d'exportation", ""],
      ["Expédition n°", header.n_expedition],
      ["Date chargement", fmtDate(header.date_chargement)],
      ["Destinataire", client?.societe || "—"],
      ["Pays", client?.pays || "—"],
      ["N° TVA / ident.", client?.tva || "—"],
      ["Conteneur", `${header.type_container || ""} ${header.ref_container || ""}`.trim() || "—"],
      ["Plomb", header.n_plomb || "—"],
      ["Transitaire", header.n_transitaire || "—"],
      ["Nb colis (cartons+palettes)", nbColis || "—"],
      ["Poids brut (kg)", header.poids || "—"],
      ["Tare conteneur (kg)", header.tare_container || "—"],
      ["Valeur déclarée (€)", Math.round(valeurDeclaree)],
      ["Devise", "EUR"],
    ];

    exportXlsx(`declaration-douane-exp-${header.n_expedition}`, [
      { name: "En-tête", aoa: ent },
      { name: "Synthèse SH", aoa: synth },
      { name: "Détail articles", aoa: detail },
    ]);
  }

  return (
    <div>
      <Link href="/etats" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground print:hidden">
        <ArrowLeft size={14} /> Retour aux états
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <PageHeader title="Déclaration douanière" description="Récapitulatif d'exportation par expédition / conteneur (marchandises, valeurs, nomenclature SH)." />
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={!header || !articles}>
            <FileSpreadsheet size={14} className="mr-1" /> Export Excel
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!header}>
            <Printer size={14} className="mr-1" /> Imprimer
          </Button>
        </div>
      </div>

      {/* Sélecteur */}
      <Card className="mb-4 print:hidden">
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <span className="text-sm text-text-dim">N° d&apos;expédition</span>
          <Input value={expNum} onChange={(e) => setExpNum(e.target.value)} placeholder="ex. 1873" className="w-40 border-border bg-surface-alt" onKeyDown={(e) => e.key === "Enter" && run(expNum)} />
          <Button onClick={() => run(expNum)} disabled={loading} className="bg-brand text-white hover:bg-brand/80">
            <FileText size={14} className="mr-1" /> {loading ? "Chargement…" : "Générer la déclaration"}
          </Button>
        </CardContent>
      </Card>

      {notFound ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted print:hidden">Expédition introuvable.</div>
      ) : !header ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted print:hidden">
          Saisis un n° d&apos;expédition et clique « Générer la déclaration ».
        </div>
      ) : (
        <div className="rounded-[14px] border border-border bg-surface p-6 text-foreground print:border-0 print:p-0">
          {/* En-tête document */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-foreground pb-3">
            <div>
              <p className="font-heading text-2xl font-bold">MULTIREX AUTO</p>
              <p className="text-sm">Déclaration / facture d&apos;exportation</p>
              <p className="mt-1 text-xs text-text-muted">Exportateur — coordonnées légales (SIRET / EORI / TVA) à compléter</p>
            </div>
            <div className="text-right text-sm">
              <p className="text-base font-bold">Expédition n° {header.n_expedition}</p>
              <p>Date de chargement : {fmtDate(header.date_chargement)}</p>
              {header.num_facture ? <p>Facture : {header.num_facture}</p> : null}
            </div>
          </div>

          {/* Destinataire + transport */}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-text-dim">Destinataire</p>
              <p className="font-semibold">{client?.societe || "—"}</p>
              {client?.adresse ? <p className="text-sm">{client.adresse}</p> : null}
              <p className="text-sm">{[client?.cp, client?.ville].filter(Boolean).join(" ") || ""}</p>
              <p className="text-sm font-medium">{client?.pays || "—"}</p>
              {client?.tva ? <p className="text-xs text-text-muted">TVA / ident. : {client.tva}</p> : null}
            </div>
            <div className="text-sm">
              <p className="text-xs font-semibold uppercase text-text-dim">Transport</p>
              <p>Conteneur : {[header.type_container, header.ref_container].filter(Boolean).join(" · ") || "—"}</p>
              <p>Plomb : {header.n_plomb || "—"} · Transitaire : {header.n_transitaire || "—"}</p>
              <p>Colis : {nbColis || "—"} (dont {header.nb_cartons || 0} cartons, {header.nb_palettes || 0} palettes)</p>
              <p>Poids brut : {header.poids ? `${header.poids.toLocaleString("fr-FR")} kg` : "—"} · Tare : {header.tare_container ? `${header.tare_container.toLocaleString("fr-FR")} kg` : "—"}</p>
            </div>
          </div>

          {/* Synthèse par nomenclature */}
          <p className="mt-6 text-xs font-semibold uppercase text-text-dim">Marchandises — synthèse par nomenclature (SH)</p>
          <div className="mt-2 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-xs uppercase text-text-dim">
                <tr>
                  <th className="px-3 py-2 text-left">Désignation</th>
                  <th className="px-3 py-2 text-left">Code SH</th>
                  <th className="px-3 py-2 text-center">Quantité</th>
                  <th className="px-3 py-2 text-right">Valeur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groupes.map((g) => (
                  <tr key={g.cat + g.hs}>
                    <td className="px-3 py-2 font-medium">{g.cat}</td>
                    <td className="px-3 py-2 tabular-nums">{g.hs}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{g.nb}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.valeur > 0 ? fmtEur(g.valeur) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-surface-alt font-semibold">
                  <td className="px-3 py-2" colSpan={2}>Total — {articles?.length || 0} article{(articles?.length || 0) > 1 ? "s" : ""}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{articles?.length || 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-brand">{fmtEur(valeurDeclaree)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Valeur déclarée en EUR{valeurArticles === 0 && header.montant_ht ? " (reprise du montant HT de l'expédition — valeurs unitaires non saisies)" : ""}. Nomenclature SH indicative, à valider avec le transitaire.
          </p>

          {/* Détail articles */}
          {articles && articles.length > 0 && (
            <>
              <p className="mt-6 text-xs font-semibold uppercase text-text-dim">Détail des articles ({articles.length})</p>
              <div className="mt-2 overflow-hidden rounded-lg border border-border">
                <div className="max-h-[60vh] overflow-y-auto print:max-h-none print:overflow-visible">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface-alt text-xs uppercase text-text-dim">
                      <tr>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">N°</th>
                        <th className="px-3 py-2 text-left">Désignation</th>
                        <th className="px-3 py-2 text-left">N° série / interne</th>
                        <th className="px-3 py-2 text-left">SH</th>
                        <th className="px-3 py-2 text-right">Valeur</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {articles.map((a) => (
                        <tr key={`${a.kind}-${a.n}`}>
                          <td className="px-3 py-1.5 text-text-dim">{a.kind === "moteur" ? "Moteur" : "Boîte"}</td>
                          <td className="px-3 py-1.5 tabular-nums">{a.n}</td>
                          <td className="px-3 py-1.5 font-medium">{a.designation || "—"}</td>
                          <td className="px-3 py-1.5 font-mono text-xs text-text-muted">{a.serie || "—"}</td>
                          <td className="px-3 py-1.5 tabular-nums text-text-dim">{a.hs}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{a.valeur > 0 ? fmtEur(a.valeur) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {articles && articles.length === 0 && (
            <p className="mt-4 text-sm italic text-text-muted">Aucun article rattaché à cette expédition.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function DouanePage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-text-muted">Chargement…</div>}>
      <DouaneInner />
    </Suspense>
  );
}
