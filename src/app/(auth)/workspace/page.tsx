"use client";
import { useRef, useState, type CSSProperties } from "react";
import { Plus, X } from "lucide-react";
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
  const [split, setSplit] = useState(false);
  const [leftId, setLeftId] = useState(1);
  const [rightId, setRightId] = useState(0);

  function openPage(p: { label: string; route: string }) {
    const id = nextId.current++;
    setTabs((t) => [...t, { id, label: p.label, route: p.route }]);
    if (split) setRightId(id);
    else setActiveId(id);
    setMenuOpen(false);
  }

  function closeTab(id: number) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (id === activeId) setActiveId(next.length ? next[next.length - 1].id : 0);
      if (id === leftId) setLeftId(next[0]?.id ?? 0);
      if (id === rightId) setRightId(next.find((t) => t.id !== leftId)?.id ?? 0);
      return next;
    });
  }

  function toggleSplit() {
    if (!split) {
      setLeftId(activeId);
      setRightId(tabs.find((t) => t.id !== activeId)?.id ?? 0);
      setSplit(true);
    } else {
      if (leftId) setActiveId(leftId);
      setSplit(false);
    }
  }

  const embedSrc = (route: string) => `${route}${route.includes("?") ? "&" : "?"}embed=1`;

  function frameStyle(id: number): CSSProperties {
    const base: CSSProperties = { position: "absolute", top: 0, bottom: 0, border: 0 };
    if (split) {
      if (id === leftId) return { ...base, left: 0, width: rightId && rightId !== leftId ? "50%" : "100%" };
      if (id === rightId && rightId !== leftId) return { ...base, left: "50%", width: "50%" };
      return { ...base, left: 0, width: "100%", visibility: "hidden" };
    }
    if (id === activeId) return { ...base, left: 0, width: "100%" };
    return { ...base, left: 0, width: "100%", visibility: "hidden" };
  }

  const paneSelect = (value: number, onChange: (id: number) => void) => (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-lg border border-border bg-surface-alt px-2 py-1 text-xs text-foreground"
    >
      {tabs.map((t) => (
        <option key={t.id} value={t.id}>{t.label}</option>
      ))}
    </select>
  );

  return (
    <div className="flex h-[calc(100vh-1rem)] flex-col md:h-[calc(100vh-4rem)]">
      <PageHeader title="Espace de travail" description="Ouvre plusieurs pages en parallèle — chaque onglet garde son état." />

      {/* Barre d'onglets */}
      <div className="relative z-40 mb-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <div
              key={t.id}
              onClick={() => (split ? setLeftId(t.id) : setActiveId(t.id))}
              className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-t-lg border-b-2 px-3 py-2 text-sm transition ${
                (split ? t.id === leftId || t.id === rightId : t.id === activeId)
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
        </div>

        {/* Ajouter un onglet (hors de la zone à défilement pour que le menu ne soit pas coupé) */}
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-brand transition hover:bg-brand-soft"
          >
            <Plus size={16} /> Ouvrir une page
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-1 max-h-[60vh] w-64 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-xl">
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

        {tabs.length > 0 && (
          <button
            onClick={toggleSplit}
            title={split ? "Repasser en plein écran" : "Afficher deux pages côte à côte"}
            className={`shrink-0 rounded-lg border px-2 py-2 text-xs font-medium transition ${
              split ? "border-brand bg-brand-soft text-brand" : "border-border text-text-dim hover:bg-surface-hover hover:text-foreground"
            }`}
          >
            {split ? "Plein écran" : "Écran divisé"}
          </button>
        )}
      </div>

      {/* Sélecteurs de volets en mode divisé */}
      {split && tabs.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-dim">
          <span className="inline-flex items-center gap-1">Volet gauche : {paneSelect(leftId, setLeftId)}</span>
          <span className="inline-flex items-center gap-1">Volet droit : {paneSelect(rightId, setRightId)}</span>
        </div>
      )}

      {/* Cadres (un par onglet, repositionnés selon le mode — l'état est conservé) */}
      <div className="relative z-0 flex-1 overflow-hidden rounded-[14px] border border-border bg-surface">
        {tabs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm italic text-text-muted">
            Clique « Ouvrir une page » pour démarrer.
          </div>
        ) : (
          <>
            {tabs.map((t) => (
              <iframe key={t.id} id={`ws-frame-${t.id}`} src={embedSrc(t.route)} title={t.label} className="h-full w-full" style={frameStyle(t.id)} />
            ))}
            {/* Séparateur central en mode divisé */}
            {split && rightId !== 0 && rightId !== leftId && (
              <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-px -translate-x-1/2 bg-border" />
            )}
          </>
        )}
      </div>
    </div>
  );
}
