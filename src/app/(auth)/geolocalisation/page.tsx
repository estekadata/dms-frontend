"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MapPin, Search, CheckCircle2, Circle, LayoutGrid, Cog, Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Article = "moteurs" | "boites";
type Mode = "serie" | "type" | "emplacement";
type Art = {
  id: number; // n_moteur ou n_bv
  interne: string | null;
  type: string;
  serie: string | null;
  marque: string | null;
  empId: number | null;
  valide: boolean;
};

function empIdFromGeloc(g: string | null): number | null {
  if (g == null || g === "") return null;
  const n = parseFloat(String(g));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function GeolocalisationInner() {
  const sp = useSearchParams();
  const [article, setArticle] = useState<Article>("moteurs");
  const [mode, setMode] = useState<Mode>("serie");
  const [q, setQ] = useState("");
  const [empReady, setEmpReady] = useState(false);
  const [rows, setRows] = useState<Art[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [migMissing, setMigMissing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const [idToName, setIdToName] = useState<Map<number, string>>(new Map());
  const [nameToId, setNameToId] = useState<Map<string, number>>(new Map());
  const [empNames, setEmpNames] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("tbl_emplacements").select("id_emplacement, nom_emplacement").limit(5000);
      const i2n = new Map<number, string>();
      const n2i = new Map<string, number>();
      (data || []).forEach((e: any) => {
        if (e.nom_emplacement) {
          i2n.set(e.id_emplacement, e.nom_emplacement);
          n2i.set(String(e.nom_emplacement).toUpperCase(), e.id_emplacement);
        }
      });
      setIdToName(i2n);
      setNameToId(n2i);
      setEmpNames([...i2n.values()].sort((a, b) => a.localeCompare(b, "fr", { numeric: true })));
      setEmpReady(true);
    })();
  }, []);

  // Arrivée depuis l'outil de rangement (?emp=F104) → recherche auto par emplacement
  useEffect(() => {
    const emp = sp.get("emp");
    if (emp && empReady) {
      setMode("emplacement");
      setQ(emp);
      runSearch("moteurs", "emplacement", emp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empReady]);

  function switchArticle(a: Article) {
    setArticle(a);
    setRows(null);
    if (a === "boites" && mode === "type") setMode("serie");
  }

  async function runSearch(art: Article = article, searchMode: Mode = mode, rawTerm?: string) {
    const term = (rawTerm ?? q).trim();
    if (!term) return;
    setLoading(true);
    setRows(null);

    let list: Art[] = [];

    if (art === "moteurs") {
      const DISP = "n_moteur, num_interne_moteur, nom_type_moteur, code_moteur, num_serie, marque";
      let dispRows: any[] = [];
      if (searchMode === "serie" || searchMode === "type") {
        let dq = supabase.from("v_moteurs_dispo").select(DISP).eq("est_disponible", 1).limit(300);
        if (searchMode === "serie") dq = dq.ilike("num_serie", `%${term}%`);
        else dq = dq.or(`nom_type_moteur.ilike.%${term}%,code_moteur.ilike.%${term}%`);
        dispRows = ((await dq).data as any[]) || [];
      } else {
        const id = nameToId.get(term.toUpperCase());
        if (id == null) { setRows([]); setLoading(false); return; }
        const { data: mot } = await supabase.from("tbl_moteurs").select("n_moteur").is("n_expedition", null).or(`geloc_mot.eq.${id}.0,geloc_mot.eq.${id}`).limit(300);
        const ids = ((mot as any[]) || []).map((x) => x.n_moteur);
        if (!ids.length) { setRows([]); setLoading(false); return; }
        dispRows = ((await supabase.from("v_moteurs_dispo").select(DISP).in("n_moteur", ids)).data as any[]) || [];
      }
      const ids = dispRows.map((r) => r.n_moteur);
      const geloc: Record<number, { empId: number | null; valide: boolean }> = {};
      if (ids.length) {
        const fetchGeloc = (withV: boolean) => supabase.from("tbl_moteurs").select(withV ? "n_moteur, geloc_mot, geoloc_valide" : "n_moteur, geloc_mot").in("n_moteur", ids);
        let { data, error } = await fetchGeloc(true);
        if (error && String(error.message).includes("geoloc_valide")) { setMigMissing(true); ({ data, error } = await fetchGeloc(false)); }
        (((data as any[]) || [])).forEach((m) => { geloc[m.n_moteur] = { empId: empIdFromGeloc(m.geloc_mot), valide: !!m.geoloc_valide }; });
      }
      list = dispRows.map((r) => ({
        id: r.n_moteur,
        interne: r.num_interne_moteur,
        type: r.nom_type_moteur || r.code_moteur || `Moteur ${r.n_moteur}`,
        serie: r.num_serie,
        marque: r.marque,
        empId: geloc[r.n_moteur]?.empId ?? null,
        valide: geloc[r.n_moteur]?.valide ?? false,
      }));
    } else {
      // Boîtes
      let bq = supabase.from("v_boites_dispo").select("n_bv, num_interne_bv, type_bv, ref_bv, num_interne_moteur, id_emplacement").eq("est_disponible", 1).limit(300);
      if (searchMode === "emplacement") {
        const id = nameToId.get(term.toUpperCase());
        if (id == null) { setRows([]); setLoading(false); return; }
        bq = bq.eq("id_emplacement", id);
      } else {
        bq = bq.or(`ref_bv.ilike.%${term}%,num_interne_bv.ilike.%${term}%`);
      }
      const data = ((await bq).data as any[]) || [];
      list = data.map((b) => ({
        id: b.n_bv,
        interne: b.num_interne_bv,
        type: b.ref_bv || (b.type_bv != null ? `Type ${b.type_bv}` : `Boîte ${b.n_bv}`),
        serie: b.num_interne_moteur ? `Moteur ${b.num_interne_moteur}` : null,
        marque: null,
        empId: b.id_emplacement ?? null,
        valide: false,
      }));
    }

    setRows(list);
    setLoading(false);
  }

  async function assignEmplacement(a: Art, rawName: string) {
    const name = rawName.trim().toUpperCase();
    const curName = a.empId != null ? (idToName.get(a.empId) || "").toUpperCase() : "";
    if (name === curName) return;
    let id = name ? nameToId.get(name) : undefined;
    if (name && id == null) {
      const { data: maxE } = await supabase.from("tbl_emplacements").select("id_emplacement").order("id_emplacement", { ascending: false }).limit(1);
      const nextId = (((maxE || [])[0] as any)?.id_emplacement || 0) + 1;
      const { error: eErr } = await supabase.from("tbl_emplacements").insert({ id_emplacement: nextId, nom_emplacement: name, selection_emplacement: false });
      if (eErr) { setFlash(`Création emplacement KO : ${eErr.message}`); return; }
      id = nextId;
      setIdToName((prev) => new Map(prev).set(nextId, name));
      setNameToId((prev) => new Map(prev).set(name, nextId));
      setEmpNames((prev) => [...prev, name].sort((x, y) => x.localeCompare(y, "fr", { numeric: true })));
    }
    const newEmpId = name && id != null ? id : null;
    let error;
    if (article === "moteurs") {
      ({ error } = await supabase.from("tbl_moteurs").update({ geloc_mot: newEmpId != null ? String(newEmpId) : null, geoloc_date: new Date().toISOString() }).eq("n_moteur", a.id));
    } else {
      ({ error } = await supabase.from("tbl_boites").update({ id_emplacement: newEmpId }).eq("n_bv", a.id));
    }
    if (error) { setFlash(`Enregistrement KO : ${error.message}`); return; }
    setRows((prev) => (prev || []).map((r) => (r.id === a.id ? { ...r, empId: newEmpId } : r)));
    setFlash(`Emplacement ${article === "moteurs" ? "du moteur" : "de la boîte"} ${a.interne || a.id} → ${name || "—"}`);
    setTimeout(() => setFlash(null), 2500);
  }

  async function toggleValide(a: Art) {
    const next = !a.valide;
    const { error } = await supabase.from("tbl_moteurs").update({ geoloc_valide: next, geoloc_date: new Date().toISOString() }).eq("n_moteur", a.id);
    if (error) { setMigMissing(true); return; }
    setRows((prev) => (prev || []).map((r) => (r.id === a.id ? { ...r, valide: next } : r)));
  }

  const modes: [Mode, string][] = article === "moteurs"
    ? [["serie", "N° de série"], ["type", "Type / code"], ["emplacement", "Emplacement"]]
    : [["serie", "Réf / n° interne"], ["emplacement", "Emplacement"]];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Géolocalisation" description="Emplacement physique (chiffre + lettre) des articles : recherche, assignation, validation." />
        <Link href="/geolocalisation/rangement">
          <Button variant="outline"><LayoutGrid size={14} className="mr-1" /> Outil de rangement</Button>
        </Link>
      </div>

      {migMissing && (
        <div className="mb-4 rounded-[14px] border border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.06)] px-4 py-3 text-sm text-amber-700">
          Validation d&apos;emplacement indisponible : exécute <span className="font-mono">create_col_geoloc_valide.sql</span> dans Supabase. (Recherche et assignation fonctionnent déjà.)
        </div>
      )}

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase text-text-dim">Articles</span>
            <div className="flex overflow-hidden rounded-lg border border-border bg-surface-alt">
              {([["moteurs", "Moteurs", Cog], ["boites", "Boîtes", Package]] as const).map(([v, l, Icon]) => (
                <button key={v} onClick={() => switchArticle(v)} className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all ${article === v ? "bg-brand text-white" : "text-text-dim hover:bg-surface-hover"}`}>
                  <Icon size={14} /> {l}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase text-text-dim">Rechercher par</span>
            {modes.map(([v, l]) => (
              <button key={v} onClick={() => { setMode(v); setRows(null); }} className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${mode === v ? "bg-brand text-white" : "bg-surface-alt text-text-dim hover:bg-surface-hover"}`}>{l}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input
                list={mode === "emplacement" ? "emp-all" : undefined}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder={mode === "emplacement" ? "Emplacement (ex. B72)…" : article === "moteurs" ? (mode === "serie" ? "Numéro de série…" : "Type ou code moteur…") : "Réf. ou n° interne boîte…"}
                className="border-border bg-surface-alt pl-9"
              />
              <datalist id="emp-all">{empNames.map((n) => <option key={n} value={n} />)}</datalist>
            </div>
            <Button onClick={() => runSearch()} disabled={loading} className="bg-brand text-white hover:bg-brand/80">
              <Search size={14} className="mr-1" /> {loading ? "Recherche…" : "Rechercher"}
            </Button>
          </div>
          <datalist id="emp-list-assign">{empNames.map((n) => <option key={n} value={n} />)}</datalist>
        </CardContent>
      </Card>

      {flash && <div className="mb-4 rounded-lg bg-[rgba(52,211,153,0.10)] px-3 py-2 text-sm text-emerald-700">{flash}</div>}

      {rows === null ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">
          Choisis un critère et lance une recherche. En stock uniquement.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">Aucun article trouvé.</div>
      ) : (
        <>
          <p className="mb-2 text-sm text-text-dim">{rows.length} {article === "moteurs" ? "moteur" : "boîte"}{rows.length > 1 ? "s" : ""}{rows.length >= 300 ? " (300 max)" : ""}</p>
          <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt text-xs uppercase text-text-dim">
                  <tr>
                    <th className="px-3 py-3 text-left">N° interne</th>
                    <th className="px-3 py-3 text-left">{article === "moteurs" ? "Type" : "Réf / type"}</th>
                    <th className="px-3 py-3 text-left">{article === "moteurs" ? "N° série" : "Moteur"}</th>
                    <th className="px-3 py-3 text-left">Emplacement</th>
                    {article === "moteurs" && <th className="px-3 py-3 text-center">Validé</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((a) => {
                    const curName = a.empId != null ? idToName.get(a.empId) || "" : "";
                    return (
                      <tr key={a.id} className="transition-colors hover:bg-surface-hover">
                        <td className="px-3 py-2 font-mono text-xs text-text-dim">{a.interne || a.id}</td>
                        <td className="px-3 py-2 font-medium text-foreground">{a.type}</td>
                        <td className="px-3 py-2 font-mono text-xs text-text-muted">{a.serie || "—"}</td>
                        <td className="px-3 py-2">
                          <div className="inline-flex items-center gap-1.5">
                            <MapPin size={13} className="text-text-muted" />
                            <input
                              list="emp-list-assign"
                              defaultValue={curName}
                              placeholder="—"
                              onBlur={(e) => assignEmplacement(a, e.target.value)}
                              className="w-28 rounded border border-border bg-surface-alt px-2 py-1 text-sm uppercase text-foreground"
                            />
                          </div>
                        </td>
                        {article === "moteurs" && (
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => toggleValide(a)} title={a.valide ? "Validé — cliquer pour invalider" : "Non validé — cliquer pour valider"}>
                              {a.valide ? (
                                <Badge className="border border-[rgba(52,211,153,0.20)] bg-[rgba(52,211,153,0.10)] text-emerald-600"><CheckCircle2 size={11} className="mr-1" /> Validé</Badge>
                              ) : (
                                <Badge className="border border-border bg-surface-alt text-text-muted"><Circle size={11} className="mr-1" /> À valider</Badge>
                              )}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function GeolocalisationPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-text-muted">Chargement…</div>}>
      <GeolocalisationInner />
    </Suspense>
  );
}
