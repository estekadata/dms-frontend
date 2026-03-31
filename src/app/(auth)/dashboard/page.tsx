"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KpiCard } from "@/components/kpi-card";
import { KPI_CATALOG, DEFAULT_KPIS, type DashboardKpis } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardKpis } from "@/lib/queries/dashboard";

const navGrid = [
  { title: "Commercial", color: "from-rose-500/10 to-red-500/5", items: [
    { label: "Ventes", desc: "Analyse des ventes", href: "/ventes", icon: "📈", accent: "bg-rose-100 text-rose-700" },
    { label: "Besoins", desc: "Besoins centres VHU", href: "/besoins", icon: "🎯", accent: "bg-orange-100 text-orange-700" },
    { label: "Analyse", desc: "Statistiques avancees", href: "/analyse", icon: "📊", accent: "bg-violet-100 text-violet-700" },
    { label: "Mise a jour prix", desc: "Propositions achat", href: "/prix", icon: "💶", accent: "bg-emerald-100 text-emerald-700" },
  ]},
  { title: "Gestion interne", color: "from-blue-500/10 to-indigo-500/5", items: [
    { label: "Receptions", desc: "Gestion des arrivages", href: "/receptions", icon: "📥", accent: "bg-blue-100 text-blue-700" },
    { label: "Moteurs", desc: "Identification moteurs", href: "/moteurs", icon: "🔍", accent: "bg-cyan-100 text-cyan-700" },
    { label: "Boites", desc: "Identification BV", href: "/boites", icon: "⚙️", accent: "bg-slate-100 text-slate-700" },
    { label: "Reservations", desc: "Reservations clients", href: "/reservations", icon: "📋", accent: "bg-amber-100 text-amber-700" },
  ]},
  { title: "Outils", color: "from-emerald-500/10 to-teal-500/5", items: [
    { label: "Historique", desc: "Receptions & expeditions", href: "/historique", icon: "📜", accent: "bg-gray-100 text-gray-700" },
    { label: "Pieces Detachees", desc: "Stock alternateurs...", href: "/pieces", icon: "🔩", accent: "bg-teal-100 text-teal-700" },
    { label: "Centres VHU", desc: "Interface centres VHU", href: "/vhu", icon: "🛠️", accent: "bg-red-100 text-red-700" },
  ]},
];

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);

  useEffect(() => {
    getDashboardKpis().then(setKpis).catch(console.error);
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#C41E3A] to-[#8B1A2B] p-8 text-white shadow-xl">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5 blur-2xl" />
        <div className="relative">
          <h1 className="text-3xl font-black tracking-tight">Tableau de bord</h1>
          <p className="text-white/70 mt-1">Vue d&apos;ensemble de votre activite</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis
          ? DEFAULT_KPIS.map((key) => (
              <KpiCard key={key} meta={KPI_CATALOG[key]} value={kpis[key as keyof DashboardKpis] as number} />
            ))
          : Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
      </div>

      {/* Tendance */}
      {kpis && (
        <div className="flex items-center gap-4 rounded-2xl bg-white/80 backdrop-blur px-6 py-4 shadow-sm border border-gray-100">
          <span className="text-sm text-gray-400 font-medium">Tendance vs mois precedent</span>
          <div className={`px-3 py-1 rounded-full text-sm font-bold ${kpis.ventes_mois - kpis.ventes_mois_prec >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
            {kpis.ventes_mois - kpis.ventes_mois_prec >= 0 ? "+" : ""}{kpis.ventes_mois - kpis.ventes_mois_prec} ventes
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-bold ${kpis.ca_mois - kpis.ca_mois_prec >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
            {kpis.ca_mois - kpis.ca_mois_prec >= 0 ? "+" : ""}{Math.round(kpis.ca_mois - kpis.ca_mois_prec).toLocaleString("fr-FR")} EUR
          </div>
        </div>
      )}

      {/* Navigation Grid */}
      {navGrid.map((section) => (
        <div key={section.title}>
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">{section.title}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-white opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${item.accent} text-xl mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    {item.icon}
                  </div>
                  <h3 className="font-bold text-gray-900 text-[15px]">{item.label}</h3>
                  <p className="text-xs text-gray-400 mt-1">{item.desc}</p>
                </div>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 group-hover:text-gray-400 group-hover:translate-x-1 transition-all">
                  →
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
