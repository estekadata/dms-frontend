"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

/**
 * En-tête de colonne cliquable (tri ↑/↓). Réutilisable pour tous les tableaux.
 * `active` = c'est la colonne de tri courante ; `dir` = sens courant.
 */
export function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const arrow = active ? (dir === "asc" ? "▲" : "▼") : "↕";
  return (
    <th
      onClick={onClick}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "cursor-pointer select-none px-4 py-3 transition-colors hover:text-foreground",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        active && "text-foreground",
        className
      )}
    >
      <span className={cn("inline-flex items-center gap-1", align === "right" && "flex-row-reverse")}>
        {label}
        <span className={cn("text-[10px]", active ? "text-brand" : "text-text-muted/50")}>{arrow}</span>
      </span>
    </th>
  );
}

/** Comparateur générique : nombres, dates ISO, texte (fr, numérique), vides en dernier. */
export function compareValues(av: unknown, bv: unknown): number {
  const aEmpty = av == null || av === "";
  const bEmpty = bv == null || bv === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1; // vides à la fin
  if (bEmpty) return -1;
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv), "fr", { numeric: true, sensitivity: "base" });
}

/**
 * Tri CLIENT d'une liste déjà chargée. Pour les tableaux dont toutes les
 * données sont en mémoire (Réceptions, Réservations, Historique, admin…).
 * `accessor` permet de trier sur une valeur dérivée (ex: nom de client résolu).
 */
export function useClientSort<T>(
  rows: T[],
  opts?: { key?: string; dir?: SortDir; accessor?: (row: T, key: string) => unknown }
) {
  const [sortKey, setSortKey] = useState<string>(opts?.key ?? "");
  const [sortDir, setSortDir] = useState<SortDir>(opts?.dir ?? "asc");

  function onSort(key: string) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const get = opts?.accessor ?? ((row: T, key: string) => (row as Record<string, unknown>)[key]);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const c = compareValues(get(a, sortKey), get(b, sortKey));
      return sortDir === "asc" ? c : -c;
    });
    return arr;
  }, [rows, sortKey, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  return { sorted, sortKey, sortDir, onSort };
}
