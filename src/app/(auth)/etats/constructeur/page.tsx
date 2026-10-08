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

type ColKind = "price" | "compo" | "etat" | "affect" | "statut" | "date" | "num" | "text";
type Col = { key: string; label: string; kind?: ColKind; virtual?: boolean };
type GroupField = { key: string; label: string; get: (r: any) => string };
type FilterState = Record<string, string>;
type FilterControl =
  | { kind: "search"; key: string; placeholder: string }
  | { kind: "text"; key: string; placeholder: string }
  | { kind: "select"; key: string; options: { v: string; l: string }[] }
  | { kind: "date"; key: string; label: string };

type SourceDef = {
  key: string;
  label: string;
  table: string;
  rowKey: string;
  noun: string; // "moteur", "réception", "expédition"
  columns: Col[];
  defaultCols: string[];
  groupFields: GroupField[];
  priceField?: string;
  valorLabel: string; // en-tête de la colonne Σ
  sortDefault: string;
  sortDirDefault: "asc" | "desc";
  selectExtra: string[]; // champs non affichés nécessaires (statut dérivé / enrichissement)
  aggFields: string[]; // champs à charger pour le regroupement
  filterControls: FilterControl[];
  defaultFilters: FilterState;
  applyFilters: (q: any, f: FilterState) => any;
  deriveStatut?: (r: any) => string;
  enrich?: (rows: any[]) => Promise<void>;
};

/* ------------------------------------------------------------------ */
/* Helpers partagés                                                    */
/* ------------------------------------------------------------------ */
function fmtEur(v: number) {
  return `${Math.round(v).toLocaleString("fr-FR")} €`;
}

function moteurStatut(r: any): string {
  if (r.archiver) return "Archivé";
  if (r.est_disponible === 0) return "Vendu";
  if ((r.resa_client_moteur || "").trim()) return "Réservé";
  return "Disponible";
}
function venteStatut(r: any): string {
  return r.expedition_terminee ? "Terminée" : "En cours";
}

