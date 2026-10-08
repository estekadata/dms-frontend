"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Download, Save, Play, Trash2, FileSpreadsheet } from "lucide-react";
import { exportXlsx } from "@/lib/export";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { compoLabel, etatMoteurLabel, affectationLabel } from "@/components/moteur-statuts";

const LIMIT = 2000; // liste détaillée
const GROUP_MAX = 200000; // garde-fou agrégation

type ColKind = "price" | "compo" | "etat" | "affect" | "statut" | "date" | "text";
type Col = { key: string; label: string; kind?: ColKind };

// Colonnes proposées (toutes issues de v_moteurs_dispo sauf "statut", dérivé).
const COLUMNS: Col[] = [
  { key: "n_moteur", label: "N°" },
  { key: "num_interne_moteur", label: "N° interne (RAC)" },
  { key: "nom_type_moteur", label: "Type moteur" },
  { key: "code_moteur", label: "Code" },
  { key: "num_serie", label: "N° série" },
  { key: "marque", label: "Marque" },
  { key: "energie", label: "Énergie" },
  { key: "modele_saisi", label: "Modèle" },
  { key: "prix_achat_moteur", label: "Prix achat", kind: "price" },
  { key: "compo_moteur", label: "Composition", kind: "compo" },
  { key: "etat_moteur", label: "État méca.", kind: "etat" },
  { key: "n_affectation", label: "Affectation", kind: "affect" },
  { key: "statut", label: "Statut", kind: "statut" },
  { key: "date_entree_stock", label: "Entrée stock", kind: "date" },
  { key: "observations", label: "Observations" },
];
const COL_BY_KEY = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));
const DEFAULT_COLS = ["nom_type_moteur", "num_serie", "marque", "energie", "statut", "prix_achat_moteur"];

const ENERGIES = [
  { label: "Toutes", stem: "" },
  { label: "Diesel", stem: "diesel" },
  { label: "Essence", stem: "essence" },
  { label: "Électrique", stem: "electr" },
];
const STATUTS = ["Tous", "Disponible", "Réservé", "Vendu/Archivé"];
const AFFECTS = [
  { v: "", l: "Toutes" },
  { v: "1", l: "Exportation" },
  { v: "2", l: "Rénovation" },
  { v: "3", l: "Pièces (export)" },
  { v: "4", l: "Démontage" },
];
const ETATS = [
  { v: "", l: "Tous" },
  { v: "4", l: "Tournant" },
  { v: "5", l: "Bloqué" },
  { v: "6", l: "Sans compressions" },
  { v: "7", l: "Bloc cassé" },
  { v: "9", l: "HS" },
];
const COMPOS = [
  { v: "", l: "Toutes" },
  { v: "2", l: "Moteur seul" },
  { v: "1", l: "Moteur + BV" },
  { v: "16", l: "Moteur + BVA" },
  { v: "15", l: "Moteur + BV 4" },
];

function deriveStatut(r: any): string {
  if (r.archiver) return "Archivé";
  if (r.est_disponible === 0) return "Vendu";
  if ((r.resa_client_moteur || "").trim()) return "Réservé";
  return "Disponible";
}

// Champs de regroupement (clé → libellé + fonction de valeur de groupe)
const GROUP_FIELDS: { key: string; label: string; get: (r: any) => string }[] = [
  { key: "marque", label: "Marque", get: (r) => r.marque || "—" },
  { key: "energie", label: "Énergie", get: (r) => r.energie || "—" },
  { key: "n_affectation", label: "Affectation", get: (r) => affectationLabel(r.n_affectation) || "—" },
  { key: "statut", label: "Statut", get: (r) => deriveStatut(r) },
  { key: "compo_moteur", label: "Composition", get: (r) => compoLabel(r.compo_moteur) || "—" },
  { key: "etat_moteur", label: "État méca.", get: (r) => etatMoteurLabel(r.etat_moteur) || "—" },
  { key: "nom_type_moteur", label: "Type moteur", get: (r) => r.nom_type_moteur || "—" },
  { key: "mois", label: "Mois d'entrée", get: (r) => (r.date_entree_stock ? String(r.date_entree_stock).slice(0, 7) : "—") },
];
const GROUP_BY_KEY = Object.fromEntries(GROUP_FIELDS.map((g) => [g.key, g]));

