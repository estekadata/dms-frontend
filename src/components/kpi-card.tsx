import { type KpiMeta } from "@/lib/types";

const accentColors: Record<string, { border: string; text: string; bg: string }> = {
  emerald: { border: "border-l-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  amber:   { border: "border-l-amber-500",   text: "text-amber-700",   bg: "bg-amber-50" },
  red:     { border: "border-l-red-500",      text: "text-red-700",     bg: "bg-red-50" },
  blue:    { border: "border-l-blue-500",     text: "text-blue-700",    bg: "bg-blue-50" },
};

function formatValue(value: number, fmt: KpiMeta["fmt"]): string {
  if (fmt === "money") return new Intl.NumberFormat("fr-FR").format(Math.round(value)) + " EUR";
  if (fmt === "pct") return value.toFixed(1) + "%";
  return new Intl.NumberFormat("fr-FR").format(Math.round(value));
}

interface KpiCardProps {
  meta: KpiMeta;
  value: number;
}

export function KpiCard({ meta, value }: KpiCardProps) {
  const colors = accentColors[meta.color] || accentColors.red;

  return (
    <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${colors.border} p-5 hover:shadow-sm transition-shadow`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
        {meta.icon} {meta.label}
      </p>
      <p className={`text-2xl font-bold ${colors.text}`}>
        {formatValue(value, meta.fmt)}
      </p>
    </div>
  );
}
