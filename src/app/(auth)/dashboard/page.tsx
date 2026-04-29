"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { Button } from "@/components/ui/button";
import { KPI_CATALOG, DEFAULT_KPIS, type DashboardKpis } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardKpis } from "@/lib/queries/dashboard";
import {
  TrendingUp, Target, BarChart3, Euro,
  PackageOpen, Search, Cog, ClipboardList,
  History, Wrench, Building2,
} from "lucide-react";

const navGrid = [
  { title: "Commercial", items: [
    { label: "Ventes", desc: "Analyse des ventes", href: "/ventes", icon: TrendingUp },
    { label: "Besoins", desc: "Besoins centres VHU", href: "/besoins", icon: Target },
    { label: "Analyse", desc: "Statistiques", href: "/analyse", icon: BarChart3 },
    { label: "Mise a jour prix", desc: "Propositions achat", href: "/prix", icon: Euro },
  ]},
  { title: "Gestion interne", items: [
    { label: "Receptions", desc: "Gestion des arrivages", href: "/receptions", icon: PackageOpen },
    { label: "Moteurs", desc: "Identification moteurs", href: "/moteurs", icon: Search },
    { label: "Boites", desc: "Identification BV", href: "/boites", icon: Cog },
    { label: "Reservations", desc: "Reservations clients", href: "/reservations", icon: ClipboardList },
  ]},
  { title: "Outils", items: [
    { label: "Historique", desc: "Receptions & expeditions", href: "/historique", icon: History },
    { label: "Pieces Detachees", desc: "Stock alternateurs...", href: "/pieces", icon: Wrench },
    { label: "Centres VHU", desc: "Interface centres VHU", href: "/vhu", icon: Building2 },
  ]},
];

const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function isoMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseIsoMonth(s: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month };
}

export default function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);

  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;

  useEffect(() => {
    setKpis(null);
    getDashboardKpis(year, month).then(setKpis).catch(console.error);
  }, [year, month]);

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    setYear(y);
    setMonth(m);
  }

  function goCurrent() {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  }

  return (
    <div>
      <div className="text-center mb-6">
        <h1 className="font-heading text-3xl font-bold text-foreground">Tableau de bord</h1>
        <p className="text-text-dim mt-1 text-sm">Choisissez une section pour commencer</p>
      </div>

      {/* Sélecteur de mois */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)} title="Mois précédent">
          <ChevronLeft size={14} />
        </Button>
        <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-1.5">
          <Calendar size={14} className="text-text-dim" />
          <input
            type="month"
            value={isoMonth(year, month)}
            onChange={(e) => {
              const parsed = parseIsoMonth(e.target.value);
              if (parsed) {
                setYear(parsed.year);
                setMonth(parsed.month);
              }
            }}
            className="bg-transparent text-sm text-foreground font-medium border-none outline-none"
          />
          <span className="text-sm text-text-dim hidden sm:inline">
            ({MOIS[month - 1]} {year})
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => shiftMonth(1)} title="Mois suivant">
          <ChevronRight size={14} />
        </Button>
        {!isCurrent && (
          <Button variant="ghost" size="sm" onClick={goCurrent}>
            Mois courant
          </Button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {kpis
          ? DEFAULT_KPIS.map((key) => (
              <KpiCard key={key} meta={KPI_CATALOG[key]} value={kpis[key as keyof DashboardKpis] as number} />
            ))
          : Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-[14px] bg-surface-alt" />
            ))}
      </div>

      {/* Tendance */}
      {kpis && (() => {
        const deltaVentes = (kpis.ventes_mois ?? 0) - (kpis.ventes_mois_prec ?? 0);
        const deltaCa = (kpis.ca_mois ?? 0) - (kpis.ca_mois_prec ?? 0);
        return (
          <div className="bg-surface border border-border rounded-[14px] px-5 py-3 mb-8 flex gap-6 text-sm text-text-dim">
            <span>Tendance vs mois précédent :</span>
            <span className={deltaVentes >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
              {deltaVentes >= 0 ? "+" : ""}{deltaVentes} ventes
            </span>
            <span className={deltaCa >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
              {deltaCa >= 0 ? "+" : ""}{Math.round(deltaCa).toLocaleString("fr-FR")} EUR CA
            </span>
          </div>
        );
      })()}

      {/* Navigation Grid */}
      {navGrid.map((section) => (
        <div key={section.title} className="mb-8">
          <h2 className="text-base font-semibold text-text-dim mb-3">{section.title}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="bg-surface border border-border rounded-[14px] p-5 hover:bg-surface-hover hover:-translate-y-0.5 transition-all group"
              >
                <div className="mb-3 text-brand group-hover:scale-110 transition-transform">
                  <item.icon size={28} strokeWidth={1.8} />
                </div>
                <h3 className="font-semibold text-foreground">{item.label}</h3>
                <p className="text-xs text-text-dim mt-1">{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
