import { type KpiMeta } from "@/lib/types";

const gradients: Record<string, string> = {
  emerald: "from-emerald-500 to-teal-600",
  amber: "from-amber-400 to-orange-500",
  red: "from-rose-500 to-red-600",
  blue: "from-blue-500 to-indigo-600",
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
  const gradient = gradients[meta.color] || gradients.red;

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-5 text-white shadow-lg transition-all hover:scale-[1.03] hover:shadow-xl`}>
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-white/10 blur-xl" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{meta.icon}</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/80">
            {meta.label}
          </span>
        </div>
        <p className="text-3xl font-black tracking-tight">
          {formatValue(value, meta.fmt)}
        </p>
      </div>
    </div>
  );
}
