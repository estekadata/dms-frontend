"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Cog, Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Header = {
  n_expedition: number;
  n_client: number | null;
  clientNom: string;
  date_chargement: string | null;
  transitaire: string | null;
  num_facture: string | null;
  montant_ht: number | null;
  terminee: boolean;
  ref_container: string | null;
  nb_cartons: number | null;
  nb_palettes: number | null;
  poids: number | null;
};

type Article = { id: number; label: string; sub: string; prix: number | null };

function fmtPrice(v: number | null | undefined) {
  if (v == null) return "—";
  return `${Math.round(v).toLocaleString("fr-FR")} €`;
}

export default function ExpeditionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const id = Number(idStr);

  const [header, setHeader] = useState<Header | null>(null);
  const [moteurs, setMoteurs] = useState<Article[]>([]);
  const [boites, setBoites] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: exp } = await supabase
        .from("tbl_expeditions")
        .select("n_expedition, n_client, date_chargement, n_transitaire, num_facture, montant_ht, expedition_terminee, ref_container, nb_cartons, nb_palettes, poids")
        .eq("n_expedition", id)
        .maybeSingle();
      if (cancelled) return;
      if (!exp) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      // Client
      let clientNom = "";
      const cid = (exp as any).n_client;
      if (cid != null) {
        const { data: c } = await supabase.from("tbl_clients").select("societe, nom_contact, nom_usage").eq("n_client", cid).maybeSingle();
        clientNom = (c as any)?.societe || (c as any)?.nom_usage || (c as any)?.nom_contact || `Client #${cid}`;
      }

      // Moteurs expédiés
      const { data: em } = await supabase
        .from("tbl_expeditions_moteurs")
        .select("id, n_moteur, prix_vente_moteur")
        .eq("n_expedition", id)
        .range(0, 4999);
      const motorIds = [...new Set((em || []).map((r: any) => r.n_moteur).filter(Boolean))] as number[];
      const motInfo: Record<number, { type: string; serie: string; marque: string }> = {};
      for (let i = 0; i < motorIds.length; i += 500) {
        const slice = motorIds.slice(i, i + 500);
        const { data } = await supabase.from("v_moteurs_dispo").select("n_moteur, nom_type_moteur, code_moteur, num_serie, marque").in("n_moteur", slice);
        (data || []).forEach((m: any) => {
          motInfo[m.n_moteur] = { type: m.nom_type_moteur || m.code_moteur || `Moteur #${m.n_moteur}`, serie: m.num_serie || "", marque: m.marque || "" };
        });
      }

      // Boîtes expédiées
      const { data: eb } = await supabase
        .from("tbl_expeditions_boites")
        .select("id, n_bv, prix_vente_bv")
        .eq("n_expedition", id)
        .range(0, 4999);
      const bvIds = [...new Set((eb || []).map((r: any) => r.n_bv).filter(Boolean))] as number[];
      const bvInfo: Record<number, { ref: string; type: string }> = {};
      for (let i = 0; i < bvIds.length; i += 500) {
        const slice = bvIds.slice(i, i + 500);
        const { data } = await supabase.from("v_boites_dispo").select("n_bv, ref_bv, num_interne_bv, type_bv").in("n_bv", slice);
        (data || []).forEach((b: any) => {
          bvInfo[b.n_bv] = { ref: b.ref_bv || b.num_interne_bv || `BV #${b.n_bv}`, type: b.type_bv || "" };
        });
      }

      if (cancelled) return;
      setHeader({
        n_expedition: (exp as any).n_expedition,
        n_client: cid,
        clientNom,
        date_chargement: (exp as any).date_chargement,
        transitaire: (exp as any).n_transitaire,
        num_facture: (exp as any).num_facture,
        montant_ht: (exp as any).montant_ht,
        terminee: !!(exp as any).expedition_terminee,
        ref_container: (exp as any).ref_container,
        nb_cartons: (exp as any).nb_cartons,
        nb_palettes: (exp as any).nb_palettes,
        poids: (exp as any).poids,
      });
      setMoteurs(
        (em || []).map((r: any) => ({
          id: r.id,
          label: motInfo[r.n_moteur]?.type || `Moteur #${r.n_moteur}`,
          sub: motInfo[r.n_moteur]?.serie || "",
          prix: r.prix_vente_moteur,
        }))
      );
      setBoites(
        (eb || []).map((r: any) => ({
          id: r.id,
          label: bvInfo[r.n_bv]?.ref || `BV #${r.n_bv}`,
          sub: bvInfo[r.n_bv]?.type || "",
          prix: r.prix_vente_bv,
        }))
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <div className="py-16 text-center text-text-muted">Chargement de l&apos;expédition…</div>;

  if (notFound || !header) {
    return (
      <div>
        <Link href="/historique" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground">
          <ArrowLeft size={14} /> Retour à l&apos;historique
        </Link>
        <div className="rounded-[14px] border border-border bg-surface p-10 text-center">
          <p className="font-semibold text-foreground">Expédition introuvable</p>
          <p className="mt-1 text-sm text-text-muted">Aucune expédition avec le n° <span className="font-mono">{idStr}</span>.</p>
        </div>
      </div>
    );
  }

  const ca = [...moteurs, ...boites].reduce((s, a) => s + (a.prix || 0), 0);

  const Table = ({ title, icon, rows, labelCol, subCol }: { title: string; icon: React.ReactNode; rows: Article[]; labelCol: string; subCol: string }) =>
    rows.length === 0 ? null : (
      <div className="mb-8">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground">{icon} {title} ({rows.length})</h3>
        <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-xs uppercase text-text-dim">
                <tr>
                  <th className="px-4 py-3 text-left">{labelCol}</th>
                  <th className="px-4 py-3 text-left">{subCol}</th>
                  <th className="px-4 py-3 text-right">Prix de vente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-surface-hover">
                    <td className="px-4 py-2.5 font-semibold text-foreground">{r.label}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-text-muted">{r.sub || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-dim">{fmtPrice(r.prix)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );

  return (
    <div>
      {/* En-tête du bon d'expédition — impression uniquement */}
      <div className="mb-6 hidden print:block">
        <div className="flex items-end justify-between border-b-2 border-foreground pb-3">
          <div>
            <p className="font-heading text-2xl font-bold text-foreground">MULTIREX AUTO</p>
            <p className="text-sm text-foreground">Bon d&apos;expédition</p>
          </div>
          <div className="text-right text-sm text-foreground">
            <p className="text-base font-bold">Expédition n° {header.n_expedition}</p>
            <p>Chargement : {header.date_chargement ? new Date(header.date_chargement).toLocaleDateString("fr-FR") : "—"}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-foreground">
          <p><span className="font-semibold">Client :</span> {header.clientNom || "—"}</p>
          <p className="text-right"><span className="font-semibold">Facture :</span> {header.num_facture || "—"}</p>
          <p><span className="font-semibold">Transitaire :</span> {header.transitaire || "—"} · <span className="font-semibold">Container :</span> {header.ref_container || "—"}</p>
          <p className="text-right"><span className="font-semibold">Montant HT :</span> {fmtPrice(header.montant_ht)}</p>
        </div>
      </div>

      <Link href="/historique" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground print:hidden">
        <ArrowLeft size={14} /> Retour à l&apos;historique
      </Link>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <PageHeader
          title={`Expédition n° ${header.n_expedition}`}
          description={header.date_chargement ? `Chargée le ${new Date(header.date_chargement).toLocaleDateString("fr-FR")}` : undefined}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer size={14} className="mr-1" /> Imprimer le bon
          </Button>
          <Badge
            className={
              header.terminee
                ? "border border-[rgba(52,211,153,0.20)] bg-[rgba(52,211,153,0.10)] text-emerald-600"
                : "border border-[rgba(96,165,250,0.20)] bg-[rgba(96,165,250,0.10)] text-blue-600"
            }
          >
            {header.terminee ? "Terminée" : "En cours"}
          </Badge>
        </div>
      </div>

      <div className="mb-5 text-sm text-text-dim print:hidden">
        Client :{" "}
        {header.n_client != null ? (
          <Link href={`/clients/${header.n_client}`} className="font-medium text-brand hover:underline">{header.clientNom}</Link>
        ) : (
          header.clientNom || "—"
        )}
        {header.transitaire ? <> · Transitaire {header.transitaire}</> : null}
        {header.ref_container ? <> · Container {header.ref_container}</> : null}
        {header.num_facture ? <> · Facture {header.num_facture}</> : null}
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 print:hidden">
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Moteurs</p><p className="text-2xl font-bold text-foreground">{moteurs.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Boîtes</p><p className="text-2xl font-bold text-foreground">{boites.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">CA (prix de vente)</p><p className="text-2xl font-bold text-brand">{fmtPrice(ca)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Montant HT facturé</p><p className="text-2xl font-bold text-foreground">{fmtPrice(header.montant_ht)}</p></CardContent></Card>
      </div>

      <Table title="Moteurs expédiés" icon={<Cog size={16} className="text-text-dim" />} rows={moteurs} labelCol="Type moteur" subCol="Num série" />
      <Table title="Boîtes expédiées" icon={<Package size={16} className="text-text-dim" />} rows={boites} labelCol="Réf BV" subCol="Type" />

      {moteurs.length === 0 && boites.length === 0 && (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">Aucun article sur cette expédition.</div>
      )}
    </div>
  );
}
