"use client";

export type Period = "all" | "12m" | "6m" | "3m" | "1m";

export const PERIODS: { key: Period; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "12m", label: "12 mois" },
  { key: "6m", label: "6 mois" },
  { key: "3m", label: "3 mois" },
  { key: "1m", label: "1 mois" },
];

const MONTHS: Record<Exclude<Period, "all">, number> = {
  "12m": 12,
  "6m": 6,
  "3m": 3,
  "1m": 1,
};

/** Début (inclus) d'une fenêtre glissante finissant aujourd'hui, ou null pour "tout". */
export function periodStart(p: Period): Date | null {
  if (p === "all") return null;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - MONTHS[p], now.getDate());
  start.setHours(0, 0, 0, 0);
  return start;
}

/** La date (ISO) tombe-t-elle dans la fenêtre ? (vides exclus sauf "tout") */
export function inPeriod(dateStr: string | null | undefined, p: Period): boolean {
  const start = periodStart(p);
  if (!start) return true;
  if (!dateStr) return false;
  return new Date(dateStr) >= start;
}

export function PeriodFilter({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-semibold uppercase text-text-muted">Période</span>
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            value === p.key ? "bg-brand text-white" : "bg-surface-alt text-text-dim hover:bg-surface-hover"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
