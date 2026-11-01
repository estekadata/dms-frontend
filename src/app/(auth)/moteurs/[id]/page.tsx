"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Copy, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COMPOS = [
  { v: "", l: "—" },
  { v: "2", l: "Moteur seul" },
  { v: "1", l: "Moteur + BV" },
  { v: "16", l: "Moteur + BVA" },
  { v: "15", l: "Moteur + BV 4" },
];
const ETATS = [
  { v: "", l: "—" },
  { v: "4", l: "Tournant" },
  { v: "5", l: "Bloqué" },
  { v: "6", l: "Sans compressions" },
  { v: "7", l: "Bloc cassé" },
  { v: "9", l: "HS" },
];
const AFFECTS = [
  { v: "", l: "—" },
  { v: "1", l: "Exportation" },
  { v: "2", l: "Rénovation" },
  { v: "3", l: "Pièces (export)" },
  { v: "4", l: "Démontage" },
];

type Form = {
  num_serie: string;
  code_moteur: string;
  n_type_moteur: string;
  typeNom: string;
  compo_moteur: string;
  etat_moteur: string;
  n_affectation: string;
  prix_achat_moteur: string;
  observations: string;
  num_reception: string;
};

const EMPTY: Form = { num_serie: "", code_moteur: "", n_type_moteur: "", typeNom: "", compo_moteur: "", etat_moteur: "", n_affectation: "", prix_achat_moteur: "", observations: "", num_reception: "" };

