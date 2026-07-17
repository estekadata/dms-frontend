"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Building2,
  User,
  Smartphone,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PeriodFilter, inPeriod, type Period } from "@/components/period-filter";

type Fournisseur = {
  n_fournisseur: number;
  nom_fournisseur: string | null;
  contact_fourniss: string | null;
  adresse1_fourniss: string | null;
  adresse2_fourniss: string | null;
  cp_fourniss: string | null;
  ville_fourniss: string | null;
  tel_fourniss: string | null;
  port_fourniss: string | null;
  mail_fourniss: string | null;
  autres_infos: string | null;
  careco: boolean | null;
  actionnaire: boolean | null;
};

type Reception = {
  n_reception: number;
  date_achat: string | null;
  montant_ht: number | null;
  reception_terminee: boolean | null;
  nb_moteurs: number;
};

type Moteur = {
  n_moteur: number;
  code: string;
  num_reception: number | null;
  date_achat: string | null;
  prix_achat: number | null;
  prix_vente: number | null;
  vendu: boolean;
};

function fmtPrice(v: number | null | undefined) {
  if (v == null) return "—";
  return `${Math.round(v).toLocaleString("fr-FR")} €`;
}

function fournisseurDisplayName(f: Fournisseur) {
  return f.nom_fournisseur || f.contact_fourniss || `Fournisseur #${f.n_fournisseur}`;
}

