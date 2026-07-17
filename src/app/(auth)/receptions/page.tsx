"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Reception = {
  n_reception: number;
  date_reception: string;
  fournisseur?: string;
  nb_moteurs?: number;
  nb_boites?: number;
  montant_total?: number;
  statut?: string;
};

type Detail = { n_moteur?: number; code_moteur?: string; num_serie?: string; marque?: string; prix_achat_moteur?: number; };

// Pagination pour dépasser la limite Supabase (1000/5000 selon config)
async function fetchAll<T = any>(buildQuery: (from: number, to: number) => any, maxTotal = 50000): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 5000;
  let from = 0;
  while (from < maxTotal) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export default function ReceptionsPage() {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [fournisseurIdByName, setFournisseurIdByName] = useState<Record<string, number>>({});
  const [draftIds, setDraftIds] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Reception | null>(null);
  const [details, setDetails] = useState<Detail[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [validatingId, setValidatingId] = useState<number | null>(null);
  const [visible, setVisible] = useState(60);

  // Charge la map nom_fournisseur → n_fournisseur une fois pour les liens cliquables
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("tbl_fournisseurs")
        .select("n_fournisseur, nom_fournisseur")
        .limit(5000);
      const map: Record<string, number> = {};
      (data || []).forEach((f: any) => {
        if (f.nom_fournisseur) map[f.nom_fournisseur] = f.n_fournisseur;
      });
      setFournisseurIdByName(map);
    })();
  }, []);

  const reloadDrafts = useCallback(async () => {
    // Récupère les n_reception encore en brouillon (reception_terminee=false)
    const { data } = await supabase
      .from("tbl_receptions")
      .select("n_reception")
      .eq("reception_terminee", false)
      .limit(5000);
    setDraftIds(new Set(((data as any[]) || []).map((r) => r.n_reception)));
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await fetchAll<Reception>((from, to) => {
        let q = supabase
          .from("v_receptions")
          .select("n_reception, date_reception, fournisseur, nb_moteurs, nb_boites, montant_total, statut")
          .order("n_reception", { ascending: false })
          .range(from, to);
        if (search) q = q.ilike("fournisseur", `%${search}%`);
        if (dateFrom) q = q.gte("date_reception", dateFrom);
        if (dateTo) q = q.lte("date_reception", dateTo);
        return q;
      });
      setReceptions(data);
      setVisible(60);
      await reloadDrafts();
      setLoading(false);
    }
    load();
  }, [search, dateFrom, dateTo, reloadDrafts]);

  async function validerReception(n_reception: number) {
    if (!confirm(`Valider la réception n°${n_reception} ? Elle ne sera plus modifiable comme brouillon.`)) return;
    setValidatingId(n_reception);
    const { error } = await supabase
      .from("tbl_receptions")
      .update({ reception_terminee: true })
      .eq("n_reception", n_reception);
    setValidatingId(null);
    if (error) {
      alert(`Erreur : ${error.message}`);
      return;
    }
    await reloadDrafts();
  }

  async function openDetail(rec: Reception) {
    setSelected(rec);
    setDetailLoading(true);
    const { data } = await supabase
      .from("v_moteurs_dispo")
      .select("n_moteur, nom_type_moteur, num_serie, marque, prix_achat_moteur")
      .eq("num_reception", rec.n_reception)
      .limit(500);
    setDetails(data || []);
    setDetailLoading(false);
  }

  const totalMoteurs = receptions.reduce((s, r) => s + (r.nb_moteurs || 0), 0);
  const totalMontant = receptions.reduce((s, r) => s + (r.montant_total || 0), 0);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Réceptions" description="Gestion des arrivages fournisseurs" />
        <Link href="/receptions/nouvelle">
          <Button className="bg-brand hover:bg-brand/80 text-white">
            <Plus size={14} className="mr-1" /> Nouvelle réception
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card><CardContent className="p-4"><p className="text-xs text-text-dim font-semibold uppercase">Réceptions</p><p className="text-2xl font-bold text-brand">{receptions.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-text-dim font-semibold uppercase">Total moteurs</p><p className="text-2xl font-bold text-foreground">{totalMoteurs}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-text-dim font-semibold uppercase">Montant total</p><p className="text-2xl font-bold text-foreground">{Math.round(totalMontant).toLocaleString("fr-FR")} €</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Input
          placeholder="Rechercher par fournisseur..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm bg-surface-alt border-border text-foreground placeholder:text-text-muted"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs uppercase text-text-dim font-semibold">Du</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[160px] bg-surface-alt border-border text-foreground"
          />
          <label className="text-xs uppercase text-text-dim font-semibold">Au</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[160px] bg-surface-alt border-border text-foreground"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-xs text-text-muted hover:text-foreground transition-colors"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${selected ? "lg:grid-cols-2" : ""}`}>
        <div>
          {loading ? (
            <p className="py-10 text-center text-text-muted">Chargement…</p>
          ) : receptions.length === 0 ? (
            <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">Aucune réception</div>
          ) : (
            <>
              {/* Mobile : cartes cliquables */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
                {receptions.slice(0, visible).map((r, i) => (
                  <div
                    key={`rc-${i}`}
                    onClick={() => openDetail(r)}
                    className={`cursor-pointer rounded-2xl bg-card p-4 ring-1 transition ${selected?.n_reception === r.n_reception ? "ring-brand" : "ring-foreground/10"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-semibold text-foreground">{r.fournisseur || "—"}</p>
                      <Link
                        href={`/receptions/${r.n_reception}`}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 font-mono text-xs font-semibold text-brand hover:underline"
                      >
                        #{r.n_reception}
                      </Link>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2 text-sm text-text-dim">
                      <span>{r.date_reception ? new Date(r.date_reception).toLocaleDateString("fr-FR") : "—"} · {r.nb_moteurs ?? 0} mot.</span>
                      <span className="font-semibold text-foreground">{r.montant_total ? `${Math.round(r.montant_total).toLocaleString("fr-FR")} €` : "—"}</span>
                    </div>
                    <div className="mt-2">
                      {draftIds.has(r.n_reception) ? (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-[rgba(96,165,250,0.10)] text-blue-600 border border-[rgba(96,165,250,0.20)]">Brouillon</Badge>
                          <Button size="xs" variant="outline" onClick={(e) => { e.stopPropagation(); validerReception(r.n_reception); }} disabled={validatingId === r.n_reception}>
                            {validatingId === r.n_reception ? "…" : "Valider"}
                          </Button>
                        </div>
                      ) : (
                        <Badge className="bg-[rgba(52,211,153,0.10)] text-emerald-600 border border-[rgba(52,211,153,0.20)]">{r.statut || "Reçu"}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop : table */}
              <div className="hidden overflow-hidden rounded-[14px] border border-border bg-surface md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-alt text-text-dim text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">N°</th>
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">Fournisseur</th>
                        <th className="px-4 py-3 text-center">Moteurs</th>
                        <th className="px-4 py-3 text-right">Montant</th>
                        <th className="px-4 py-3 text-center">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {receptions.slice(0, visible).map((r, i) => {
                        const fId = r.fournisseur ? fournisseurIdByName[r.fournisseur] : undefined;
                        return (
                          <tr
                            key={`rt-${i}`}
                            onClick={() => openDetail(r)}
                            className={`cursor-pointer transition-colors hover:bg-surface-hover ${selected?.n_reception === r.n_reception ? "bg-brand-soft" : ""}`}
                          >
                            <td className="px-4 py-3">
                              <Link
                                href={`/receptions/${r.n_reception}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-mono text-xs font-semibold text-brand hover:underline"
                              >
                                #{r.n_reception}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-text-dim">{r.date_reception ? new Date(r.date_reception).toLocaleDateString("fr-FR") : "—"}</td>
                            <td className="px-4 py-3 font-medium text-foreground">
                              {r.fournisseur && fId ? (
                                <Link href={`/fournisseurs/${fId}`} onClick={(e) => e.stopPropagation()} className="text-brand hover:underline">
                                  {r.fournisseur}
                                </Link>
                              ) : (
                                r.fournisseur || "—"
                              )}
                            </td>
                            <td className="px-4 py-3 text-center text-text-dim">{r.nb_moteurs ?? "—"}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-text-dim">{r.montant_total ? `${Math.round(r.montant_total).toLocaleString("fr-FR")} €` : "—"}</td>
                            <td className="px-4 py-3 text-center">
                              {draftIds.has(r.n_reception) ? (
                                <div className="flex items-center justify-center gap-2">
                                  <Badge className="bg-[rgba(96,165,250,0.10)] text-blue-600 border border-[rgba(96,165,250,0.20)] hover:bg-[rgba(96,165,250,0.15)]">Brouillon</Badge>
                                  <Button size="xs" variant="outline" onClick={(e) => { e.stopPropagation(); validerReception(r.n_reception); }} disabled={validatingId === r.n_reception}>
                                    {validatingId === r.n_reception ? "..." : "Valider"}
                                  </Button>
                                </div>
                              ) : (
                                <Badge className="bg-[rgba(52,211,153,0.10)] text-emerald-600 border border-[rgba(52,211,153,0.20)] hover:bg-[rgba(52,211,153,0.15)]">{r.statut || "Reçu"}</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {receptions.length > visible && (
                <div className="mt-5 flex justify-center">
                  <Button variant="outline" onClick={() => setVisible((v) => v + 60)}>
                    Voir plus ({(receptions.length - visible).toLocaleString("fr-FR")})
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {selected && (
          <div className="bg-surface border border-border rounded-[14px] p-5">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-foreground">Réception #{selected.n_reception}</h3>
                <p className="text-sm text-text-dim">
                  {selected.fournisseur && fournisseurIdByName[selected.fournisseur] ? (
                    <Link
                      href={`/fournisseurs/${fournisseurIdByName[selected.fournisseur]}`}
                      className="text-brand hover:underline"
                    >
                      {selected.fournisseur}
                    </Link>
                  ) : (
                    selected.fournisseur || "—"
                  )}
                  {" — "}
                  {selected.date_reception ? new Date(selected.date_reception).toLocaleDateString("fr-FR") : ""}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-text-muted hover:text-foreground text-lg transition-colors">✕</button>
            </div>
            {detailLoading ? (
              <p className="text-text-muted text-sm">Chargement des moteurs...</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-text-dim uppercase bg-surface-alt">
                  <tr>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Num série</th>
                    <th className="px-3 py-2 text-left">Marque</th>
                    <th className="px-3 py-2 text-right">Prix achat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {details.map((d) => (
                    <tr key={d.n_moteur} className="hover:bg-surface-hover transition-colors">
                      <td className="px-3 py-2 font-semibold text-foreground">{(d as any).nom_type_moteur || d.code_moteur || "—"}</td>
                      <td className="px-3 py-2 text-text-dim text-xs">{d.num_serie || "—"}</td>
                      <td className="px-3 py-2 text-text-dim">{d.marque || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-text-dim">{d.prix_achat_moteur ? `${Math.round(d.prix_achat_moteur)} €` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!detailLoading && details.length === 0 && <p className="text-text-muted text-sm mt-4 italic">Aucun moteur lié à cette réception</p>}
          </div>
        )}
      </div>
    </div>
  );
}
