"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SortHeader, useClientSort } from "@/components/sortable";
import { Badge } from "@/components/ui/badge";

type Tab = "Réceptions" | "Expéditions" | "Stats";

type Reception = { n_reception: number; date_reception: string; fournisseur?: string; nb_moteurs?: number; montant_total?: number; };
type Expedition = { n_expedition: number; date_validation: string; client?: string; code_moteur?: string; prix_vente_moteur?: number; };
type Stats = { mois: string; recus: number; vendus: number; };

export default function HistoriquePage() {
  const [tab, setTab] = useState<Tab>("Réceptions");
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [expeditions, setExpeditions] = useState<Expedition[]>([]);
  const [stats, setStats] = useState<Stats[]>([]);
  const [loading, setLoading] = useState(true);
  const recSort = useClientSort(receptions);
  const expSort = useClientSort(expeditions);
  const statSort = useClientSort(stats);

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (tab === "Réceptions") {
        const { data } = await supabase
          .from("v_receptions")
          .select("n_reception, date_reception, fournisseur, nb_moteurs, montant_total")
          .order("date_reception", { ascending: false })
          .limit(200);
        setReceptions(data || []);
      } else if (tab === "Expéditions") {
        const { data: expMoteurs } = await supabase
          .from("tbl_expeditions_moteurs")
          .select("id, n_expedition, n_moteur, date_validation, prix_vente_moteur")
          .order("date_validation", { ascending: false })
          .limit(500);

        const rows = expMoteurs || [];
        const expIds = [...new Set(rows.map((r: any) => r.n_expedition).filter(Boolean))] as number[];
        const motorIds = [...new Set(rows.map((r: any) => r.n_moteur).filter(Boolean))] as number[];

        const [expRes, motRes] = await Promise.all([
          expIds.length
            ? supabase.from("tbl_expeditions").select("n_expedition, n_client").in("n_expedition", expIds)
            : Promise.resolve({ data: [] as any[] }),
          motorIds.length
            ? supabase.from("v_moteurs_dispo").select("n_moteur, nom_type_moteur, code_moteur").in("n_moteur", motorIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const clientIds = [...new Set((expRes.data || []).map((e: any) => e.n_client).filter(Boolean))] as number[];
        const cliRes = clientIds.length
          ? await supabase.from("tbl_clients").select("n_client, societe, nom_contact").in("n_client", clientIds)
          : { data: [] as any[] };

        const clientById: Record<number, string> = {};
        (cliRes.data || []).forEach((c: any) => {
          clientById[c.n_client] = c.societe || c.nom_contact || `Client #${c.n_client}`;
        });
        const clientByExp: Record<number, string> = {};
        (expRes.data || []).forEach((e: any) => {
          if (e.n_client && clientById[e.n_client]) clientByExp[e.n_expedition] = clientById[e.n_client];
        });
        const codeByMotor: Record<number, string> = {};
        (motRes.data || []).forEach((m: any) => {
          codeByMotor[m.n_moteur] = m.nom_type_moteur || m.code_moteur || "";
        });

        setExpeditions(rows.map((r: any) => ({
          n_expedition: r.n_expedition,
          date_validation: r.date_validation,
          client: clientByExp[r.n_expedition] || "—",
          code_moteur: codeByMotor[r.n_moteur] || "—",
          prix_vente_moteur: r.prix_vente_moteur,
        })));
      } else {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - 12);
        const [{ data: recData }, { data: expData }] = await Promise.all([
          supabase.from("v_receptions").select("date_reception, nb_moteurs").gte("date_reception", cutoff.toISOString()),
          supabase.from("tbl_expeditions_moteurs").select("date_validation").gte("date_validation", cutoff.toISOString()),
        ]);
        const byMonth: Record<string, { recus: number; vendus: number }> = {};
        (recData || []).forEach((r: any) => {
          const k = r.date_reception?.substring(0, 7) || "";
          if (!byMonth[k]) byMonth[k] = { recus: 0, vendus: 0 };
          byMonth[k].recus += r.nb_moteurs || 0;
        });
        (expData || []).forEach((e: any) => {
          const k = e.date_validation?.substring(0, 7) || "";
          if (!byMonth[k]) byMonth[k] = { recus: 0, vendus: 0 };
          byMonth[k].vendus++;
        });
        setStats(
          Object.entries(byMonth)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([mois, v]) => ({ mois, ...v }))
        );
      }
      setLoading(false);
    }
    load();
  }, [tab]);

  return (
    <div>
      <PageHeader title="Historique" description="Réceptions, expéditions et statistiques" />

      <div className="flex bg-surface-alt rounded-lg border border-border overflow-hidden mb-6 w-fit">
        {(["Réceptions", "Expéditions", "Stats"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 text-sm font-medium transition-all ${tab === t ? "bg-brand text-white" : "text-text-dim hover:bg-surface-hover"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-text-muted">Chargement...</div>
      ) : tab === "Réceptions" ? (
        receptions.length === 0 ? (
          <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">Aucune réception</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
              {receptions.map((r, i) => (
                <div key={`rec-c-${i}`} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold text-foreground">{r.fournisseur || "—"}</p>
                    <span className="shrink-0 font-mono text-xs text-text-muted">n°{r.n_reception}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2 text-sm text-text-dim">
                    <span>{r.date_reception ? new Date(r.date_reception).toLocaleDateString("fr-FR") : "—"} · {r.nb_moteurs ?? 0} moteurs</span>
                    <span className="font-semibold text-foreground">{r.montant_total ? `${Math.round(r.montant_total).toLocaleString("fr-FR")} €` : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-hidden rounded-[14px] border border-border bg-surface md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-alt text-text-dim text-xs uppercase">
                    <tr>
                      <SortHeader label="N°" active={recSort.sortKey === "n_reception"} dir={recSort.sortDir} onClick={() => recSort.onSort("n_reception")} />
                      <SortHeader label="Date" active={recSort.sortKey === "date_reception"} dir={recSort.sortDir} onClick={() => recSort.onSort("date_reception")} />
                      <SortHeader label="Fournisseur" active={recSort.sortKey === "fournisseur"} dir={recSort.sortDir} onClick={() => recSort.onSort("fournisseur")} />
                      <SortHeader label="Moteurs" align="center" active={recSort.sortKey === "nb_moteurs"} dir={recSort.sortDir} onClick={() => recSort.onSort("nb_moteurs")} />
                      <SortHeader label="Montant" align="right" active={recSort.sortKey === "montant_total"} dir={recSort.sortDir} onClick={() => recSort.onSort("montant_total")} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recSort.sorted.map((r, i) => (
                      <tr key={`rec-r-${i}`} className="transition-colors hover:bg-surface-hover">
                        <td className="px-4 py-3 font-mono text-xs text-text-muted">{r.n_reception}</td>
                        <td className="px-4 py-3 text-text-dim">{r.date_reception ? new Date(r.date_reception).toLocaleDateString("fr-FR") : "—"}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{r.fournisseur || "—"}</td>
                        <td className="px-4 py-3 text-center text-text-dim">{r.nb_moteurs ?? "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-text-dim">{r.montant_total ? `${Math.round(r.montant_total).toLocaleString("fr-FR")} €` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      ) : tab === "Expéditions" ? (
        expeditions.length === 0 ? (
          <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">Aucune expédition</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
              {expeditions.map((e, i) => (
                <div key={`exp-c-${i}`} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold text-foreground">{e.code_moteur || "—"}</p>
                    <span className="shrink-0 font-mono text-xs text-text-muted">n°{e.n_expedition}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2 text-sm">
                    <span className="min-w-0 truncate text-text-dim">
                      {e.client || "—"} · {e.date_validation ? new Date(e.date_validation).toLocaleDateString("fr-FR") : "—"}
                    </span>
                    <span className="shrink-0 font-semibold text-foreground">{e.prix_vente_moteur ? `${Math.round(e.prix_vente_moteur).toLocaleString("fr-FR")} €` : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-hidden rounded-[14px] border border-border bg-surface md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-alt text-text-dim text-xs uppercase">
                    <tr>
                      <SortHeader label="N°" active={expSort.sortKey === "n_expedition"} dir={expSort.sortDir} onClick={() => expSort.onSort("n_expedition")} />
                      <SortHeader label="Date" active={expSort.sortKey === "date_validation"} dir={expSort.sortDir} onClick={() => expSort.onSort("date_validation")} />
                      <SortHeader label="Client" active={expSort.sortKey === "client"} dir={expSort.sortDir} onClick={() => expSort.onSort("client")} />
                      <SortHeader label="Code moteur" active={expSort.sortKey === "code_moteur"} dir={expSort.sortDir} onClick={() => expSort.onSort("code_moteur")} />
                      <SortHeader label="Prix vente" align="right" active={expSort.sortKey === "prix_vente_moteur"} dir={expSort.sortDir} onClick={() => expSort.onSort("prix_vente_moteur")} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {expSort.sorted.map((e, i) => (
                      <tr key={`exp-r-${i}`} className="transition-colors hover:bg-surface-hover">
                        <td className="px-4 py-3 font-mono text-xs text-text-muted">{e.n_expedition}</td>
                        <td className="px-4 py-3 text-text-dim">{e.date_validation ? new Date(e.date_validation).toLocaleDateString("fr-FR") : "—"}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{e.client || "—"}</td>
                        <td className="px-4 py-3 text-text-dim">{e.code_moteur || "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-text-dim">{e.prix_vente_moteur ? `${Math.round(e.prix_vente_moteur).toLocaleString("fr-FR")} €` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      ) : stats.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">Aucune donnée</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
            {stats.map((s) => (
              <div key={s.mois} className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
                <div>
                  <p className="font-semibold text-foreground">{s.mois}</p>
                  <p className="text-xs text-text-dim">{s.recus} reçus · {s.vendus} vendus</p>
                </div>
                <Badge
                  className={
                    s.recus - s.vendus >= 0
                      ? "bg-[rgba(96,165,250,0.10)] text-blue-600 border border-[rgba(96,165,250,0.20)]"
                      : "bg-[rgba(248,113,113,0.10)] text-red-600 border border-[rgba(248,113,113,0.20)]"
                  }
                >
                  {s.recus - s.vendus >= 0 ? "+" : ""}{s.recus - s.vendus}
                </Badge>
              </div>
            ))}
          </div>
          <div className="hidden overflow-hidden rounded-[14px] border border-border bg-surface md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt text-text-dim text-xs uppercase">
                  <tr>
                    <SortHeader label="Mois" active={statSort.sortKey === "mois"} dir={statSort.sortDir} onClick={() => statSort.onSort("mois")} />
                    <SortHeader label="Moteurs reçus" align="center" active={statSort.sortKey === "recus"} dir={statSort.sortDir} onClick={() => statSort.onSort("recus")} />
                    <SortHeader label="Moteurs vendus" align="center" active={statSort.sortKey === "vendus"} dir={statSort.sortDir} onClick={() => statSort.onSort("vendus")} />
                    <th className="px-4 py-3 text-center">Solde</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {statSort.sorted.map((s) => (
                    <tr key={s.mois} className="transition-colors hover:bg-surface-hover">
                      <td className="px-4 py-3 font-semibold text-foreground">{s.mois}</td>
                      <td className="px-4 py-3 text-center tabular-nums text-text-dim">{s.recus}</td>
                      <td className="px-4 py-3 text-center tabular-nums text-text-dim">{s.vendus}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          className={
                            s.recus - s.vendus >= 0
                              ? "bg-[rgba(96,165,250,0.10)] text-blue-600 border border-[rgba(96,165,250,0.20)] hover:bg-[rgba(96,165,250,0.15)]"
                              : "bg-[rgba(248,113,113,0.10)] text-red-600 border border-[rgba(248,113,113,0.20)] hover:bg-[rgba(248,113,113,0.15)]"
                          }
                        >
                          {s.recus - s.vendus >= 0 ? "+" : ""}{s.recus - s.vendus}
                        </Badge>
                      </td>
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
