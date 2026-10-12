"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MapPin, Search, CheckCircle2, Circle, LayoutGrid } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Mode = "serie" | "type" | "emplacement";
type Mot = {
  n_moteur: number;
  interne: string | null;
  type: string;
  serie: string | null;
  marque: string | null;
  geloc_mot: string | null;
  geoloc_valide: boolean;
};

function empIdFromGeloc(g: string | null): number | null {
  if (!g) return null;
  const n = parseFloat(String(g));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function GeolocalisationInner() {
  const sp = useSearchParams();
  const [mode, setMode] = useState<Mode>("serie");
  const [q, setQ] = useState("");
  const [empReady, setEmpReady] = useState(false);
  const [rows, setRows] = useState<Mot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [migMissing, setMigMissing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // Référentiel des emplacements (id <-> nom)
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
      runSearch("emplacement", emp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empReady]);

  async function runSearch(searchMode: Mode = mode, rawTerm?: string) {
    const term = (rawTerm ?? q).trim();
    if (!term) return;
    setLoading(true);
    setRows(null);

    // 1. Candidats + affichage (noms de type lisibles via v_moteurs_dispo)
    const DISP = "n_moteur, num_interne_moteur, nom_type_moteur, code_moteur, num_serie, marque";
    let dispRows: any[] = [];
    if (searchMode === "serie" || searchMode === "type") {
      let dq = supabase.from("v_moteurs_dispo").select(DISP).eq("est_disponible", 1).limit(300);
      if (searchMode === "serie") dq = dq.ilike("num_serie", `%${term}%`);
      else dq = dq.or(`nom_type_moteur.ilike.%${term}%,code_moteur.ilike.%${term}%`);
      const { data } = await dq;
      dispRows = (data as any[]) || [];
    } else {
      const id = nameToId.get(term.toUpperCase());
      if (id == null) { setRows([]); setLoading(false); return; }
      const { data: mot } = await supabase
        .from("tbl_moteurs")
        .select("n_moteur")
        .is("n_expedition", null)
        .or(`geloc_mot.eq.${id}.0,geloc_mot.eq.${id}`)
        .limit(300);
      const ids = ((mot as any[]) || []).map((x) => x.n_moteur);
      if (!ids.length) { setRows([]); setLoading(false); return; }
      const { data } = await supabase.from("v_moteurs_dispo").select(DISP).in("n_moteur", ids);
      dispRows = (data as any[]) || [];
    }

    const ids = dispRows.map((r) => r.n_moteur);
    // 2. Emplacement + validation depuis tbl_moteurs (tolérant si colonne absente)
    const geloc: Record<number, { geloc_mot: string | null; geoloc_valide: boolean }> = {};
    if (ids.length) {
      const fetchGeloc = (withV: boolean) =>
        supabase.from("tbl_moteurs").select(withV ? "n_moteur, geloc_mot, geoloc_valide" : "n_moteur, geloc_mot").in("n_moteur", ids);
      let { data, error } = await fetchGeloc(true);
      if (error && String(error.message).includes("geoloc_valide")) {
        setMigMissing(true);
        ({ data, error } = await fetchGeloc(false));
      }
      (((data as any[]) || [])).forEach((m) => {
        geloc[m.n_moteur] = { geloc_mot: m.geloc_mot, geoloc_valide: !!m.geoloc_valide };
      });
    }

    const list: Mot[] = dispRows.map((r) => ({
      n_moteur: r.n_moteur,
      interne: r.num_interne_moteur,
      type: r.nom_type_moteur || r.code_moteur || `Moteur ${r.n_moteur}`,
      serie: r.num_serie,
      marque: r.marque,
      geloc_mot: geloc[r.n_moteur]?.geloc_mot ?? null,
      geoloc_valide: geloc[r.n_moteur]?.geoloc_valide ?? false,
    }));
    setRows(list);
    setLoading(false);
  }

  async function assignEmplacement(m: Mot, rawName: string) {
    const name = rawName.trim().toUpperCase();
    if (name === (m.geloc_mot ? (idToName.get(empIdFromGeloc(m.geloc_mot)!) || "").toUpperCase() : "")) return;
    let id = name ? nameToId.get(name) : undefined;
    if (name && id == null) {
      // Créer l'emplacement (non figé : nouveaux emplacements possibles)
      const { data: maxE } = await supabase.from("tbl_emplacements").select("id_emplacement").order("id_emplacement", { ascending: false }).limit(1);
      const nextId = (((maxE || [])[0] as any)?.id_emplacement || 0) + 1;
      const { error: eErr } = await supabase.from("tbl_emplacements").insert({ id_emplacement: nextId, nom_emplacement: name, selection_emplacement: false });
      if (eErr) { setFlash(`Création emplacement KO : ${eErr.message}`); return; }
      id = nextId;
      setIdToName((prev) => new Map(prev).set(nextId, name));
      setNameToId((prev) => new Map(prev).set(name, nextId));
      setEmpNames((prev) => [...prev, name].sort((a, b) => a.localeCompare(b, "fr", { numeric: true })));
    }
    const patch: Record<string, unknown> = { geloc_mot: name && id != null ? String(id) : null, geoloc_date: new Date().toISOString() };
    const { error } = await supabase.from("tbl_moteurs").update(patch).eq("n_moteur", m.n_moteur);
    if (error) { setFlash(`Enregistrement KO : ${error.message}`); return; }
    setRows((prev) => (prev || []).map((r) => (r.n_moteur === m.n_moteur ? { ...r, geloc_mot: name && id != null ? String(id) : null } : r)));
    setFlash(`Emplacement du moteur ${m.interne || m.n_moteur} → ${name || "—"}`);
    setTimeout(() => setFlash(null), 2500);
  }

  async function toggleValide(m: Mot) {
    const next = !m.geoloc_valide;
    const { error } = await supabase.from("tbl_moteurs").update({ geoloc_valide: next, geoloc_date: new Date().toISOString() }).eq("n_moteur", m.n_moteur);
    if (error) { setMigMissing(true); return; }
    setRows((prev) => (prev || []).map((r) => (r.n_moteur === m.n_moteur ? { ...r, geoloc_valide: next } : r)));
  }

  const occupe = useMemo(() => {
    if (mode !== "emplacement" || !rows) return null;
    return rows.length;
  }, [mode, rows]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Géolocalisation" description="Emplacement physique (chiffre + lettre) des moteurs : recherche, assignation, validation." />
        <Link href="/geolocalisation/rangement">
          <Button variant="outline"><LayoutGrid size={14} className="mr-1" /> Outil de rangement</Button>
        </Link>
      </div>

      {migMissing && (
        <div className="mb-4 rounded-[14px] border border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.06)] px-4 py-3 text-sm text-amber-700">
          Validation d&apos;emplacement indisponible : exécute <span className="font-mono">create_col_geoloc_valide.sql</span> dans Supabase. (La recherche et l&apos;assignation fonctionnent déjà.)
        </div>
      )}

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase text-text-dim">Rechercher par</span>
            {([["serie", "N° de série"], ["type", "Type / code"], ["emplacement", "Emplacement"]] as [Mode, string][]).map(([v, l]) => (
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
                placeholder={mode === "serie" ? "Numéro de série…" : mode === "type" ? "Type ou code moteur…" : "Emplacement (ex. B72)…"}
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
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">Aucun moteur trouvé.</div>
      ) : (
        <>
          <p className="mb-2 text-sm text-text-dim">
            {rows.length} moteur{rows.length > 1 ? "s" : ""}{occupe != null ? ` à cet emplacement` : ""}{rows.length >= 300 ? " (300 max)" : ""}
          </p>
          <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt text-xs uppercase text-text-dim">
                  <tr>
                    <th className="px-3 py-3 text-left">N° interne</th>
                    <th className="px-3 py-3 text-left">Type</th>
                    <th className="px-3 py-3 text-left">N° série</th>
                    <th className="px-3 py-3 text-left">Marque</th>
                    <th className="px-3 py-3 text-left">Emplacement</th>
                    <th className="px-3 py-3 text-center">Validé</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((m) => {
                    const curName = m.geloc_mot ? idToName.get(empIdFromGeloc(m.geloc_mot)!) || "" : "";
                    return (
                      <tr key={m.n_moteur} className="transition-colors hover:bg-surface-hover">
                        <td className="px-3 py-2 font-mono text-xs text-text-dim">{m.interne || m.n_moteur}</td>
                        <td className="px-3 py-2 font-medium text-foreground">{m.type}</td>
                        <td className="px-3 py-2 font-mono text-xs text-text-muted">{m.serie || "—"}</td>
                        <td className="px-3 py-2 text-text-dim">{m.marque || "—"}</td>
                        <td className="px-3 py-2">
                          <div className="inline-flex items-center gap-1.5">
                            <MapPin size={13} className="text-text-muted" />
                            <input
                              list="emp-list-assign"
                              defaultValue={curName}
                              placeholder="—"
                              onBlur={(e) => assignEmplacement(m, e.target.value)}
                              className="w-28 rounded border border-border bg-surface-alt px-2 py-1 text-sm uppercase text-foreground"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => toggleValide(m)} title={m.geoloc_valide ? "Validé — cliquer pour invalider" : "Non validé — cliquer pour valider"}>
                            {m.geoloc_valide ? (
                              <Badge className="border border-[rgba(52,211,153,0.20)] bg-[rgba(52,211,153,0.10)] text-emerald-600"><CheckCircle2 size={11} className="mr-1" /> Validé</Badge>
                            ) : (
                              <Badge className="border border-border bg-surface-alt text-text-muted"><Circle size={11} className="mr-1" /> À valider</Badge>
                            )}
                          </button>
                        </td>
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
