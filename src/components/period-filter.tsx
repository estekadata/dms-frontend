"use client";

export type Period = "all" | "year" | "semester" | "quarter" | "month";

export const PERIODS: { key: Period; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "year", label: "Cette année" },
  { key: "semester", label: "Ce semestre" },
  { key: "quarter", label: "Ce trimestre" },
  { key: "month", label: "Ce mois" },
];

/** Début (inclus) de la période courante, ou null pour "tout". */
export function periodStart(p: Period): Date | null {
  if (p === "all") return null;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (p === "year") return new Date(y, 0, 1);
  if (p === "semester") return new Date(y, m < 6 ? 0 : 6, 1);
  if (p === "quarter") return new Date(y, Math.floor(m / 3) * 3, 1);
  if (p === "month") return new Date(y, m, 1);
  return null;
}

/** La date (ISO) tombe-t-elle dans la période ? (vides exclus sauf "tout") */
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
