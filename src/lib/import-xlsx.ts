import * as XLSX from "xlsx";

/** Lit la 1re feuille d'un fichier .xlsx/.csv en lignes {entête: valeur}. */
export async function parseXlsxRows(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
}

/** Normalise un libellé d'en-tête : sans accents, minuscules, espaces compactés. */
export function normHeader(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_.-]+/g, " ")
    .trim();
}

/**
 * Construit la correspondance en-tête → champ cible à partir d'alias.
 * `aliases` : { champ: [libellés normalisés acceptés] }.
 * Retourne { champ: entêteTrouvée } pour les champs détectés.
 */
export function mapHeaders(headers: string[], aliases: Record<string, string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  const normed = headers.map((h) => ({ raw: h, n: normHeader(h) }));
  for (const [field, alist] of Object.entries(aliases)) {
    const hit = normed.find((h) => alist.some((a) => h.n === a || h.n.includes(a)));
    if (hit) out[field] = hit.raw;
  }
  return out;
}

/** Convertit une valeur Excel en nombre (gère la virgule décimale FR). */
export function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