export default function MoteurEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const id = Number(idStr);
  const router = useRouter();

  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // Type picker
  const [typeSearch, setTypeSearch] = useState("");
  const [typeHits, setTypeHits] = useState<{ n: number; nom: string }[]>([]);

  useEffect(() => {
    if (!Number.isFinite(id)) { setNotFound(true); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tbl_moteurs")
        .select("n_moteur, num_serie, code_moteur, n_type_moteur, compo_moteur, etat_moteur, n_affectation, prix_achat_moteur, observations, num_reception")
        .eq("n_moteur", id)
        .maybeSingle();
      if (cancelled) return;
      if (!data) { setNotFound(true); setLoading(false); return; }
      const m = data as any;
      let typeNom = "";
      if (m.n_type_moteur != null) {
        const { data: tp } = await supabase.from("tbl_types_moteurs").select("nom_type_moteur").eq("n_type_moteur", m.n_type_moteur).maybeSingle();
        typeNom = (tp as any)?.nom_type_moteur || "";
      }
      if (cancelled) return;
      setForm({
        num_serie: m.num_serie || "",
        code_moteur: m.code_moteur || "",
        n_type_moteur: m.n_type_moteur != null ? String(m.n_type_moteur) : "",
        typeNom,
        compo_moteur: m.compo_moteur != null ? String(m.compo_moteur) : "",
        etat_moteur: m.etat_moteur != null ? String(m.etat_moteur) : "",
        n_affectation: m.n_affectation != null ? String(m.n_affectation) : "",
        prix_achat_moteur: m.prix_achat_moteur != null ? String(m.prix_achat_moteur) : "",
        observations: m.observations || "",
        num_reception: m.num_reception != null ? String(m.num_reception) : "",
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    const q = typeSearch.trim();
    if (!q) { setTypeHits([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("tbl_types_moteurs").select("n_type_moteur, nom_type_moteur").ilike("nom_type_moteur", `%${q}%`).order("nom_type_moteur").limit(15);
      setTypeHits(((data as any[]) || []).map((x) => ({ n: x.n_type_moteur, nom: x.nom_type_moteur || `Type ${x.n_type_moteur}` })));
    }, 250);
    return () => clearTimeout(t);
  }, [typeSearch]);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function payload() {
    return {
      num_serie: form.num_serie.trim() || null,
      code_moteur: form.code_moteur.trim().toUpperCase() || null,
      n_type_moteur: form.n_type_moteur ? Number(form.n_type_moteur) : null,
      compo_moteur: form.compo_moteur ? Number(form.compo_moteur) : null,
      etat_moteur: form.etat_moteur ? Number(form.etat_moteur) : null,
      n_affectation: form.n_affectation ? Number(form.n_affectation) : null,
      prix_achat_moteur: form.prix_achat_moteur ? parseFloat(form.prix_achat_moteur.replace(",", ".")) : null,
      observations: form.observations.trim() || null,
      num_reception: form.num_reception ? Number(form.num_reception) : null,
      date_modif: new Date().toISOString(),
    };
  }

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("tbl_moteurs").update(payload()).eq("n_moteur", id);
    setBusy(false);
    if (error) { setFlash(`Erreur : ${error.message}`); return; }
    setFlash("Moteur enregistré ✓");
    setTimeout(() => setFlash(null), 2500);
  }

  async function dupliquer() {
    setBusy(true);
    const { data: maxM } = await supabase.from("tbl_moteurs").select("n_moteur").order("n_moteur", { ascending: false }).limit(1);
    const newId = (((maxM || [])[0] as any)?.n_moteur || 0) + 1;
    const { error } = await supabase.from("tbl_moteurs").insert({ n_moteur: newId, ...payload(), num_serie: null });
    setBusy(false);
    if (error) { setFlash(`Duplication échouée : ${error.message}`); return; }
    router.push(`/moteurs/${newId}`);
  }

  if (loading) return <div className="py-16 text-center text-text-muted">Chargement du moteur…</div>;
  if (notFound) return (
    <div>
      <Link href="/moteurs" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground"><ArrowLeft size={14} /> Retour aux moteurs</Link>
      <div className="rounded-[14px] border border-border bg-surface p-10 text-center"><p className="font-semibold text-foreground">Moteur introuvable</p></div>
    </div>
  );

  return (
    <div>
      <Link href="/moteurs" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground"><ArrowLeft size={14} /> Retour aux moteurs</Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PageHeader title={`Moteur n° ${id}`} description="Modifier la fiche du moteur, ou en ajouter un identique (dupliquer)." showBack={false} />
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={dupliquer} disabled={busy}><Copy size={14} className="mr-1" /> Dupliquer</Button>
          <Button onClick={save} disabled={busy} className="bg-brand text-white hover:bg-brand/80"><Save size={14} className="mr-1" /> {busy ? "…" : "Enregistrer"}</Button>
        </div>
      </div>

      {flash && <div className="mb-4 rounded-lg bg-surface-alt px-3 py-2 text-sm text-text-dim">{flash}</div>}

      <Card className="mb-4">
        <CardContent className="space-y-4 p-5">
          {/* Type */}
          <div>
            <Label className="text-text-dim">Type de moteur</Label>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-lg bg-brand-soft px-3 py-2 text-sm font-medium text-foreground">{form.typeNom || (form.n_type_moteur ? `Type ${form.n_type_moteur}` : "— non défini")}</span>
            </div>
            <div className="relative mt-2 max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input value={typeSearch} onChange={(e) => setTypeSearch(e.target.value)} placeholder="Changer le type (rechercher)…" className="w-full rounded-lg border border-border bg-surface-alt py-2 pl-9 pr-3 text-sm text-foreground" />
              {typeHits.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-48 w-full divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface">
                  {typeHits.map((h) => (
                    <button key={h.n} onClick={() => { set("n_type_moteur", String(h.n)); set("typeNom", h.nom); setTypeSearch(""); setTypeHits([]); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-hover">{h.nom}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div><Label className="text-text-dim">N° de série</Label><Input value={form.num_serie} onChange={(e) => set("num_serie", e.target.value)} className="mt-1 border-border bg-surface-alt" /></div>
            <div><Label className="text-text-dim">Code moteur</Label><Input value={form.code_moteur} onChange={(e) => set("code_moteur", e.target.value)} className="mt-1 border-border bg-surface-alt font-mono uppercase" /></div>
            <div><Label className="text-text-dim">Composition</Label><select value={form.compo_moteur} onChange={(e) => set("compo_moteur", e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground">{COMPOS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
            <div><Label className="text-text-dim">État mécanique</Label><select value={form.etat_moteur} onChange={(e) => set("etat_moteur", e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground">{ETATS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
            <div><Label className="text-text-dim">Affectation</Label><select value={form.n_affectation} onChange={(e) => set("n_affectation", e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground">{AFFECTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
            <div><Label className="text-text-dim">Prix d&apos;achat (€)</Label><Input type="number" step="0.01" value={form.prix_achat_moteur} onChange={(e) => set("prix_achat_moteur", e.target.value)} className="mt-1 border-border bg-surface-alt" /></div>
            <div><Label className="text-text-dim">N° de réception</Label><Input type="number" value={form.num_reception} onChange={(e) => set("num_reception", e.target.value)} className="mt-1 border-border bg-surface-alt" /></div>
          </div>
          <div><Label className="text-text-dim">Observations</Label><textarea value={form.observations} onChange={(e) => set("observations", e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground" /></div>
        </CardContent>
      </Card>

      <p className="text-xs text-text-muted">
        « Dupliquer » crée un nouveau moteur identique (sans n° de série) et ouvre sa fiche pour compléter. Les moteurs ajoutés dans l&apos;appli sont préservés par la synchro ; la modification d&apos;un moteur déjà présent dans Access peut être réécrite au prochain import.
      </p>
    </div>
  );
}
