"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KpiCard } from "@/components/kpi-card";
import { KPI_CATALOG, DEFAULT_KPIS, type DashboardKpis } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardKpis } from "@/lib/queries/dashboard";
import { supabase } from "@/lib/supabase";
import {
  TrendingUp, Target, BarChart3, Euro,
  PackageOpen, Search, Cog, ClipboardList,
  History, Wrench, Building2, AlertTriangle, Inbox, RefreshCw,
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

type Tone = "brand" | "amber" | "red" | "green" | "muted";
const toneCls: Record<Tone, string> = {
  brand: "text-brand",
  amber: "text-amber-600",
  red: "text-destructive",
  green: "text-emerald-600",
  muted: "text-text-dim",
};

type AlertData = {
  rupture: number;
  pending: number;
  lastSync: string | null;
  top: any[];
};

function AlertCard({
  href,
  icon: Icon,
  tone,
  value,
  label,
  sub,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  tone: Tone;
  value: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-[14px] border border-border bg-surface p-5 transition-all hover:-translate-y-0.5 hover:bg-surface-hover"
    >
      <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-alt ${toneCls[tone]}`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <p className={`text-2xl font-bold leading-none ${toneCls[tone]}`}>{value}</p>
        <p className="mt-1 text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-text-dim">{sub}</p>
      </div>
    </Link>
  );
}

function syncInfo(iso: string | null): { label: string; sub: string; tone: Tone } {
  if (!iso) return { label: "jamais", sub: "Aucune synchronisation", tone: "red" };
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  const label = h < 1 ? "à l'instant" : h < 24 ? `il y a ${Math.floor(h)} h` : `il y a ${Math.floor(h / 24)} j`;
  if (h < 30) return { label, sub: "Données à jour", tone: "green" };
  if (h < 72) return { label, sub: "Synchro en retard", tone: "amber" };
  return { label, sub: "Aucune synchro récente", tone: "red" };
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [alerts, setAlerts] = useState<AlertData | null>(null);

  useEffect(() => {
    getDashboardKpis().then(setKpis).catch(console.error);
  }, []);

  useEffect(() => {
    (async () => {
      const [rup, pend, sync, top] = await Promise.all([
        supabase.from("v_besoins").select("code_moteur", { count: "exact", head: true }).eq("stock_dispo", 0).gt("quantite", 0),
        supabase.from("breaker_click_offers").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("import_log").select("finished_at").order("id", { ascending: false }).limit(1),
        supabase.from("v_besoins").select("code_moteur, marque, quantite, stock_dispo, prix_moyen").order("quantite", { ascending: false }).limit(5),
      ]);
      setAlerts({
        rupture: rup.count || 0,
        pending: pend.count || 0,
        lastSync: (sync.data as any)?.[0]?.finished_at || null,
        top: top.data || [],
      });
    })().catch(console.error);
  }, []);

  const sync = alerts ? syncInfo(alerts.lastSync) : null;

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="font-heading text-3xl font-bold text-foreground">Tableau de bord</h1>
        <p className="mt-1 text-sm text-text-dim">Vue d&apos;ensemble et actions prioritaires</p>
      </div>

      {/* Alertes & actions */}
      {alerts && sync ? (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <AlertCard
              href="/besoins"
              icon={AlertTriangle}
              tone={alerts.rupture > 0 ? "brand" : "muted"}
              value={alerts.rupture.toLocaleString("fr-FR")}
              label="recherchés en rupture"
              sub="Stock épuisé & demandés → à sourcer"
            />
            <AlertCard
              href="/admin/offres"
              icon={Inbox}
              tone={alerts.pending > 0 ? "amber" : "muted"}
              value={alerts.pending.toLocaleString("fr-FR")}
              label="offres VHU en attente"
              sub="À valider côté admin"
            />
            <AlertCard
              href="/admin/synchronisation"
              icon={RefreshCw}
              tone={sync.tone}
              value={sync.label}
              label="dernière synchro"
              sub={sync.sub}
            />
          </div>

          {/* Top besoins */}
          {alerts.top.length > 0 && (
            <div className="mb-8 rounded-[14px] border border-border bg-surface p-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-semibold text-text-dim">Top besoins — les plus demandés</h2>
                <Link href="/besoins" className="text-sm text-brand hover:underline">Tout voir →</Link>
              </div>
              <div className="divide-y divide-border">
                {alerts.top.map((b, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{b.code_moteur}</p>
                      <p className="text-xs text-text-dim">
                        {[b.marque, `${b.quantite} vendus/6 mois`].filter(Boolean).join(" · ")}
                        {(b.stock_dispo ?? 0) === 0 && <span className="ml-1 font-semibold text-brand">· en rupture</span>}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold text-brand">
                      {b.prix_moyen ? `${Math.round(b.prix_moyen).toLocaleString("fr-FR")} €` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-[14px] bg-surface-alt" />)}
        </div>
      )}

      {/* KPIs */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
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
          <div className="mb-8 flex flex-wrap gap-x-6 gap-y-1 rounded-[14px] border border-border bg-surface px-5 py-3 text-sm text-text-dim">
            <span>Tendance vs mois précédent :</span>
            <span className={deltaVentes >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
              {deltaVentes >= 0 ? "+" : ""}{deltaVentes} ventes
            </span>
            <span className={deltaCa >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
              {deltaCa >= 0 ? "+" : ""}{Math.round(deltaCa).toLocaleString("fr-FR")} EUR CA
            </span>
          </div>
        );
      })()}

      {/* Navigation */}
      {navGrid.map((section) => (
        <div key={section.title} className="mb-8">
          <h2 className="mb-3 text-base font-semibold text-text-dim">{section.title}</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-[14px] border border-border bg-surface p-5 transition-all hover:-translate-y-0.5 hover:bg-surface-hover"
              >
                <div className="mb-3 text-brand transition-transform group-hover:scale-110">
                  <item.icon size={28} strokeWidth={1.8} />
                </div>
                <h3 className="font-semibold text-foreground">{item.label}</h3>
                <p className="mt-1 text-xs text-text-dim">{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
