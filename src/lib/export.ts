import * as XLSX from "xlsx";

export type XlsxSheet = { name: string; aoa: (string | number)[][] };

/**
 * Export natif .xlsx (une ou plusieurs feuilles). Chaque feuille = un tableau
 * de lignes (array of arrays), la première ligne servant d'en-tête.
 * Déclenche le téléchargement du fichier.
 */
export function exportXlsx(filename: string, sheets: XlsxSheet[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.aoa);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31) || "Feuille1");
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