function fmtEur(v: number) {
  return `${Math.round(v).toLocaleString("fr-FR")} €`;
}

function cellValue(r: any, col: Col): string {
  if (col.kind === "statut") return deriveStatut(r);
  const v = r[col.key];
  if (v == null || v === "") return "—";
  switch (col.kind) {
    case "price":
      return `${Math.round(v).toLocaleString("fr-FR")} €`;
    case "compo":
      return compoLabel(v) || String(v);
    case "etat":
      return etatMoteurLabel(v) || String(v);
    case "affect":
      return affectationLabel(v) || String(v);
    case "date":
      return new Date(v).toLocaleDateString("fr-FR");
    default:
      return String(v);
  }
}

type Filters = { terme: string; marque: string; energie: string; statut: string; affectation: string; etat: string; compo: string };
const EMPTY_FILTERS: Filters = { terme: "", marque: "", energie: "", statut: "Tous", affectation: "", etat: "", compo: "" };

type GroupRow = { val: string; count: number; sum: number; avg: number; withPrice: number };
type Mode = "liste" | "regroupe";
type SavedEtat = {
  id: number;
  nom: string;
  config: { columns: string[]; filters: Filters; sortKey: string; sortDir: "asc" | "desc"; mode?: Mode; groupBy?: string };
};

