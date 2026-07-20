"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Package, Cog } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SortHeader, useClientSort } from "@/components/sortable";
import { MoteurStatuts } from "@/components/moteur-statuts";

type Statut = "stock" | "resa" | "vendu";

type PieceRow = {
  id: number;
  label: string;
  sub: string;
  extra: string;
  prix: number | null;
  statut: Statut;
  resaClientId: number | null;
  resaClientLabel: string | null;
  compo?: number | null;
  etat?: number | null;
  affect?: number | null;
};

type Header = {
  n_reception: number;
  date_achat: string | null;
  montant_ht: number | null;
  terminee: boolean;
  fournisseurId: number | null;
  fournisseurNom: string;
};

function fmtPrice(v: number | null | undefined) {
  if (v == null) return "—";
  return `${Math.round(v).toLocaleString("fr-FR")} €`;
}

function parseClientId(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(String(raw).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function StatutBadge({ row }: { row: PieceRow }) {
  if (row.statut === "vendu") {
    return (
      <Badge className="border border-border bg-surface-alt text-text-dim">Vendu</Badge>
    );
  }
  if (row.statut === "resa") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge className="border border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.10)] text-amber-600">
          Réservé
        </Badge>
        {row.resaClientId !== null && row.resaClientLabel && (
          <Link
            href={`/clients/${row.resaClientId}`}
            className="max-w-[140px] truncate text-xs text-brand hover:underline"
          >
            {row.resaClientLabel}
          </Link>
        )}
      </span>
    );
  }
  return (
    <Badge className="border border-[rgba(52,211,153,0.20)] bg-[rgba(52,211,153,0.10)] text-emerald-600">
      En stock
    </Badge>
  );
}

