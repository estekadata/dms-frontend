"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, TrendingUp, Target, BarChart3, Euro,
  PackageOpen, Search, Cog, ClipboardList, History,
  Wrench, Building2, Users, LogOut, Inbox, RefreshCw, X,
} from "lucide-react";

const navSections = [
  {
    title: "Commercial",
    items: [
      { label: "Ventes", href: "/ventes", icon: TrendingUp },
      { label: "Besoins", href: "/besoins", icon: Target },
      { label: "Analyse", href: "/analyse", icon: BarChart3 },
      { label: "Mise à jour prix", href: "/prix", icon: Euro },
    ],
  },
  {
    title: "Gestion interne",
    items: [
      { label: "Réceptions", href: "/receptions", icon: PackageOpen },
      { label: "Moteurs", href: "/moteurs", icon: Search },
      { label: "Boîtes", href: "/boites", icon: Cog },
      { label: "Réservations", href: "/reservations", icon: ClipboardList },
      { label: "Historique", href: "/historique", icon: History },
    ],
  },
  {
    title: "Outils",
    items: [
      { label: "Pièces détachées", href: "/pieces", icon: Wrench },
      { label: "Centres VHU", href: "/vhu", icon: Building2 },
    ],
  },
];

interface SidebarProps {
  userName?: string;
  userRole?: string;
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ userName, userRole, open = false, onClose = () => {} }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const roleLabel = { super_admin: "Super Admin", admin: "Admin", vhu: "VHU" }[userRole || "admin"] || userRole;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-border bg-surface transition-transform duration-200 md:z-40 md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}
    >
      {/* Header */}
      <div className="relative border-b border-border p-6 text-center">
        <button
          onClick={onClose}
          aria-label="Fermer le menu"
          className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-lg text-text-dim transition hover:bg-surface-hover md:hidden"
        >
          <X size={18} />
        </button>
        <h1 className="font-heading text-lg font-bold tracking-wide text-foreground">MULTIREX AUTO</h1>
        {userName && (
          <p className="text-xs mt-1 text-text-dim">{userName} ({roleLabel})</p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {/* Home */}
        <Link
          href="/dashboard"
          onClick={onClose}
          className={cn(
            "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
            pathname === "/dashboard"
              ? "bg-brand-soft text-brand"
              : "text-text-dim hover:bg-surface-hover hover:text-foreground"
          )}
        >
          <LayoutDashboard size={18} /> Tableau de bord
        </Link>

        {navSections.map((section) => (
          <div key={section.title}>
            <p className="px-4 text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted mb-2">
              {section.title}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                    pathname === item.href
                      ? "bg-brand-soft text-brand"
                      : "text-text-dim hover:bg-surface-hover hover:text-foreground"
                  )}
                >
                  <item.icon size={18} /> {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}

        {userRole === "super_admin" && (
          <div>
            <p className="px-4 text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted mb-2">
              Administration
            </p>
            <div className="space-y-1">
              <Link
                href="/admin/utilisateurs"
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                  pathname === "/admin/utilisateurs"
                    ? "bg-brand-soft text-brand"
                    : "text-text-dim hover:bg-surface-hover hover:text-foreground"
                )}
              >
                <Users size={18} /> Utilisateurs
              </Link>
              <Link
                href="/admin/offres"
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                  pathname === "/admin/offres"
                    ? "bg-brand-soft text-brand"
                    : "text-text-dim hover:bg-surface-hover hover:text-foreground"
                )}
              >
                <Inbox size={18} /> Offres VHU
              </Link>
              <Link
                href="/admin/synchronisation"
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                  pathname === "/admin/synchronisation"
                    ? "bg-brand-soft text-brand"
                    : "text-text-dim hover:bg-surface-hover hover:text-foreground"
                )}
              >
                <RefreshCw size={18} /> Synchronisation
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-border">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-text-dim bg-surface-alt hover:bg-surface-hover transition-all"
        >
          <LogOut size={16} /> Se déconnecter
        </button>
      </div>
    </aside>
  );
}
