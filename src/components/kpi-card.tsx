import { type KpiMeta } from "@/lib/types";

const colorMap: Record<string, string> = {
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  red: "text-red-600",
  blue: "text-blue-600",
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
  return (
    <div className="bg-surface border border-border rounded-[14px] p-5 hover:bg-surface-hover transition-all">
      <p className="text-xs font-semibold text-text-dim uppercase tracking-wide">
        {meta.icon} {meta.label}
      </p>
      <p className={`text-3xl font-bold mt-2 ${colorMap[meta.color] || "text-foreground"}`}>
        {formatValue(value, meta.fmt)}
      </p>
    </div>
  );
}