function PieceTable({
  rows,
  labelCol,
  subCol,
  extraCol,
}: {
  rows: PieceRow[];
  labelCol: string;
  subCol: string;
  extraCol: string;
}) {
  const { sorted, sortKey, sortDir, onSort } = useClientSort(rows);
  return (
    <>
      {/* Mobile : cartes */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
        {sorted.map((r) => (
          <div key={r.id} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{r.label}</p>
                <p className="truncate text-xs text-text-muted">{r.extra || "—"}</p>
                <MoteurStatuts compo={r.compo} etat={r.etat} affect={r.affect} className="mt-1" />
              </div>
              <StatutBadge row={r} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2 text-sm">
              <span className="font-mono text-xs text-text-dim">{r.sub || `n°${r.id}`}</span>
              <span className="font-semibold text-foreground">{fmtPrice(r.prix)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop : table */}
      <div className="hidden overflow-hidden rounded-[14px] border border-border bg-surface md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-xs uppercase text-text-dim">
              <tr>
                <SortHeader label={labelCol} active={sortKey === "label"} dir={sortDir} onClick={() => onSort("label")} />
                <SortHeader label={subCol} active={sortKey === "sub"} dir={sortDir} onClick={() => onSort("sub")} />
                <SortHeader label={extraCol} active={sortKey === "extra"} dir={sortDir} onClick={() => onSort("extra")} />
                <SortHeader label="Prix achat" active={sortKey === "prix"} dir={sortDir} onClick={() => onSort("prix")} align="right" />
                <SortHeader label="Statut" active={sortKey === "statut"} dir={sortDir} onClick={() => onSort("statut")} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground">{r.label}</div>
                    <MoteurStatuts compo={r.compo} etat={r.etat} affect={r.affect} className="mt-1" />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">{r.sub || "—"}</td>
                  <td className="px-4 py-3 text-text-dim">{r.extra || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-dim">{fmtPrice(r.prix)}</td>
                  <td className="px-4 py-3"><StatutBadge row={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default function ReceptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = use(params);
  const id = Number(idStr);

  const [header, setHeader] = useState<Header | null>(null);
  const [moteurs, setMoteurs] = useState<PieceRow[]>([]);
  const [boites, setBoites] = useState<PieceRow[]>([]);
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

      // 1. En-tête réception
      const { data: recRow } = await supabase
        .from("tbl_receptions")
        .select("n_reception, date_achat, montant_ht, reception_terminee, n_fournisseur")
        .eq("n_reception", id)
        .maybeSingle();

      if (cancelled) return;
      if (!recRow) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      // 2. Fournisseur (nom + lien)
      let fNom = "";
      const fId = (recRow as any).n_fournisseur ?? null;
      if (fId != null) {
        const { data: fRow } = await supabase
          .from("tbl_fournisseurs")
          .select("nom_fournisseur, contact_fourniss")
          .eq("n_fournisseur", fId)
          .maybeSingle();
        fNom = (fRow as any)?.nom_fournisseur || (fRow as any)?.contact_fourniss || `Fournisseur #${fId}`;
      }

      // 3. Moteurs + boîtes de la réception
      const [{ data: motRows }, { data: bvRows }] = await Promise.all([
        supabase
          .from("v_moteurs_dispo")
          .select("n_moteur, nom_type_moteur, code_moteur, num_serie, marque, prix_achat_moteur, est_disponible, resa_client_moteur, compo_moteur, etat_moteur, n_affectation")
          .eq("num_reception", id)
          .range(0, 4999),
        supabase
          .from("v_boites_dispo")
          .select("n_bv, ref_bv, num_interne_bv, type_bv, achat_bv, est_disponible, resa_client_bv, vendu")
          .eq("n_reception", id)
          .range(0, 4999),
      ]);

      // 4. Résoudre les noms des clients ayant réservé
      const resaIds = new Set<number>();
      (motRows || []).forEach((m: any) => {
        const cid = parseClientId(m.resa_client_moteur);
        if (cid !== null && m.est_disponible === 1) resaIds.add(cid);
      });
      (bvRows || []).forEach((b: any) => {
        const cid = parseClientId(b.resa_client_bv);
        if (cid !== null && !b.vendu) resaIds.add(cid);
      });

      const clientMap: Record<number, string> = {};
      if (resaIds.size) {
        const { data: cliRes } = await supabase
          .from("tbl_clients")
          .select("n_client, societe, nom_contact, nom_usage")
          .in("n_client", Array.from(resaIds));
        (cliRes || []).forEach((c: any) => {
          clientMap[c.n_client] = c.societe || c.nom_usage || c.nom_contact || `Client #${c.n_client}`;
        });
      }

      const mappedMot: PieceRow[] = ((motRows || []) as any[]).map((m) => {
        const cid = parseClientId(m.resa_client_moteur);
        const dispo = m.est_disponible === 1;
        const statut: Statut = !dispo ? "vendu" : cid !== null ? "resa" : "stock";
        return {
          id: m.n_moteur,
          label: m.nom_type_moteur || m.code_moteur || `Moteur #${m.n_moteur}`,
          sub: m.num_serie || "",
          extra: m.marque || "",
          prix: m.prix_achat_moteur,
          statut,
          resaClientId: statut === "resa" ? cid : null,
          resaClientLabel: statut === "resa" && cid !== null ? clientMap[cid] || `Client #${cid}` : null,
          compo: m.compo_moteur ?? null,
          etat: m.etat_moteur ?? null,
          affect: m.n_affectation ?? null,
        };
      });

      const mappedBv: PieceRow[] = ((bvRows || []) as any[]).map((b) => {
        const cid = parseClientId(b.resa_client_bv);
        const statut: Statut = b.vendu ? "vendu" : cid !== null ? "resa" : "stock";
        return {
          id: b.n_bv,
          label: b.ref_bv || b.num_interne_bv || `BV #${b.n_bv}`,
          sub: b.num_interne_bv || "",
          extra: b.type_bv || "",
          prix: b.achat_bv,
          statut,
          resaClientId: statut === "resa" ? cid : null,
          resaClientLabel: statut === "resa" && cid !== null ? clientMap[cid] || `Client #${cid}` : null,
        };
      });

      if (cancelled) return;
      setHeader({
        n_reception: (recRow as any).n_reception,
        date_achat: (recRow as any).date_achat,
        montant_ht: (recRow as any).montant_ht,
        terminee: !!(recRow as any).reception_terminee,
        fournisseurId: fId,
        fournisseurNom: fNom,
      });
      setMoteurs(mappedMot);
      setBoites(mappedBv);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <div className="py-16 text-center text-text-muted">Chargement de la réception…</div>;
  }

  if (notFound || !header) {
    return (
      <div>
        <Link href="/receptions" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground">
          <ArrowLeft size={14} /> Retour aux réceptions
        </Link>
        <div className="rounded-[14px] border border-border bg-surface p-10 text-center">
          <p className="font-semibold text-foreground">Réception introuvable</p>
          <p className="mt-1 text-sm text-text-muted">
            Aucune réception n&apos;existe avec le n° <span className="font-mono">{idStr}</span>.
          </p>
        </div>
      </div>
    );
  }

  const pieces = [...moteurs, ...boites];
  const nbStock = pieces.filter((p) => p.statut === "stock").length;
  const nbResa = pieces.filter((p) => p.statut === "resa").length;
  const nbVendu = pieces.filter((p) => p.statut === "vendu").length;

  return (
    <div>
      <Link href="/receptions" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground">
        <ArrowLeft size={14} /> Retour aux réceptions
      </Link>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title={`Réception n° ${header.n_reception}`}
          description={
            header.date_achat ? `Reçue le ${new Date(header.date_achat).toLocaleDateString("fr-FR")}` : undefined
          }
        />
        <Badge
          className={
            header.terminee
              ? "border border-[rgba(52,211,153,0.20)] bg-[rgba(52,211,153,0.10)] text-emerald-600"
              : "border border-[rgba(96,165,250,0.20)] bg-[rgba(96,165,250,0.10)] text-blue-600"
          }
        >
          {header.terminee ? "Terminée" : "Brouillon"}
        </Badge>
      </div>

      {header.fournisseurId != null && (
        <p className="mb-5 text-sm text-text-dim">
          Fournisseur :{" "}
          <Link href={`/fournisseurs/${header.fournisseurId}`} className="font-medium text-brand hover:underline">
            {header.fournisseurNom}
          </Link>
        </p>
      )}

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Pièces reçues</p><p className="text-2xl font-bold text-foreground">{pieces.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">En stock</p><p className="text-2xl font-bold text-emerald-600">{nbStock}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Réservées</p><p className="text-2xl font-bold text-amber-600">{nbResa}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Vendues</p><p className="text-2xl font-bold text-foreground">{nbVendu}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Montant achat HT</p><p className="text-2xl font-bold text-brand">{fmtPrice(header.montant_ht)}</p></CardContent></Card>
      </div>

      {moteurs.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
            <Cog size={16} className="text-text-dim" /> Moteurs ({moteurs.length})
          </h3>
          <PieceTable rows={moteurs} labelCol="Type moteur" subCol="Num série" extraCol="Marque" />
        </div>
      )}

      {boites.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
            <Package size={16} className="text-text-dim" /> Boîtes de vitesses ({boites.length})
          </h3>
          <PieceTable rows={boites} labelCol="Réf BV" subCol="Num interne" extraCol="Type" />
        </div>
      )}

      {pieces.length === 0 && (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">
          Aucune pièce rattachée à cette réception
        </div>
      )}
    </div>
  );
}
