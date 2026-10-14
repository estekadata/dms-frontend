"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, Printer, ClipboardList, CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { compoLabel } from "@/components/moteur-statuts";

type Client = { n_client: number; nom: string };
type Item = {
  kind: "moteur" | "boite";
  id: number;
  interne: string;
  type: string;
  serie: string;
  compo: number | null;
  emplacement: string;
  prepare: boolean;
};

function empIdFromGeloc(g: string | null): number | null {
  if (g == null || g === "") return null;
  const n = parseFloat(String(g));
  return Number.isFinite(n) ? Math.round(n) : null;
}

export default function PreparationPage() {
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<Client[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [migMissing, setMigMissing] = useState(false);

  // Recherche client
  useEffect(() => {
    if (client) return;
    const q = search.trim();
    if (!q) { setHits([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("tbl_clients")
        .select("n_client, societe, nom_usage, nom_contact")
        .or(`societe.ilike.%${q}%,nom_usage.ilike.%${q}%,nom_contact.ilike.%${q}%`)
        .limit(15);
      setHits(((data as any[]) || []).map((c) => ({ n_client: c.n_client, nom: c.societe || c.nom_usage || c.nom_contact || `Client #${c.n_client}` })));
    }, 250);
    return () => clearTimeout(t);
  }, [search, client]);

  async function loadClient(c: Client) {
    setClient(c);
    setHits([]);
    setSearch("");
    setLoading(true);
    setItems(null);
    const id = c.n_client;

    // Emplacements (id -> nom)
    const { data: empData } = await supabase.from("tbl_emplacements").select("id_emplacement, nom_emplacement").limit(5000);
    const empName = new Map<number, string>();
    (empData || []).forEach((e: any) => { if (e.nom_emplacement) empName.set(e.id_emplacement, e.nom_emplacement); });

    // Moteurs réservés par ce client, non expédiés
    const { data: mot } = await supabase
      .from("v_moteurs_dispo")
      .select("n_moteur, num_interne_moteur, nom_type_moteur, code_moteur, num_serie, compo_moteur")
      .eq("est_disponible", 1)
      .or(`resa_client_moteur.eq.${id}.0,resa_client_moteur.eq.${id}`)
      .limit(2000);
    const motRows = (mot as any[]) || [];
    const motIds = motRows.map((m) => m.n_moteur);

    // geloc + date_preparation (tolérant)
    const gel: Record<number, { empId: number | null; prepare: boolean }> = {};
    if (motIds.length) {
      const fetchMot = (withPrep: boolean) => supabase.from("tbl_moteurs").select(withPrep ? "n_moteur, geloc_mot, date_preparation" : "n_moteur, geloc_mot").in("n_moteur", motIds);
      let { data, error } = await fetchMot(true);
      if (error && String(error.message).includes("date_preparation")) { setMigMissing(true); ({ data, error } = await fetchMot(false)); }
      (((data as any[]) || [])).forEach((m) => { gel[m.n_moteur] = { empId: empIdFromGeloc(m.geloc_mot), prepare: !!m.date_preparation }; });
    }

    // Boîtes réservées par ce client
    const { data: bv } = await supabase
      .from("v_boites_dispo")
      .select("n_bv, num_interne_bv, ref_bv, type_bv, id_emplacement")
      .eq("est_disponible", 1)
      .or(`resa_client_bv.eq.${id}.0,resa_client_bv.eq.${id}`)
      .limit(2000);
    const bvRows = (bv as any[]) || [];
    const bvIds = bvRows.map((b) => b.n_bv);
    const bvPrep: Record<number, boolean> = {};
    if (bvIds.length) {
      const fetchBv = (withPrep: boolean) => supabase.from("tbl_boites").select(withPrep ? "n_bv, date_preparation" : "n_bv").in("n_bv", bvIds);
      let { data, error } = await fetchBv(true);
      if (error && String(error.message).includes("date_preparation")) { setMigMissing(true); ({ data, error } = await fetchBv(false)); }
      (((data as any[]) || [])).forEach((b) => { bvPrep[b.n_bv] = !!b.date_preparation; });
    }

    const list: Item[] = [
      ...motRows.map((m) => ({
        kind: "moteur" as const,
        id: m.n_moteur,
        interne: m.num_interne_moteur || String(m.n_moteur),
        type: m.nom_type_moteur || m.code_moteur || `Moteur ${m.n_moteur}`,
        serie: m.num_serie || "",
        compo: m.compo_moteur ?? null,
        emplacement: gel[m.n_moteur]?.empId != null ? empName.get(gel[m.n_moteur]!.empId!) || "" : "",
        prepare: gel[m.n_moteur]?.prepare ?? false,
      })),
      ...bvRows.map((b) => ({
        kind: "boite" as const,
        id: b.n_bv,
        interne: b.num_interne_bv || String(b.n_bv),
        type: b.ref_bv || (b.type_bv != null ? `Boîte type ${b.type_bv}` : `Boîte ${b.n_bv}`),
        serie: "",
        compo: null,
        emplacement: b.id_emplacement != null ? empName.get(b.id_emplacement) || "" : "",
        prepare: bvPrep[b.n_bv] ?? false,
      })),
    ].sort((a, b) => a.interne.localeCompare(b.interne, "fr", { numeric: true }));

    setItems(list);
    setLoading(false);
  }

  async function togglePrepare(it: Item) {
    const next = !it.prepare;
    const table = it.kind === "moteur" ? "tbl_moteurs" : "tbl_boites";
    const key = it.kind === "moteur" ? "n_moteur" : "n_bv";
    const { error } = await supabase.from(table).update({ date_preparation: next ? new Date().toISOString() : null }).eq(key, it.id);
    if (error) { setMigMissing(true); return; }
    setItems((prev) => (prev || []).map((x) => (x.kind === it.kind && x.id === it.id ? { ...x, prepare: next } : x)));
  }

  // Regroupement par composition (affichage), tri interne par n° interne déjà fait
  const groups = useMemo(() => {
    if (!items) return [];
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const k = it.kind === "boite" ? "Boîtes de vitesses" : compoLabel(it.compo) || "Moteurs";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    return [...map.entries()];
  }, [items]);

  const nbPrepares = items ? items.filter((i) => i.prepare).length : 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <PageHeader title="Bon de préparation" description="Liste des articles réservés d'un client à préparer — par composition et type, emplacement (ordre de rack), tri par n° interne." />
        {items && items.length > 0 && (
          <Button variant="outline" onClick={() => window.print()}>
            <Printer size={14} className="mr-1" /> Imprimer le bon
          </Button>
        )}
      </div>

      {migMissing && (
        <div className="mb-4 rounded-[14px] border border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.06)] px-4 py-3 text-sm text-amber-700 print:hidden">
          Suivi « préparé » indisponible : exécute <span className="font-mono">create_col_date_preparation.sql</span> dans Supabase. (La liste de préparation fonctionne déjà.)
        </div>
      )}

      {/* Sélecteur client */}
      <Card className="mb-4 print:hidden">
        <CardContent className="p-4">
          {client ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-text-dim">Client</p>
                <p className="font-semibold text-foreground">{client.nom}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setClient(null); setItems(null); }}>Changer</Button>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-text-dim">Client</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un client…" className="w-full rounded-lg border border-border bg-surface-alt py-2 pl-9 pr-3 text-sm text-foreground" />
              </div>
              {hits.length > 0 && (
                <div className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {hits.map((c) => (
                    <button key={c.n_client} onClick={() => loadClient(c)} className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-hover">{c.nom}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* En-tête impression */}
      {client && items && items.length > 0 && (
        <div className="mb-4 hidden border-b-2 border-foreground pb-3 print:block">
          <div className="flex items-end justify-between">
            <div>
              <p className="font-heading text-2xl font-bold text-foreground">MULTIREX AUTO</p>
              <p className="text-sm text-foreground">Bon de préparation</p>
            </div>
            <div className="text-right text-sm text-foreground">
              <p className="text-base font-bold">{client.nom}</p>
              <p>{new Date().toLocaleDateString("fr-FR")} · {items.length} article{items.length > 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-text-muted print:hidden">Chargement de la préparation…</div>
      ) : !client ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted print:hidden">Choisis un client pour générer son bon de préparation.</div>
      ) : items && items.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">Aucun article réservé pour ce client.</div>
      ) : items ? (
        <>
          <p className="mb-3 text-sm text-text-dim print:hidden">{items.length} article{items.length > 1 ? "s" : ""} à préparer · {nbPrepares} préparé{nbPrepares > 1 ? "s" : ""}.</p>
          {groups.map(([grp, list]) => (
            <div key={grp} className="mb-6">
              <h3 className="mb-2 font-semibold text-foreground">{grp} ({list.length})</h3>
              <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead className="bg-surface-alt text-xs uppercase text-text-dim">
                    <tr>
                      <th className="px-3 py-2 text-center print:hidden">Préparé</th>
                      <th className="px-3 py-2 text-left">N° interne</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">N° série</th>
                      <th className="px-3 py-2 text-left">Emplacement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {list.map((it) => (
                      <tr key={`${it.kind}-${it.id}`} className="transition-colors hover:bg-surface-hover">
                        <td className="px-3 py-2 text-center print:hidden">
                          <button onClick={() => togglePrepare(it)} title={it.prepare ? "Préparé" : "À préparer"}>
                            {it.prepare ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Circle size={16} className="text-text-muted" />}
                          </button>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-foreground">{it.interne}</td>
                        <td className="px-3 py-2 font-medium text-foreground">{it.type}</td>
                        <td className="px-3 py-2 font-mono text-xs text-text-muted">{it.serie || "—"}</td>
                        <td className="px-3 py-2 font-semibold text-brand">{it.emplacement || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