function cellValue(r: any, col: Col, src: SourceDef): string {
  if (col.kind === "statut") return src.deriveStatut ? src.deriveStatut(r) : (r[col.key] ?? "—");
  const v = r[col.key];
  if (v == null || v === "") return "—";
  switch (col.kind) {
    case "price":
      return `${Math.round(v).toLocaleString("fr-FR")} €`;
    case "num":
      return Number(v).toLocaleString("fr-FR");
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

/* ------------------------------------------------------------------ */
/* Enrichissement Ventes : n_client → nom lisible                      */
/* ------------------------------------------------------------------ */
async function enrichVentes(rows: any[]) {
  const ids = [...new Set(rows.map((r) => r.n_client).filter((x) => x != null))] as number[];
  const nameById: Record<number, string> = {};
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    const { data } = await supabase
      .from("tbl_clients")
      .select("n_client, societe, nom_usage, nom_contact")
      .in("n_client", slice);
    (data || []).forEach((c: any) => {
      nameById[c.n_client] = c.societe || c.nom_usage || c.nom_contact || `Client #${c.n_client}`;
    });
  }
  rows.forEach((r) => {
    r.clientNom = r.n_client != null ? nameById[r.n_client] || `Client #${r.n_client}` : "—";
  });
}

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */
const MOTEURS: SourceDef = {
  key: "moteurs",
  label: "Moteurs",
  table: "v_moteurs_dispo",
  rowKey: "n_moteur",
  noun: "moteur",
  columns: [
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
    { key: "statut", label: "Statut", kind: "statut", virtual: true },
    { key: "date_entree_stock", label: "Entrée stock", kind: "date" },
    { key: "observations", label: "Observations" },
  ],
  defaultCols: ["nom_type_moteur", "num_serie", "marque", "energie", "statut", "prix_achat_moteur"],
  groupFields: [
    { key: "marque", label: "Marque", get: (r) => r.marque || "—" },
    { key: "energie", label: "Énergie", get: (r) => r.energie || "—" },
    { key: "n_affectation", label: "Affectation", get: (r) => affectationLabel(r.n_affectation) || "—" },
    { key: "statut", label: "Statut", get: (r) => moteurStatut(r) },
    { key: "compo_moteur", label: "Composition", get: (r) => compoLabel(r.compo_moteur) || "—" },
    { key: "etat_moteur", label: "État méca.", get: (r) => etatMoteurLabel(r.etat_moteur) || "—" },
    { key: "nom_type_moteur", label: "Type moteur", get: (r) => r.nom_type_moteur || "—" },
    { key: "mois", label: "Mois d'entrée", get: (r) => (r.date_entree_stock ? String(r.date_entree_stock).slice(0, 7) : "—") },
  ],
  priceField: "prix_achat_moteur",
  valorLabel: "Σ achat",
  sortDefault: "nom_type_moteur",
  sortDirDefault: "asc",
  selectExtra: ["est_disponible", "resa_client_moteur", "archiver"],
  aggFields: [
    "marque",
    "energie",
    "n_affectation",
    "compo_moteur",
    "etat_moteur",
    "nom_type_moteur",
    "date_entree_stock",
    "prix_achat_moteur",
    "est_disponible",
    "resa_client_moteur",
    "archiver",
  ],
  filterControls: [
    { kind: "search", key: "terme", placeholder: "Recherche (type, code, série, marque)" },
    { kind: "text", key: "marque", placeholder: "Marque" },
    {
      kind: "select",
      key: "energie",
      options: [
        { v: "", l: "Énergie : toutes" },
        { v: "diesel", l: "Diesel" },
        { v: "essence", l: "Essence" },
        { v: "electr", l: "Électrique" },
      ],
    },
    {
      kind: "select",
      key: "statut",
      options: [
        { v: "Tous", l: "Statut : tous" },
        { v: "Disponible", l: "Disponible" },
        { v: "Réservé", l: "Réservé" },
        { v: "Vendu/Archivé", l: "Vendu/Archivé" },
      ],
    },
    {
      kind: "select",
      key: "affectation",
      options: [
        { v: "", l: "Affectation : toutes" },
        { v: "1", l: "Affectation : Exportation" },
        { v: "2", l: "Affectation : Rénovation" },
        { v: "3", l: "Affectation : Pièces (export)" },
        { v: "4", l: "Affectation : Démontage" },
      ],
    },
    {
      kind: "select",
      key: "etat",
      options: [
        { v: "", l: "État : tous" },
        { v: "4", l: "État : Tournant" },
        { v: "5", l: "État : Bloqué" },
        { v: "6", l: "État : Sans compressions" },
        { v: "7", l: "État : Bloc cassé" },
        { v: "9", l: "État : HS" },
      ],
    },
    {
      kind: "select",
      key: "compo",
      options: [
        { v: "", l: "Composition : toutes" },
        { v: "2", l: "Moteur seul" },
        { v: "1", l: "Moteur + BV" },
        { v: "16", l: "Moteur + BVA" },
        { v: "15", l: "Moteur + BV 4" },
      ],
    },
  ],
  defaultFilters: { terme: "", marque: "", energie: "", statut: "Tous", affectation: "", etat: "", compo: "" },
  applyFilters(q, f) {
    if (f.terme?.trim()) {
      const t = f.terme.trim();
      q = q.or(`nom_type_moteur.ilike.%${t}%,code_moteur.ilike.%${t}%,num_serie.ilike.%${t}%,marque.ilike.%${t}%`);
    }
    if (f.marque?.trim()) q = q.ilike("marque", `%${f.marque.trim()}%`);
    if (f.energie) q = q.ilike("energie", `%${f.energie}%`);
    if (f.affectation) q = q.eq("n_affectation", Number(f.affectation));
    if (f.etat) q = q.eq("etat_moteur", Number(f.etat));
    if (f.compo) q = q.eq("compo_moteur", Number(f.compo));
    if (f.statut === "Disponible") q = q.eq("est_disponible", 1).is("resa_client_moteur", null);
    else if (f.statut === "Réservé") q = q.eq("est_disponible", 1).not("resa_client_moteur", "is", null);
    else if (f.statut === "Vendu/Archivé") q = q.eq("est_disponible", 0);
    return q;
  },
  deriveStatut: moteurStatut,
};

const RECEPTIONS: SourceDef = {
  key: "receptions",
  label: "Réceptions",
  table: "v_receptions",
  rowKey: "n_reception",
  noun: "réception",
  columns: [
    { key: "n_reception", label: "N°" },
    { key: "date_reception", label: "Date", kind: "date" },
    { key: "fournisseur", label: "Fournisseur" },
    { key: "montant_total", label: "Montant", kind: "price" },
    { key: "statut", label: "Statut" },
    { key: "nb_moteurs", label: "Moteurs", kind: "num" },
    { key: "nb_boites", label: "Boîtes", kind: "num" },
    { key: "nb_pieces", label: "Pièces", kind: "num" },
  ],
  defaultCols: ["n_reception", "date_reception", "fournisseur", "montant_total", "nb_moteurs", "statut"],
  groupFields: [
    { key: "fournisseur", label: "Fournisseur", get: (r) => r.fournisseur || "—" },
    { key: "statut", label: "Statut", get: (r) => r.statut || "—" },
    { key: "mois", label: "Mois", get: (r) => (r.date_reception ? String(r.date_reception).slice(0, 7) : "—") },
  ],
  priceField: "montant_total",
  valorLabel: "Σ montant",
  sortDefault: "date_reception",
  sortDirDefault: "desc",
  selectExtra: [],
  aggFields: ["fournisseur", "statut", "date_reception", "montant_total"],
  filterControls: [
    { kind: "search", key: "terme", placeholder: "Recherche fournisseur" },
    {
      kind: "select",
      key: "statut",
      options: [
        { v: "Tous", l: "Statut : tous" },
        { v: "Validée", l: "Validée" },
        { v: "En cours", l: "En cours" },
      ],
    },
    { kind: "date", key: "dateFrom", label: "Depuis" },
    { kind: "date", key: "dateTo", label: "Jusqu'au" },
  ],
  defaultFilters: { terme: "", statut: "Tous", dateFrom: "", dateTo: "" },
  applyFilters(q, f) {
    if (f.terme?.trim()) q = q.ilike("fournisseur", `%${f.terme.trim()}%`);
    if (f.statut && f.statut !== "Tous") q = q.eq("statut", f.statut);
    if (f.dateFrom) q = q.gte("date_reception", f.dateFrom);
    if (f.dateTo) q = q.lte("date_reception", `${f.dateTo}T23:59:59`);
    return q;
  },
};

const VENTES: SourceDef = {
  key: "ventes",
  label: "Ventes (expéditions)",
  table: "tbl_expeditions",
  rowKey: "n_expedition",
  noun: "expédition",
  columns: [
    { key: "n_expedition", label: "N°" },
    { key: "date_chargement", label: "Date", kind: "date" },
    { key: "clientNom", label: "Client", virtual: true },
    { key: "montant_ht", label: "Montant HT", kind: "price" },
    { key: "num_facture", label: "N° facture" },
    { key: "statut", label: "Statut", kind: "statut", virtual: true },
    { key: "ref_container", label: "Conteneur" },
    { key: "nb_cartons", label: "Cartons", kind: "num" },
    { key: "nb_palettes", label: "Palettes", kind: "num" },
    { key: "poids", label: "Poids (kg)", kind: "num" },
    { key: "autres_info", label: "Infos" },
  ],
  defaultCols: ["n_expedition", "date_chargement", "clientNom", "montant_ht", "statut"],
  groupFields: [
    { key: "client", label: "Client", get: (r) => r.clientNom || "—" },
    { key: "statut", label: "Statut", get: (r) => venteStatut(r) },
    { key: "mois", label: "Mois", get: (r) => (r.date_chargement ? String(r.date_chargement).slice(0, 7) : "—") },
  ],
  priceField: "montant_ht",
  valorLabel: "Σ montant HT",
  sortDefault: "date_chargement",
  sortDirDefault: "desc",
  selectExtra: ["n_client", "expedition_terminee"],
  aggFields: ["n_client", "expedition_terminee", "date_chargement", "montant_ht"],
  filterControls: [
    { kind: "search", key: "terme", placeholder: "Recherche (facture, infos)" },
    {
      kind: "select",
      key: "statut",
      options: [
        { v: "Tous", l: "Statut : tous" },
        { v: "Terminée", l: "Terminée" },
        { v: "En cours", l: "En cours" },
      ],
    },
    { kind: "date", key: "dateFrom", label: "Depuis" },
    { kind: "date", key: "dateTo", label: "Jusqu'au" },
  ],
  defaultFilters: { terme: "", statut: "Tous", dateFrom: "", dateTo: "" },
  applyFilters(q, f) {
    if (f.terme?.trim()) {
      const t = f.terme.trim();
      q = q.or(`num_facture.ilike.%${t}%,autres_info.ilike.%${t}%`);
    }
    if (f.statut === "Terminée") q = q.eq("expedition_terminee", true);
    else if (f.statut === "En cours") q = q.eq("expedition_terminee", false);
    if (f.dateFrom) q = q.gte("date_chargement", f.dateFrom);
    if (f.dateTo) q = q.lte("date_chargement", `${f.dateTo}T23:59:59`);
    return q;
  },
  deriveStatut: venteStatut,
  enrich: enrichVentes,
};

const SOURCES: SourceDef[] = [MOTEURS, RECEPTIONS, VENTES];
const SOURCE_BY_KEY = Object.fromEntries(SOURCES.map((s) => [s.key, s]));

type GroupRow = { val: string; count: number; sum: number; avg: number; withPrice: number };
type Mode = "liste" | "regroupe";
type SavedEtat = {
  id: number;
  nom: string;
  config: { columns: string[]; filters: FilterState; sortKey: string; sortDir: "asc" | "desc"; mode?: Mode; groupBy?: string };
};

export default function ConstructeurEtatPage() {
  const [sourceKey, setSourceKey] = useState<string>("moteurs");
  const src = SOURCE_BY_KEY[sourceKey];
  const colByKey = Object.fromEntries(src.columns.map((c) => [c.key, c]));
  const groupByKey = Object.fromEntries(src.groupFields.map((g) => [g.key, g]));

  const [selectedCols, setSelectedCols] = useState<string[]>(MOTEURS.defaultCols);
  const [filters, setFilters] = useState<FilterState>(MOTEURS.defaultFilters);
  const [sortKey, setSortKey] = useState<string>(MOTEURS.sortDefault);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(MOTEURS.sortDirDefault);
  const [mode, setMode] = useState<Mode>("liste");
  const [groupBy, setGroupBy] = useState<string>(MOTEURS.groupFields[0].key);
  const [rows, setRows] = useState<any[] | null>(null);
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [saved, setSaved] = useState<SavedEtat[]>([]);
  const [savedError, setSavedError] = useState(false);

  const loadSaved = useCallback(async (sk: string) => {
    const { data, error } = await supabase
      .from("tbl_etats_perso")
      .select("id, nom, config")
      .eq("source", sk)
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
    loadSaved(sourceKey);
  }, [loadSaved, sourceKey]);

  function switchSource(sk: string) {
    const s = SOURCE_BY_KEY[sk];
    if (!s) return;
    setSourceKey(sk);
    setSelectedCols(s.defaultCols);
    setFilters(s.defaultFilters);
    setSortKey(s.sortDefault);
    setSortDir(s.sortDirDefault);
    setMode("liste");
    setGroupBy(s.groupFields[0].key);
    setRows(null);
    setGroups(null);
    setTotal(0);
  }

  function toggleCol(key: string) {
    setSelectedCols((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  // Colonnes triables côté serveur (champ réel, non dérivé/calculé)
  const sortableCols = src.columns.filter((c) => !c.virtual && c.kind !== "statut");

  async function runListe() {
    const cols = new Set<string>([src.rowKey, ...src.selectExtra]);
    selectedCols.forEach((k) => {
      const c = colByKey[k];
      if (c && !c.virtual && c.kind !== "statut") cols.add(k);
    });
    let q = supabase.from(src.table).select([...cols].join(","), { count: "exact" });
    q = src.applyFilters(q, filters);
    const canSort = sortableCols.some((c) => c.key === sortKey);
    const effSort = canSort ? sortKey : src.sortDefault;
    q = q.order(effSort, { ascending: sortDir === "asc", nullsFirst: false });
    q = q.limit(LIMIT);
    const { data, count } = await q;
    const list = (data as any[]) || [];
    if (src.enrich) await src.enrich(list);
    setRows(list);
    setTotal(count || 0);
    setGroups(null);
  }

  async function runRegroupe() {
    const all: any[] = [];
    const PAGE = 5000;
    let from = 0;
    const cols = src.aggFields.join(",");
    while (from < GROUP_MAX) {
      let q = supabase.from(src.table).select(cols).order(src.rowKey, { ascending: true });
      q = src.applyFilters(q, filters).range(from, from + PAGE - 1);
      const { data, error } = await q;
      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    if (src.enrich) await src.enrich(all);
    const gf = groupByKey[groupBy] || src.groupFields[0];
    const priceField = src.priceField;
    const map = new Map<string, { count: number; sum: number; withPrice: number }>();
    for (const r of all) {
      const k = gf.get(r);
      if (!map.has(k)) map.set(k, { count: 0, sum: 0, withPrice: 0 });
      const g = map.get(k)!;
      g.count++;
      const p = priceField ? r[priceField] || 0 : 0;
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
      const gf = groupByKey[groupBy];
      const header = [gf.label, "Nombre", "Valorisation (€)", "Prix moyen (€)"].map(esc).join(";");
      const body = groups
        .map((g) => [g.val, String(g.count), String(Math.round(g.sum)), String(Math.round(g.avg))].map(esc).join(";"))
        .join("\n");
      download(`etat-${src.key}-regroupe-${groupBy}-${stamp}.csv`, header + "\n" + body);
    } else if (rows && rows.length) {
      const cols = selectedCols.map((k) => colByKey[k]).filter(Boolean);
      const header = cols.map((c) => esc(c.label)).join(";");
      const body = rows.map((r) => cols.map((c) => esc(cellValue(r, c, src))).join(";")).join("\n");
      download(`etat-${src.key}-${stamp}.csv`, header + "\n" + body);
    }
  }

  function exportExcel() {
    const stamp = new Date().toISOString().slice(0, 10);
    if (mode === "regroupe" && groups && groups.length) {
      const gf = groupByKey[groupBy];
      const aoa: (string | number)[][] = [[gf.label, "Nombre", "Valorisation (€)", "Prix moyen (€)"]];
      groups.forEach((g) => aoa.push([g.val, g.count, Math.round(g.sum), Math.round(g.avg)]));
      exportXlsx(`etat-${src.key}-regroupe-${groupBy}-${stamp}`, [{ name: "Synthèse", aoa }]);
    } else if (rows && rows.length) {
      const cols = selectedCols.map((k) => colByKey[k]).filter(Boolean);
      const aoa: (string | number)[][] = [cols.map((c) => c.label)];
      rows.forEach((r) => aoa.push(cols.map((c) => cellValue(r, c, src))));
      exportXlsx(`etat-${src.key}-${stamp}`, [{ name: src.label.slice(0, 31), aoa }]);
    }
  }

  async function sauvegarder() {
    const nom = prompt("Nom de l'état à sauvegarder :");
    if (!nom || !nom.trim()) return;
    const { error } = await supabase.from("tbl_etats_perso").insert({
      nom: nom.trim(),
      source: src.key,
      config: { columns: selectedCols, filters, sortKey, sortDir, mode, groupBy },
    });
    if (error) {
      alert(`Erreur : ${error.message}`);
      return;
    }
    await loadSaved(sourceKey);
  }

  function charger(e: SavedEtat) {
    const c = e.config || ({} as SavedEtat["config"]);
    setSelectedCols(c.columns?.length ? c.columns : src.defaultCols);
    setFilters({ ...src.defaultFilters, ...(c.filters || {}) });
    setSortKey(c.sortKey || src.sortDefault);
    setSortDir(c.sortDir || src.sortDirDefault);
    setMode(c.mode || "liste");
    setGroupBy(c.groupBy || src.groupFields[0].key);
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
    await loadSaved(sourceKey);
  }

  const displayCols = selectedCols.map((k) => colByKey[k]).filter(Boolean);
  const hasResult = mode === "regroupe" ? groups !== null : rows !== null;
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
      <PageHeader
        title={`Constructeur d'états — ${src.label}`}
        description="Liste détaillée ou synthèse chiffrée : choisis la source, les colonnes, les filtres, le regroupement, puis génère."
      />

      {/* Source de données */}
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <span className="text-xs font-semibold uppercase text-text-dim">Source</span>
        <div className="flex overflow-hidden rounded-lg border border-border bg-surface-alt">
          {SOURCES.map((s) => (
            <button
              key={s.key}
              onClick={() => switchSource(s.key)}
              className={`px-4 py-2 text-sm font-medium transition-all ${sourceKey === s.key ? "bg-brand text-white" : "text-text-dim hover:bg-surface-hover"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

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
              {src.groupFields.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
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
              {src.columns.map((c) => {
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
            {src.filterControls.map((ctrl) => {
              if (ctrl.kind === "search" || ctrl.kind === "text") {
                return (
                  <Input
                    key={ctrl.key}
                    placeholder={ctrl.placeholder}
                    value={filters[ctrl.key] || ""}
                    onChange={(e) => setFilters({ ...filters, [ctrl.key]: e.target.value })}
                    className="border-border bg-surface-alt"
                  />
                );
              }
              if (ctrl.kind === "select") {
                return (
                  <select
                    key={ctrl.key}
                    value={filters[ctrl.key] ?? ""}
                    onChange={(e) => setFilters({ ...filters, [ctrl.key]: e.target.value })}
                    className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground"
                  >
                    {ctrl.options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                );
              }
              // date
              return (
                <label key={ctrl.key} className="flex items-center gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text-dim">
                  <span className="whitespace-nowrap">{ctrl.label}</span>
                  <input
                    type="date"
                    value={filters[ctrl.key] || ""}
                    onChange={(e) => setFilters({ ...filters, [ctrl.key]: e.target.value })}
                    className="w-full bg-transparent text-foreground outline-none"
                  />
                </label>
              );
            })}
            {mode === "liste" && (
              <>
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground">
                  {sortableCols.map((c) => <option key={c.key} value={c.key}>Trier par : {c.label}</option>)}
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
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">Aucun résultat ne correspond.</div>
      ) : mode === "regroupe" && groups ? (
        <>
          <p className="mb-2 text-sm text-text-dim">
            {totG.count.toLocaleString("fr-FR")} {src.noun}
            {totG.count > 1 ? "s" : ""} · {groups.length} {groupByKey[groupBy].label.toLowerCase()}(s) · valorisation {fmtEur(totG.sum)}
          </p>
          <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-xs uppercase text-text-dim">
                <tr>
                  <th className="px-4 py-3 text-left">{groupByKey[groupBy].label}</th>
                  <th className="px-4 py-3 text-center">Nombre</th>
                  <th className="px-4 py-3 text-right">Valorisation ({src.valorLabel})</th>
                  <th className="px-4 py-3 text-right">Montant moyen</th>
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
            {total.toLocaleString("fr-FR")} {src.noun}{total > 1 ? "s" : ""}
            {total > rows.length ? ` (affichage des ${rows.length.toLocaleString("fr-FR")} premiers)` : ""}
          </p>
          <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt text-xs uppercase text-text-dim">
                  <tr>
                    {displayCols.map((c) => (
                      <th key={c.key} className={`px-4 py-3 ${c.kind === "price" || c.kind === "num" ? "text-right" : "text-left"}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r[src.rowKey]} className="transition-colors hover:bg-surface-hover">
                      {displayCols.map((c) => (
                        <td key={c.key} className={`px-4 py-2.5 ${c.kind === "price" || c.kind === "num" ? "text-right tabular-nums" : "text-text-dim"}`}>
                          {cellValue(r, c, src)}
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