export default function FournisseurProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = use(params);
  const id = Number(idStr);

  const [fournisseur, setFournisseur] = useState<Fournisseur | null>(null);
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [moteurs, setMoteurs] = useState<Moteur[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [period, setPeriod] = useState<Period>("all");

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);

      // 1. Fournisseur info
      const { data: fRow } = await supabase
        .from("tbl_fournisseurs")
        .select(
          "n_fournisseur, nom_fournisseur, contact_fourniss, adresse1_fourniss, adresse2_fourniss, cp_fourniss, ville_fourniss, tel_fourniss, port_fourniss, mail_fourniss, autres_infos, careco, actionnaire"
        )
        .eq("n_fournisseur", id)
        .maybeSingle();

      if (cancelled) return;
      if (!fRow) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setFournisseur(fRow as Fournisseur);

      // 2. Réceptions de ce fournisseur
      const { data: recRows } = await supabase
        .from("tbl_receptions")
        .select("n_reception, date_achat, montant_ht, reception_terminee")
        .eq("n_fournisseur", id)
        .order("date_achat", { ascending: false, nullsFirst: false })
        .limit(2000);

      const recIds = (recRows || []).map((r: any) => r.n_reception).filter(Boolean) as number[];

      // 3. Moteurs liés à ces réceptions — paginé (limite serveur PostgREST ~5000/req)
      const motRows: any[] = [];
      if (recIds.length) {
        const PAGE = 1000;
        let offset = 0;
        while (true) {
          const { data, error } = await supabase
            .from("v_moteurs_dispo")
            .select("n_moteur, nom_type_moteur, code_moteur, num_reception, prix_achat_moteur")
            .in("num_reception", recIds)
            .range(offset, offset + PAGE - 1);
          if (error || !data || data.length === 0) break;
          motRows.push(...data);
          if (data.length < PAGE) break;
          offset += PAGE;
          if (offset > 100000) break; // safety
        }
      }

      const motorIds = motRows.map((m: any) => m.n_moteur).filter(Boolean) as number[];

      // 4. Prix de vente pour ces moteurs — chunked IN (URL trop longue sinon)
      const venteByMoteur: Record<number, number | null> = {};
      if (motorIds.length) {
        const CHUNK = 500;
        for (let i = 0; i < motorIds.length; i += CHUNK) {
          const slice = motorIds.slice(i, i + CHUNK);
          const { data: ventes } = await supabase
            .from("tbl_expeditions_moteurs")
            .select("n_moteur, prix_vente_moteur, date_validation")
            .in("n_moteur", slice);
          (ventes || []).forEach((v: any) => {
            venteByMoteur[v.n_moteur] = v.prix_vente_moteur;
          });
        }
      }

      const recDateById: Record<number, string | null> = {};
      (recRows || []).forEach((r: any) => {
        recDateById[r.n_reception] = r.date_achat;
      });

      const allMoteurs: Moteur[] = motRows.map((m: any) => ({
        n_moteur: m.n_moteur,
        code: m.nom_type_moteur || m.code_moteur || `Moteur #${m.n_moteur}`,
        num_reception: m.num_reception,
        date_achat: m.num_reception ? recDateById[m.num_reception] || null : null,
        prix_achat: m.prix_achat_moteur,
        prix_vente: venteByMoteur[m.n_moteur] ?? null,
        vendu: m.n_moteur in venteByMoteur,
      }));

      // Compte moteurs par réception
      const moteurCountByReception: Record<number, number> = {};
      allMoteurs.forEach((m) => {
        if (m.num_reception != null) {
          moteurCountByReception[m.num_reception] =
            (moteurCountByReception[m.num_reception] || 0) + 1;
        }
      });

      const enrichedReceptions: Reception[] = ((recRows || []) as any[]).map((r: any) => ({
        n_reception: r.n_reception,
        date_achat: r.date_achat,
        montant_ht: r.montant_ht,
        reception_terminee: r.reception_terminee,
        nb_moteurs: moteurCountByReception[r.n_reception] || 0,
      }));

      if (cancelled) return;
      setReceptions(enrichedReceptions);
      setMoteurs(
        allMoteurs.sort((a, b) => {
          const da = a.date_achat ? new Date(a.date_achat).getTime() : 0;
          const db = b.date_achat ? new Date(b.date_achat).getTime() : 0;
          return db - da;
        })
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <div className="text-center py-16 text-text-muted">Chargement du profil fournisseur...</div>;
  }

  if (notFound || !fournisseur) {
    return (
      <div>
        <Link
          href="/receptions"
          className="inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground mb-4"
        >
          <ArrowLeft size={14} /> Retour aux réceptions
        </Link>
        <div className="bg-surface border border-border rounded-[14px] p-10 text-center">
          <p className="text-foreground font-semibold">Fournisseur introuvable</p>
          <p className="text-sm text-text-muted mt-1">
            Aucun fournisseur n&apos;existe avec l&apos;identifiant{" "}
            <span className="font-mono">{idStr}</span>.
          </p>
        </div>
      </div>
    );
  }

  // Filtre période (sur la date d'achat / réception)
  const fReceptions = receptions.filter((r) => inPeriod(r.date_achat, period));
  const fMoteurs = moteurs.filter((m) => inPeriod(m.date_achat, period));

  // Stats (sur la période sélectionnée)
  const totalAchatHT = fReceptions.reduce((s, r) => s + (r.montant_ht || 0), 0);
  const nbMoteurs = fMoteurs.length;
  const moteursVendus = fMoteurs.filter((m) => m.vendu);
  const nbVendus = moteursVendus.length;
  const nbEnStock = nbMoteurs - nbVendus;
  const totalVenteHT = moteursVendus.reduce((s, m) => s + (m.prix_vente || 0), 0);

  const moteursPrixAchat = fMoteurs.filter((m) => (m.prix_achat || 0) > 0);
  const prixAchatMoyen =
    moteursPrixAchat.length > 0
      ? moteursPrixAchat.reduce((s, m) => s + (m.prix_achat || 0), 0) / moteursPrixAchat.length
      : null;
  const prixVenteMoyen =
    moteursVendus.length > 0
      ? totalVenteHT / moteursVendus.length
      : null;
  const margeMoyenne =
    prixAchatMoyen != null && prixVenteMoyen != null
      ? prixVenteMoyen - prixAchatMoyen
      : null;

  const villeLine = [fournisseur.cp_fourniss, fournisseur.ville_fourniss].filter(Boolean).join(" ");
  const adresse = [fournisseur.adresse1_fourniss, fournisseur.adresse2_fourniss]
    .filter(Boolean)
    .join(", ");

  return (
    <div>
      <Link
        href="/receptions"
        className="inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground mb-4"
      >
        <ArrowLeft size={14} /> Retour aux réceptions
      </Link>

      <PageHeader
        title={fournisseurDisplayName(fournisseur)}
        description={`Fournisseur n° ${fournisseur.n_fournisseur}`}
      />

      {(fournisseur.careco || fournisseur.actionnaire) && (
        <div className="flex gap-2 mb-4">
          {fournisseur.careco && (
            <Badge className="bg-[rgba(96,165,250,0.10)] text-blue-600 border border-[rgba(96,165,250,0.20)] hover:bg-[rgba(96,165,250,0.15)]">
              Careco
            </Badge>
          )}
          {fournisseur.actionnaire && (
            <Badge className="bg-[rgba(167,139,250,0.10)] text-purple-600 border border-[rgba(167,139,250,0.20)] hover:bg-[rgba(167,139,250,0.15)]">
              Actionnaire
            </Badge>
          )}
        </div>
      )}

      {/* Coordonnées */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="p-5 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-text-dim">
              <Building2 size={14} />
              <span className="font-semibold uppercase text-xs">Société</span>
            </div>
            <p className="text-foreground font-medium">{fournisseur.nom_fournisseur || "—"}</p>
            <div className="flex items-center gap-2 text-text-dim pt-2">
              <User size={14} />
              <span className="font-semibold uppercase text-xs">Contact</span>
            </div>
            <p className="text-foreground">{fournisseur.contact_fourniss || "—"}</p>
            {fournisseur.autres_infos && (
              <>
                <p className="text-xs font-semibold uppercase text-text-dim pt-2">Autres infos</p>
                <p className="text-foreground text-xs whitespace-pre-line">
                  {fournisseur.autres_infos}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-text-dim mt-1 shrink-0" />
              <div>
                <p className="text-foreground">{adresse || "—"}</p>
                <p className="text-text-dim">{villeLine || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Mail size={14} className="text-text-dim shrink-0" />
              {fournisseur.mail_fourniss ? (
                <a
                  href={`mailto:${fournisseur.mail_fourniss}`}
                  className="text-brand hover:underline truncate"
                >
                  {fournisseur.mail_fourniss}
                </a>
              ) : (
                <span className="text-text-dim">—</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Phone size={14} className="text-text-dim shrink-0" />
              <span className="text-foreground">{fournisseur.tel_fourniss || "—"}</span>
            </div>
            {fournisseur.port_fourniss && (
              <div className="flex items-center gap-2">
                <Smartphone size={14} className="text-text-dim shrink-0" />
                <span className="text-foreground">{fournisseur.port_fourniss}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Période */}
      <PeriodFilter value={period} onChange={setPeriod} />

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Réceptions</p><p className="text-2xl font-bold text-foreground">{fReceptions.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Moteurs reçus</p><p className="text-2xl font-bold text-foreground">{nbMoteurs}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Encore en stock</p><p className="text-2xl font-bold text-emerald-600">{nbEnStock}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Vendus</p><p className="text-2xl font-bold text-foreground">{nbVendus}{nbMoteurs > 0 && <span className="ml-1 text-sm text-text-muted">({Math.round((nbVendus / nbMoteurs) * 100)}%)</span>}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Total achats HT</p><p className="text-2xl font-bold text-brand">{fmtPrice(totalAchatHT)}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-dim font-semibold uppercase">Prix achat moyen / moteur</p>
            <p className="text-xl font-bold text-foreground">{fmtPrice(prixAchatMoyen)}</p>
            {moteursPrixAchat.length > 0 && (
              <p className="text-xs text-text-muted mt-1">
                sur {moteursPrixAchat.length} moteurs avec prix saisi
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-dim font-semibold uppercase">Prix vente moyen / moteur</p>
            <p className="text-xl font-bold text-foreground">{fmtPrice(prixVenteMoyen)}</p>
            {nbVendus > 0 && (
              <p className="text-xs text-text-muted mt-1">sur {nbVendus} moteurs vendus</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-dim font-semibold uppercase">Marge brute moyenne</p>
            <p
              className={`text-xl font-bold ${
                margeMoyenne == null
                  ? "text-text-dim"
                  : margeMoyenne >= 0
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}
            >
              {margeMoyenne != null
                ? `${margeMoyenne >= 0 ? "+" : ""}${fmtPrice(margeMoyenne)}`
                : "—"}
            </p>
            <p className="text-xs text-text-muted mt-1">prix vente moyen − prix achat moyen</p>
          </CardContent>
        </Card>
      </div>

      {/* Réceptions */}
      <h3 className="font-semibold text-foreground mb-3">Réceptions ({fReceptions.length})</h3>
      <div className="bg-surface border border-border rounded-[14px] overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-text-dim text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">N°</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-center">Moteurs</th>
              <th className="px-4 py-3 text-right">Montant HT</th>
              <th className="px-4 py-3 text-center">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {fReceptions.map((r) => (
              <tr key={r.n_reception} className="hover:bg-surface-hover transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-text-muted">{r.n_reception}</td>
                <td className="px-4 py-3 text-text-dim">
                  {r.date_achat ? new Date(r.date_achat).toLocaleDateString("fr-FR") : "—"}
                </td>
                <td className="px-4 py-3 text-center text-text-dim">{r.nb_moteurs}</td>
                <td className="px-4 py-3 text-right tabular-nums text-text-dim">
                  {fmtPrice(r.montant_ht)}
                </td>
                <td className="px-4 py-3 text-center">
                  {r.reception_terminee ? (
                    <Badge className="bg-[rgba(52,211,153,0.10)] text-emerald-600 border border-[rgba(52,211,153,0.20)] hover:bg-[rgba(52,211,153,0.15)]">
                      Terminée
                    </Badge>
                  ) : (
                    <Badge className="bg-[rgba(96,165,250,0.10)] text-blue-600 border border-[rgba(96,165,250,0.20)] hover:bg-[rgba(96,165,250,0.15)]">
                      En cours
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {fReceptions.length === 0 && (
          <p className="text-center py-10 text-text-muted italic">Aucune réception</p>
        )}
      </div>

      {/* Moteurs */}
      <h3 className="font-semibold text-foreground mb-3">Moteurs reçus ({fMoteurs.length})</h3>
      <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-text-dim text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">N°</th>
                <th className="px-4 py-3 text-left">Code moteur</th>
                <th className="px-4 py-3 text-left">Date achat</th>
                <th className="px-4 py-3 text-right">Prix achat</th>
                <th className="px-4 py-3 text-right">Prix vente</th>
                <th className="px-4 py-3 text-right">Marge</th>
                <th className="px-4 py-3 text-center">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {fMoteurs.map((m) => {
                const marge =
                  m.prix_achat != null && m.prix_vente != null ? m.prix_vente - m.prix_achat : null;
                return (
                  <tr key={m.n_moteur} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">{m.n_moteur}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{m.code}</td>
                    <td className="px-4 py-3 text-text-dim">
                      {m.date_achat ? new Date(m.date_achat).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-dim">
                      {fmtPrice(m.prix_achat)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-dim">
                      {fmtPrice(m.prix_vente)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-medium ${
                        marge == null
                          ? "text-text-dim"
                          : marge >= 0
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      {marge != null ? `${marge >= 0 ? "+" : ""}${fmtPrice(marge)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {m.vendu ? (
                        <Badge className="bg-[rgba(148,163,184,0.15)] text-slate-600 border border-[rgba(148,163,184,0.25)] hover:bg-[rgba(148,163,184,0.20)]">
                          Vendu
                        </Badge>
                      ) : (
                        <Badge className="bg-[rgba(52,211,153,0.10)] text-emerald-600 border border-[rgba(52,211,153,0.20)] hover:bg-[rgba(52,211,153,0.15)]">
                          En stock
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {fMoteurs.length === 0 && (
          <p className="text-center py-10 text-text-muted italic">Aucun moteur enregistré</p>
        )}
      </div>
    </div>
  );
}
