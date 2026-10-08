"use client";
import { useRef, useState } from "react";
import { Plus, X, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";

// Pages ouvrables dans un onglet de l'espace de travail.
const PAGES: { label: string; route: string }[] = [
  { label: "Tableau de bord", route: "/dashboard" },
  { label: "Moteurs", route: "/moteurs" },
  { label: "Boîtes", route: "/boites" },
  { label: "Réceptions", route: "/receptions" },
  { label: "Réservations", route: "/reservations" },
  { label: "Synthèse réservations", route: "/reservations/synthese" },
  { label: "Aide à la commande", route: "/recherches" },
  { label: "Pièces détachées", route: "/pieces" },
  { label: "États & rapports", route: "/etats" },
  { label: "Constructeur d'états", route: "/etats/constructeur" },
  { label: "Historique", route: "/historique" },
  { label: "Besoins", route: "/besoins" },
  { label: "Analyse", route: "/analyse" },
  { label: "Ventes", route: "/ventes" },
  { label: "Mise à jour prix", route: "/prix" },
];

type Tab = { id: number; label: string; route: string };

export default function WorkspacePage() {
  const nextId = useRef(2);
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, label: "Moteurs", route: "/moteurs" }]);
  const [activeId, setActiveId] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);

  function openPage(p: { label: string; route: string }) {
    const id = nextId.current++;
    setTabs((t) => [...t, { id, label: p.label, route: p.route }]);
    setActiveId(id);
    setMenuOpen(false);
  }

  function closeTab(id: number) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (id === activeId && next.length) setActiveId(next[next.length - 1].id);
      return next;
    });
  }

  function reloadActive() {
    const f = document.getElementById(`ws-frame-${activeId}`) as HTMLIFrameElement | null;
    if (f) f.src = f.src;
  }

  const embedSrc = (route: string) => `${route}${route.includes("?") ? "&" : "?"}embed=1`;

  return (
    <div className="flex h-[calc(100vh-1rem)] flex-col md:h-[calc(100vh-4rem)]">
      <PageHeader title="Espace de travail" description="Ouvre plusieurs pages en parallèle — chaque onglet garde son état." />

      {/* Barre d'onglets */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <div
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-t-lg border-b-2 px-3 py-2 text-sm transition ${
                t.id === activeId
                  ? "border-brand bg-surface font-semibold text-foreground"
                  : "border-transparent bg-surface-alt text-text-dim hover:bg-surface-hover"
              }`}
            >
              <span className="max-w-[160px] truncate">{t.label}</span>
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                className="rounded p-0.5 text-text-muted hover:bg-surface-hover hover:text-destructive"
                aria-label="Fermer l'onglet"
              >
                <X size={13} />
              </button>
            </div>
          ))}

          {/* Ajouter un onglet */}
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-text-dim transition hover:bg-surface-hover hover:text-foreground"
            >
              <Plus size={16} /> Ouvrir une page
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute left-0 top-full z-20 mt-1 max-h-[60vh] w-64 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-xl">
                  {PAGES.map((p) => (
                    <button
                      key={p.route}
                      onClick={() => openPage(p)}
                      className="block w-full px-3 py-2 text-left text-sm text-text-dim transition hover:bg-surface-hover hover:text-foreground"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {tabs.length > 0 && (
          <button
            onClick={reloadActive}
            title="Recharger l'onglet actif"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-2 text-xs text-text-dim transition hover:bg-surface-hover hover:text-foreground"
          >
            <RefreshCw size={13} /> Recharger
          </button>
        )}
      </div>

      {/* Cadres (un par onglet, seul l'actif est visible — l'état est conservé) */}
      <div className="relative flex-1 overflow-hidden rounded-[14px] border border-border bg-surface">
        {tabs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm italic text-text-muted">
            Clique « Ouvrir une page » pour démarrer.
          </div>
        ) : (
          tabs.map((t) => (
            <iframe
              key={t.id}
              id={`ws-frame-${t.id}`}
              src={embedSrc(t.route)}
              title={t.label}
              className="absolute inset-0 h-full w-full"
              style={{ visibility: t.id === activeId ? "visible" : "hidden" }}
            />
          ))
        )}
      </div>
    </div>
  );
}
