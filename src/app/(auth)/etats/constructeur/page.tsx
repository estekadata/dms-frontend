"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Download, Save, Play, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { compoLabel, etatMoteurLabel, affectationLabel } from "@/components/moteur-statuts";

const LIMIT = 2000;

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

type Filters = { terme: string; marque: string; energie: string; statut: string; affectation: string; etat: string; compo: string };
const EMPTY_FILTERS: Filters = { terme: "", marque: "", energie: "", statut: "Tous", affectation: "", etat: "", compo: "" };

type SavedEtat = { id: number; nom: string; config: { columns: string[]; filters: Filters; sortKey: string; sortDir: "asc" | "desc" } };

function deriveStatut(r: any): string {
  if (r.archiver) return "Archivé";
  if (r.est_disponible === 0) return "Vendu";
  if ((r.resa_client_moteur || "").trim()) return "Réservé";
  return "Disponible";
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

export default function ConstructeurEtatPage() {
  const [selectedCols, setSelectedCols] = useState<string[]>(DEFAULT_COLS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<string>("nom_type_moteur");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [rows, setRows] = useState<any[] | null>(null);
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

  async function runEtat() {
    setRunning(true);
    const cols = new Set<string>(["n_moteur", "est_disponible", "resa_client_moteur", "archiver"]);
    selectedCols.forEach((k) => {
      if (k !== "statut") cols.add(k);
    });
    let q = supabase.from("v_moteurs_dispo").select([...cols].join(","), { count: "exact" });
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
    if (sortKey && sortKey !== "statut") q = q.order(sortKey, { ascending: sortDir === "asc", nullsFirst: false });
    q = q.limit(LIMIT);
    const { data, count } = await q;
    setRows((data as any[]) || []);
    setTotal(count || 0);
    setRunning(false);
  }

  function exportCsv() {
    if (!rows || rows.length === 0) return;
    const cols = selectedCols.map((k) => COL_BY_KEY[k]).filter(Boolean);
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = cols.map((c) => esc(c.label)).join(";");
    const body = rows.map((r) => cols.map((c) => esc(cellValue(r, c))).join(";")).join("\n");
    const blob = new Blob(["﻿" + header + "\n" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etat-moteurs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function sauvegarder() {
    const nom = prompt("Nom de l'état à sauvegarder :");
    if (!nom || !nom.trim()) return;
    const { error } = await supabase.from("tbl_etats_perso").insert({
      nom: nom.trim(),
      source: "moteurs",
      config: { columns: selectedCols, filters, sortKey, sortDir },
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
    setRows(null);
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

  return (
    <div>
      <Link href="/etats" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground print:hidden">
        <ArrowLeft size={14} /> Retour aux états
      </Link>
      <PageHeader title="Constructeur d'états — Moteurs" description="Choisis les colonnes et les filtres, génère ton état, imprime ou exporte." />

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

      {/* Colonnes */}
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
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground">
              {COLUMNS.filter((c) => c.key !== "statut").map((c) => <option key={c.key} value={c.key}>Trier par : {c.label}</option>)}
            </select>
            <select value={sortDir} onChange={(e) => setSortDir(e.target.value as "asc" | "desc")} className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground">
              <option value="asc">Ordre croissant</option>
              <option value="desc">Ordre décroissant</option>
            </select>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={runEtat} disabled={running || selectedCols.length === 0} className="bg-brand text-white hover:bg-brand/80">
              <Play size={14} className="mr-1" /> {running ? "Génération…" : "Générer l'état"}
            </Button>
            <Button variant="outline" onClick={sauvegarder} disabled={selectedCols.length === 0}>
              <Save size={14} className="mr-1" /> Sauvegarder
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!rows || rows.length === 0}>
              <Download size={14} className="mr-1" /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={!rows || rows.length === 0}>
              <Printer size={14} className="mr-1" /> Imprimer
            </Button>
          </div>
          {savedError && (
            <p className="mt-2 text-xs text-amber-600">La sauvegarde nécessite la table tbl_etats_perso (migration SQL à exécuter).</p>
          )}
        </CardContent>
      </Card>

      {/* Résultat */}
      {rows === null ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">
          Choisis tes colonnes et filtres, puis clique « Générer l&apos;état ».
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">Aucun moteur ne correspond.</div>
      ) : (
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
      )}
    </div>
  );
}