export default function ConstructeurEtatPage() {
  const [selectedCols, setSelectedCols] = useState<string[]>(DEFAULT_COLS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<string>("nom_type_moteur");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [mode, setMode] = useState<Mode>("liste");
  const [groupBy, setGroupBy] = useState<string>("marque");
  const [rows, setRows] = useState<any[] | null>(null);
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [saved, setSaved] = useState<SavedEtat[]>([]);
  const [savedError, setSavedError] = useState(false);

  const loadSaved = useCallback(async () => {
    const { data, error } = await supabase
      .from("tbl_etats_perso")
      .select("id, nom, config")
      .eq("source", "moteurs")
      .order("date_creation", { ascending: false })
      .limit(100);
    if (error) {
      setSavedError(true);
      return;
    }
    setSavedError(false);
    setSaved((data as SavedEtat[]) || []);
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  function toggleCol(key: string) {
    setSelectedCols((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  // Applique les filtres courants à une requête v_moteurs_dispo
  function applyFilters(q: any): any {
    const f = filters;
    if (f.terme.trim()) {
      const t = f.terme.trim();
      q = q.or(`nom_type_moteur.ilike.%${t}%,code_moteur.ilike.%${t}%,num_serie.ilike.%${t}%,marque.ilike.%${t}%`);
    }
    if (f.marque.trim()) q = q.ilike("marque", `%${f.marque.trim()}%`);
    if (f.energie) q = q.ilike("energie", `%${f.energie}%`);
    if (f.affectation) q = q.eq("n_affectation", Number(f.affectation));
    if (f.etat) q = q.eq("etat_moteur", Number(f.etat));
    if (f.compo) q = q.eq("compo_moteur", Number(f.compo));
    if (f.statut === "Disponible") q = q.eq("est_disponible", 1).is("resa_client_moteur", null);
    else if (f.statut === "Réservé") q = q.eq("est_disponible", 1).not("resa_client_moteur", "is", null);
    else if (f.statut === "Vendu/Archivé") q = q.eq("est_disponible", 0);
    return q;
  }

  async function runListe() {
    const cols = new Set<string>(["n_moteur", "est_disponible", "resa_client_moteur", "archiver"]);
    selectedCols.forEach((k) => {
      if (k !== "statut") cols.add(k);
    });
    let q = supabase.from("v_moteurs_dispo").select([...cols].join(","), { count: "exact" });
    q = applyFilters(q);
    if (sortKey && sortKey !== "statut") q = q.order(sortKey, { ascending: sortDir === "asc", nullsFirst: false });
    q = q.limit(LIMIT);
    const { data, count } = await q;
    setRows((data as any[]) || []);
    setTotal(count || 0);
    setGroups(null);
  }

  async function runRegroupe() {
    // Récupère TOUT l'ensemble filtré (petits champs) pour agréger sans tronquer.
    const all: any[] = [];
    const PAGE = 5000;
    let from = 0;
    const cols =
      "marque,energie,n_affectation,compo_moteur,etat_moteur,nom_type_moteur,date_entree_stock,prix_achat_moteur,est_disponible,resa_client_moteur,archiver";
    while (from < GROUP_MAX) {
      let q = supabase.from("v_moteurs_dispo").select(cols).order("n_moteur", { ascending: true });
      q = applyFilters(q).range(from, from + PAGE - 1);
      const { data, error } = await q;
      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    const gf = GROUP_BY_KEY[groupBy] || GROUP_FIELDS[0];
    const map = new Map<string, { count: number; sum: number; withPrice: number }>();
    for (const r of all) {
      const k = gf.get(r);
      if (!map.has(k)) map.set(k, { count: 0, sum: 0, withPrice: 0 });
      const g = map.get(k)!;
      g.count++;
      const p = r.prix_achat_moteur || 0;
      if (p > 0) {
        g.sum += p;
        g.withPrice++;
      }
    }
    const grouped: GroupRow[] = Array.from(map.entries())
      .map(([val, g]) => ({ val, count: g.count, sum: g.sum, withPrice: g.withPrice, avg: g.withPrice ? g.sum / g.withPrice : 0 }))
      .sort((a, b) => b.count - a.count);
    setGroups(grouped);
    setTotal(all.length);
    setRows(null);
  }

  async function runEtat() {
    setRunning(true);
    try {
      if (mode === "regroupe") await runRegroupe();
      else await runListe();
    } finally {
      setRunning(false);
    }
  }

  function download(name: string, content: string) {
    const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const stamp = new Date().toISOString().slice(0, 10);
    if (mode === "regroupe" && groups && groups.length) {
      const gf = GROUP_BY_KEY[groupBy];
      const header = [gf.label, "Nombre", "Valorisation (€)", "Prix moyen (€)"].map(esc).join(";");
      const body = groups
        .map((g) => [g.val, String(g.count), String(Math.round(g.sum)), String(Math.round(g.avg))].map(esc).join(";"))
        .join("\n");
      download(`etat-regroupe-${groupBy}-${stamp}.csv`, header + "\n" + body);
    } else if (rows && rows.length) {
      const cols = selectedCols.map((k) => COL_BY_KEY[k]).filter(Boolean);
      const header = cols.map((c) => esc(c.label)).join(";");
      const body = rows.map((r) => cols.map((c) => esc(cellValue(r, c))).join(";")).join("\n");
      download(`etat-moteurs-${stamp}.csv`, header + "\n" + body);
    }
  }

  function exportExcel() {
    const stamp = new Date().toISOString().slice(0, 10);
    if (mode === "regroupe" && groups && groups.length) {
      const gf = GROUP_BY_KEY[groupBy];
      const aoa: (string | number)[][] = [[gf.label, "Nombre", "Valorisation (€)", "Prix moyen (€)"]];
      groups.forEach((g) => aoa.push([g.val, g.count, Math.round(g.sum), Math.round(g.avg)]));
      exportXlsx(`etat-regroupe-${groupBy}-${stamp}`, [{ name: "Synthèse", aoa }]);
    } else if (rows && rows.length) {
      const cols = selectedCols.map((k) => COL_BY_KEY[k]).filter(Boolean);
      const aoa: (string | number)[][] = [cols.map((c) => c.label)];
      rows.forEach((r) => aoa.push(cols.map((c) => cellValue(r, c))));
      exportXlsx(`etat-moteurs-${stamp}`, [{ name: "Moteurs", aoa }]);
    }
  }

  async function sauvegarder() {
    const nom = prompt("Nom de l'état à sauvegarder :");
    if (!nom || !nom.trim()) return;
    const { error } = await supabase.from("tbl_etats_perso").insert({
      nom: nom.trim(),
      source: "moteurs",
      config: { columns: selectedCols, filters, sortKey, sortDir, mode, groupBy },
    });
    if (error) {
      alert(`Erreur : ${error.message}`);
      return;
    }
    await loadSaved();
  }

  function charger(e: SavedEtat) {
    const c = e.config || ({} as SavedEtat["config"]);
    setSelectedCols(c.columns?.length ? c.columns : DEFAULT_COLS);
    setFilters({ ...EMPTY_FILTERS, ...(c.filters || {}) });
    setSortKey(c.sortKey || "nom_type_moteur");
    setSortDir(c.sortDir || "asc");
    setMode(c.mode || "liste");
    setGroupBy(c.groupBy || "marque");
    setRows(null);
    setGroups(null);
  }

  async function supprimerEtat(e: SavedEtat) {
    if (!confirm(`Supprimer l'état « ${e.nom} » ?`)) return;
    const { error } = await supabase.from("tbl_etats_perso").delete().eq("id", e.id);
    if (error) {
      alert(`Erreur : ${error.message}`);
      return;
    }
    await loadSaved();
  }

  const displayCols = selectedCols.map((k) => COL_BY_KEY[k]).filter(Boolean);
  const hasResult = (mode === "regroupe" ? groups !== null : rows !== null);
  const empty = mode === "regroupe" ? groups?.length === 0 : rows?.length === 0;
  const totG = groups
    ? groups.reduce(
        (a, g) => ({ count: a.count + g.count, sum: a.sum + g.sum, withPrice: a.withPrice + g.withPrice }),
        { count: 0, sum: 0, withPrice: 0 }
      )
    : { count: 0, sum: 0, withPrice: 0 };

  return (
    <div>
      <Link href="/etats" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground print:hidden">
        <ArrowLeft size={14} /> Retour aux états
      </Link>
      <PageHeader title="Constructeur d'états — Moteurs" description="Liste détaillée ou synthèse chiffrée : choisis colonnes, filtres, regroupement, puis génère." />

      {/* États sauvegardés */}
      {!savedError && saved.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-xs font-semibold uppercase text-text-dim">Mes états :</span>
          {saved.map((e) => (
            <span key={e.id} className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2 py-1 text-xs">
              <button onClick={() => charger(e)} className="font-medium text-brand hover:underline">{e.nom}</button>
              <button onClick={() => supprimerEtat(e)} className="text-text-muted hover:text-destructive" title="Supprimer"><Trash2 size={11} /></button>
            </span>
          ))}
        </div>
      )}

      {/* Mode */}
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex overflow-hidden rounded-lg border border-border bg-surface-alt">
          {(["liste", "regroupe"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setRows(null); setGroups(null); }}
              className={`px-4 py-2 text-sm font-medium transition-all ${mode === m ? "bg-brand text-white" : "text-text-dim hover:bg-surface-hover"}`}
            >
              {m === "liste" ? "Liste détaillée" : "Synthèse (regroupée)"}
            </button>
          ))}
        </div>
        {mode === "regroupe" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-dim">Regrouper par</span>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground">
              {GROUP_FIELDS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Colonnes (mode liste uniquement) */}
      {mode === "liste" && (
        <Card className="mb-4 print:hidden">
          <CardContent className="p-4">
            <p className="mb-2 text-xs font-semibold uppercase text-text-dim">Colonnes à afficher</p>
            <div className="flex flex-wrap gap-2">
              {COLUMNS.map((c) => {
                const on = selectedCols.includes(c.key);
                return (
                  <button
                    key={c.key}
                    onClick={() => toggleCol(c.key)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${on ? "bg-brand text-white" : "bg-surface-alt text-text-dim hover:bg-surface-hover"}`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtres */}
      <Card className="mb-4 print:hidden">
        <CardContent className="p-4">
          <p className="mb-3 text-xs font-semibold uppercase text-text-dim">Filtres</p>
          <div className="grid gap-3 md:grid-cols-3">
            <Input placeholder="Recherche (type, code, série, marque)" value={filters.terme} onChange={(e) => setFilters({ ...filters, terme: e.target.value })} className="border-border bg-surface-alt" />
            <Input placeholder="Marque" value={filters.marque} onChange={(e) => setFilters({ ...filters, marque: e.target.value })} className="border-border bg-surface-alt" />
            <select value={filters.energie} onChange={(e) => setFilters({ ...filters, energie: e.target.value })} className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground">
              {ENERGIES.map((en) => <option key={en.label} value={en.stem}>{en.label}</option>)}
            </select>
            <select value={filters.statut} onChange={(e) => setFilters({ ...filters, statut: e.target.value })} className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground">
              {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filters.affectation} onChange={(e) => setFilters({ ...filters, affectation: e.target.value })} className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground">
              {AFFECTS.map((a) => <option key={a.v} value={a.v}>Affectation : {a.l}</option>)}
            </select>
            <select value={filters.etat} onChange={(e) => setFilters({ ...filters, etat: e.target.value })} className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground">
              {ETATS.map((s) => <option key={s.v} value={s.v}>État : {s.l}</option>)}
            </select>
            <select value={filters.compo} onChange={(e) => setFilters({ ...filters, compo: e.target.value })} className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground">
              {COMPOS.map((s) => <option key={s.v} value={s.v}>Composition : {s.l}</option>)}
            </select>
            {mode === "liste" && (
              <>
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground">
                  {COLUMNS.filter((c) => c.key !== "statut").map((c) => <option key={c.key} value={c.key}>Trier par : {c.label}</option>)}
                </select>
                <select value={sortDir} onChange={(e) => setSortDir(e.target.value as "asc" | "desc")} className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground">
                  <option value="asc">Ordre croissant</option>
                  <option value="desc">Ordre décroissant</option>
                </select>
              </>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={runEtat} disabled={running || (mode === "liste" && selectedCols.length === 0)} className="bg-brand text-white hover:bg-brand/80">
              <Play size={14} className="mr-1" /> {running ? "Génération…" : "Générer l'état"}
            </Button>
            <Button variant="outline" onClick={sauvegarder}>
              <Save size={14} className="mr-1" /> Sauvegarder
            </Button>
            <Button variant="outline" onClick={exportExcel} disabled={!hasResult || empty}>
              <FileSpreadsheet size={14} className="mr-1" /> Export Excel
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!hasResult || empty}>
              <Download size={14} className="mr-1" /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={!hasResult || empty}>
              <Printer size={14} className="mr-1" /> Imprimer
            </Button>
          </div>
          {savedError && (
            <p className="mt-2 text-xs text-amber-600">La sauvegarde nécessite la table tbl_etats_perso (migration SQL à exécuter).</p>
          )}
        </CardContent>
      </Card>

      {/* Résultat */}
      {!hasResult ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">
          {mode === "regroupe"
            ? "Choisis le regroupement et les filtres, puis clique « Générer l'état »."
            : "Choisis tes colonnes et filtres, puis clique « Générer l'état »."}
        </div>
      ) : empty ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">Aucun moteur ne correspond.</div>
      ) : mode === "regroupe" && groups ? (
        <>
          <p className="mb-2 text-sm text-text-dim">
            {totG.count.toLocaleString("fr-FR")} moteurs · {groups.length} {GROUP_BY_KEY[groupBy].label.toLowerCase()}(s) · valorisation {fmtEur(totG.sum)}
          </p>
          <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-xs uppercase text-text-dim">
                <tr>
                  <th className="px-4 py-3 text-left">{GROUP_BY_KEY[groupBy].label}</th>
                  <th className="px-4 py-3 text-center">Nombre</th>
                  <th className="px-4 py-3 text-right">Valorisation (Σ achat)</th>
                  <th className="px-4 py-3 text-right">Prix moyen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups.map((g) => (
                  <tr key={g.val} className="transition-colors hover:bg-surface-hover">
                    <td className="px-4 py-2.5 font-medium text-foreground">{g.val}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums text-text-dim">{g.count.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-dim">{fmtEur(g.sum)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-dim">{g.avg ? fmtEur(g.avg) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-surface-alt font-semibold">
                  <td className="px-4 py-3 text-foreground">Total</td>
                  <td className="px-4 py-3 text-center tabular-nums text-foreground">{totG.count.toLocaleString("fr-FR")}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-brand">{fmtEur(totG.sum)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-muted">{totG.withPrice ? fmtEur(totG.sum / totG.withPrice) : "—"}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : rows ? (
        <>
          <p className="mb-2 text-sm text-text-dim">
            {total.toLocaleString("fr-FR")} moteur{total > 1 ? "s" : ""}{total > rows.length ? ` (affichage des ${rows.length.toLocaleString("fr-FR")} premiers)` : ""}
          </p>
          <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt text-xs uppercase text-text-dim">
                  <tr>
                    {displayCols.map((c) => (
                      <th key={c.key} className={`px-4 py-3 ${c.kind === "price" ? "text-right" : "text-left"}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.n_moteur} className="transition-colors hover:bg-surface-hover">
                      {displayCols.map((c) => (
                        <td key={c.key} className={`px-4 py-2.5 ${c.kind === "price" ? "text-right tabular-nums" : "text-text-dim"}`}>
                          {cellValue(r, c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
