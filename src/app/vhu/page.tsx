"use client";
import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Search,
  LogOut,
  Truck,
  Check,
  X,
  Clock,
  Plus,
  TrendingUp,
  Loader2,
  PackageSearch,
} from "lucide-react";

/* ══════════════════════════ TYPES ══════════════════════════ */
type Besoin = {
  code_moteur: string;
  marque?: string | null;
  energie?: string | null;
  type_moteur?: string | null;
  urgence?: number;
  quantite?: number;
  stock_dispo?: number;
  prix_moyen: number;
};
type Offer = {
  id: number;
  code_moteur: string;
  marque?: string | null;
  energie?: string | null;
  prix_demande?: number | null;
  qty?: number | null;
  status: string;
  created_at?: string;
};
type Plaque = {
  plaque: string;
  code_moteur?: string | null;
  marque?: string | null;
  modele?: string | null;
};
type SortKey = "priorite" | "quantite" | "prix_moyen" | "code_moteur";

/* ══════════════════════════ HELPERS ══════════════════════════ */
function isRupture(b: Besoin): boolean {
  return (b.stock_dispo ?? 0) === 0 && (b.quantite ?? 0) > 0;
}
// Le badge suit la priorité CURÉE par le client (colonne `urgence`, qui est un
// override manuel dans ~97% des cas). La rupture de stock (objective) est
// affichée à part, et le nb de ventes/6 mois donne le contexte.
function demande(b: Besoin): { label: string; cls: string; dot: string } {
  const u = b.urgence ?? 0;
  if (u >= 8) return { label: "Très recherché", cls: "bg-amber-500/10 text-amber-600", dot: "bg-amber-500" };
  if (u >= 5) return { label: "Recherché", cls: "bg-emerald-500/10 text-emerald-600", dot: "bg-emerald-500" };
  if (u >= 3) return { label: "Demandé", cls: "bg-surface-hover text-text-dim", dot: "bg-text-dim" };
  return { label: "Occasionnel", cls: "bg-surface-hover text-text-muted", dot: "bg-text-muted" };
}
function statut(s: string): { label: string; cls: string } {
  if (s === "accepted") return { label: "Acceptée", cls: "bg-emerald-500/10 text-emerald-600" };
  if (s === "rejected") return { label: "Refusée", cls: "bg-destructive/10 text-destructive" };
  return { label: "En attente", cls: "bg-amber-500/10 text-amber-600" };
}
const isPlate = (s: string) => /^[A-Z]{2}[-\s]?\d{3}[-\s]?[A-Z]{2}$/i.test(s.trim());
const fmtEuro = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));
function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "à l'instant";
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "hier";
  if (d < 7) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}
const ENERGIES = ["Diesel", "Essence", "Électrique"];
function matchEnergy(e: string | null | undefined, filter: string): boolean {
  const v = (e || "").toLowerCase();
  if (filter === "Électrique") return /electr|électr/.test(v);
  return v.includes(filter.toLowerCase());
}

/* ══════════════════════════ BOTTOM SHEET ══════════════════════════ */
function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      <div className="relative w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-card shadow-2xl ring-1 ring-foreground/10 animate-in slide-in-from-bottom duration-200 sm:max-w-md sm:rounded-3xl sm:duration-150 sm:zoom-in-95">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <h3 className="font-heading text-lg font-semibold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full text-text-dim transition hover:bg-surface-hover hover:text-foreground"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ══════════════════════════ CARTE BESOIN ══════════════════════════ */
function BesoinCard({ b, onClaim, claimed }: { b: Besoin; onClaim: (b: Besoin) => void; claimed: boolean }) {
  const d = demande(b);
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 transition ${
        claimed ? "ring-emerald-500/40" : "ring-foreground/10 hover:ring-foreground/20"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-lg font-bold text-foreground">{b.code_moteur}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {isRupture(b) && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                <span className="size-1.5 rounded-full bg-brand" /> En rupture
              </span>
            )}
            {b.marque && (
              <span className="whitespace-nowrap rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-dim">{b.marque}</span>
            )}
            {b.energie && (
              <span className="whitespace-nowrap rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-dim">{b.energie}</span>
            )}
            {(b.quantite ?? 0) > 0 && (
              <span className="whitespace-nowrap rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-muted">
                {b.quantite} vendus/6 mois
              </span>
            )}
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${d.cls}`}>
          <span className={`size-1.5 rounded-full ${d.dot}`} />
          {d.label}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3 border-t border-border pt-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">On rachète à</p>
          {b.prix_moyen > 0 ? (
            <p className="text-2xl font-bold leading-tight text-brand">{fmtEuro(b.prix_moyen)}&nbsp;€</p>
          ) : (
            <p className="text-sm font-medium leading-tight text-text-dim">Prix à proposer</p>
          )}
        </div>
        {claimed ? (
          <Button
            onClick={() => onClaim(b)}
            variant="outline"
            className="h-11 shrink-0 rounded-xl px-5 text-sm font-semibold text-emerald-600 ring-1 ring-emerald-500/30"
          >
            <Check size={16} className="mr-1.5" /> Proposé
          </Button>
        ) : (
          <Button
            onClick={() => onClaim(b)}
            className="h-11 shrink-0 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand/90"
          >
            <Check size={16} className="mr-1.5" /> Je l&apos;ai
          </Button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════ CARTE MON OFFRE ══════════════════════════ */
function MyOfferCard({
  o,
  onDeliver,
  onDismiss,
  busy,
}: {
  o: Offer;
  onDeliver: (id: number) => void;
  onDismiss: (id: number, status: string) => void;
  busy: boolean;
}) {
  const s = statut(o.status);
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-base font-bold text-foreground">{o.code_moteur}</p>
          <p className="mt-0.5 text-xs text-text-dim">
            {[o.marque, timeAgo(o.created_at)].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>{s.label}</span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex items-baseline gap-3 text-sm">
          <span className="font-semibold text-foreground">
            {o.prix_demande != null ? `${fmtEuro(o.prix_demande)} €` : "—"}
          </span>
          <span className="text-text-dim">× {o.qty ?? 1}</span>
        </div>
        {o.status === "accepted" ? (
          <Button
            disabled={busy}
            onClick={() => onDeliver(o.id)}
            className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <><Truck size={15} className="mr-1.5" /> Livrer</>}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => onDismiss(o.id, o.status)}
            className="h-10 rounded-xl px-4 text-sm"
          >
            {o.status === "pending" ? "Annuler" : "Effacer"}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════ PORTAIL ══════════════════════════ */
function VhuPortal({ centreId, centreName }: { centreId: string; centreName: string }) {
  const [besoins, setBesoins] = useState<Besoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"recherche" | "offres">("recherche");

  const [search, setSearch] = useState("");
  const [plaqueResults, setPlaqueResults] = useState<Plaque[] | null>(null);
  const [plaqueLoading, setPlaqueLoading] = useState(false);
  const [lockedCode, setLockedCode] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("priorite");
  const [energyFilter, setEnergyFilter] = useState<string | null>(null);
  const [visible, setVisible] = useState(24);

  const [myOffers, setMyOffers] = useState<Offer[]>([]);
  const [delivering, setDelivering] = useState<number | null>(null);
  const [todayCount, setTodayCount] = useState(0);

  // Sheet "Je l'ai"
  const [claimTarget, setClaimTarget] = useState<Besoin | null>(null);
  const [offerPrix, setOfferPrix] = useState("");
  const [offerQty, setOfferQty] = useState("1");
  const [offerNote, setOfferNote] = useState("");
  const [offerSubmitting, setOfferSubmitting] = useState(false);

  // Sheet "Proposer un moteur"
  const [freeOpen, setFreeOpen] = useState(false);
  const [freeCode, setFreeCode] = useState("");
  const [freeDesc, setFreeDesc] = useState("");
  const [freePrix, setFreePrix] = useState("");
  const [freeNote, setFreeNote] = useState("");
  const [freeSubmitting, setFreeSubmitting] = useState(false);

  /* ── data ── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("v_besoins").select("*").order("urgence", { ascending: false }).limit(2000);
      setBesoins((data as Besoin[]) || []);
      setLoading(false);
    })();
  }, []);

  const loadMyOffers = useCallback(async () => {
    const { data } = await supabase
      .from("breaker_click_offers")
      .select("id, code_moteur, marque, energie, prix_demande, qty, status, created_at")
      .eq("breaker_id", centreId)
      .neq("status", "delivered")
      .order("created_at", { ascending: false })
      .limit(100);
    setMyOffers((data as Offer[]) || []);
  }, [centreId]);

  useEffect(() => {
    loadMyOffers();
  }, [loadMyOffers]);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().substring(0, 10);
      const { count } = await supabase
        .from("breaker_click_offers")
        .select("id", { count: "exact", head: true })
        .eq("breaker_id", centreId)
        .gte("created_at", today);
      setTodayCount(count || 0);
    })();
  }, [centreId]);

  /* ── recherche plaque ── */
  async function searchPlate() {
    const q = search.trim();
    if (!q || !isPlate(q)) return;
    setPlaqueLoading(true);
    const normalized = q.toUpperCase().replace(/[-\s]/g, "");
    const { data } = await supabase
      .from("plaques_vehicules")
      .select("*")
      .or(`plaque.ilike.%${normalized}%,plaque.ilike.%${q.toUpperCase()}%`)
      .limit(10);
    setPlaqueResults((data as Plaque[]) || []);
    setPlaqueLoading(false);
  }

  /* ── filtre + tri ── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = besoins;
    if (lockedCode) {
      const lc = lockedCode.toLowerCase();
      list = list.filter((b) => b.code_moteur?.toLowerCase() === lc);
    } else if (q && !isPlate(search)) {
      list = list.filter(
        (b) =>
          b.code_moteur?.toLowerCase().includes(q) ||
          b.marque?.toLowerCase().includes(q) ||
          b.energie?.toLowerCase().includes(q) ||
          b.type_moteur?.toLowerCase().includes(q)
      );
    }
    if (energyFilter) list = list.filter((b) => matchEnergy(b.energie, energyFilter));
    return [...list].sort((a, b) => {
      if (sortKey === "code_moteur") return (a.code_moteur || "").localeCompare(b.code_moteur || "");
      if (sortKey === "priorite") {
        // rupture d'abord, puis priorité client (urgence), puis volume de ventes
        const r = (isRupture(b) ? 1 : 0) - (isRupture(a) ? 1 : 0);
        if (r !== 0) return r;
        const u = (b.urgence ?? 0) - (a.urgence ?? 0);
        if (u !== 0) return u;
        return (b.quantite ?? 0) - (a.quantite ?? 0);
      }
      const key = sortKey === "prix_moyen" ? "prix_moyen" : "quantite";
      return ((b[key] as number) ?? 0) - ((a[key] as number) ?? 0); // demande & prix : décroissant
    });
  }, [besoins, search, lockedCode, sortKey, energyFilter]);

  useEffect(() => setVisible(24), [search, lockedCode, sortKey, energyFilter]);
  const shown = filtered.slice(0, visible);

  /* ── actions offres ── */
  function openClaim(b: Besoin) {
    setClaimTarget(b);
    // Pré-rempli au prix de reprise indicatif → offre en 1 tap.
    setOfferPrix(b.prix_moyen > 0 ? String(Math.round(b.prix_moyen)) : "");
    setOfferQty("1");
    setOfferNote("");
  }

  async function submitOffer() {
    if (!claimTarget || !offerPrix) return;
    setOfferSubmitting(true);
    const { error } = await supabase.from("breaker_click_offers").insert({
      breaker_id: centreId,
      code_moteur: claimTarget.code_moteur,
      marque: claimTarget.marque || null,
      energie: claimTarget.energie || null,
      prix_demande: parseFloat(offerPrix),
      qty: parseInt(offerQty) || 1,
      note: offerNote || null,
    });
    setOfferSubmitting(false);
    if (error) {
      toast.error("Erreur : " + error.message);
      return;
    }
    toast.success(`Offre envoyée pour ${claimTarget.code_moteur}`);
    setTodayCount((c) => c + 1);
    setClaimTarget(null);
    loadMyOffers();
  }

  async function submitFreeOffer() {
    if (!freeCode && !freeDesc) return;
    setFreeSubmitting(true);
    const { error } = await supabase.from("breaker_free_offers").insert({
      breaker_id: centreId,
      texte: freeDesc || freeCode || null,
      prix_demande: freePrix ? parseFloat(freePrix) : null,
      note: freeNote || null,
    });
    setFreeSubmitting(false);
    if (error) {
      toast.error("Erreur : " + error.message);
      return;
    }
    toast.success("Proposition envoyée !");
    setFreeCode("");
    setFreeDesc("");
    setFreePrix("");
    setFreeNote("");
    setFreeOpen(false);
  }

  async function deliverOffer(offerId: number) {
    setDelivering(offerId);
    const { error } = await supabase.rpc("vhu_deliver_offer", {
      p_offer_id: offerId,
      p_breaker_id: parseInt(centreId, 10),
    });
    setDelivering(null);
    if (error) {
      toast.error("Erreur livraison : " + error.message);
      return;
    }
    toast.success("Livraison confirmée. Merci !");
    loadMyOffers();
  }

  async function dismissOffer(offerId: number, status: string) {
    const { error } = await supabase
      .from("breaker_click_offers")
      .delete()
      .eq("id", offerId)
      .eq("breaker_id", parseInt(centreId, 10))
      .in("status", ["pending", "rejected"]);
    if (error) {
      toast.error("Erreur : " + error.message);
      return;
    }
    toast.success(status === "pending" ? "Offre annulée" : "Offre effacée");
    loadMyOffers();
  }

  async function handleLogout() {
    sessionStorage.removeItem("vhu_centre_id");
    sessionStorage.removeItem("vhu_centre_name");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    window.location.href = "/";
  }

  const showPlateCTA = isPlate(search) && !lockedCode;
  const acceptedCount = myOffers.filter((o) => o.status === "accepted").length;
  const pendingCount = myOffers.filter((o) => o.status === "pending").length;
  const acceptedValue = myOffers
    .filter((o) => o.status === "accepted")
    .reduce((sum, o) => sum + (o.prix_demande || 0) * (o.qty || 1), 0);
  const offeredCodes = useMemo(
    () =>
      new Set(
        myOffers
          .filter((o) => o.status === "pending" || o.status === "accepted")
          .map((o) => (o.code_moteur || "").toLowerCase())
      ),
    [myOffers]
  );

  const sortChips: { key: SortKey; label: string }[] = [
    { key: "priorite", label: "Recommandés" },
    { key: "quantite", label: "Plus vendus" },
    { key: "prix_moyen", label: "Prix ↓" },
    { key: "code_moteur", label: "Code A→Z" },
  ];

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-heading text-base font-semibold leading-tight text-foreground">Portail VHU</p>
            <p className="truncate text-xs text-text-dim">{centreName}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-lg font-bold leading-none text-brand">{todayCount}</p>
              <p className="text-[10px] uppercase text-text-muted">offres aujourd&apos;hui</p>
            </div>
            <Button
              variant="outline"
              onClick={handleLogout}
              className="h-9 rounded-xl px-3 text-sm"
              aria-label="Déconnexion"
            >
              <LogOut size={16} />
              <span className="ml-1.5 hidden sm:inline">Quitter</span>
            </Button>
          </div>
        </div>

        {/* Tabs segmentés */}
        <div className="mx-auto max-w-5xl px-4 pb-3">
          <div className="flex gap-1 rounded-2xl bg-surface-alt p-1">
            <button
              onClick={() => setView("recherche")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
                view === "recherche" ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/10" : "text-text-dim"
              }`}
            >
              <Search size={16} /> Recherche
            </button>
            <button
              onClick={() => setView("offres")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
                view === "offres" ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/10" : "text-text-dim"
              }`}
            >
              <Clock size={16} /> Mes offres
              {myOffers.length > 0 && (
                <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-white">
                  {myOffers.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        {/* ══════════ RECHERCHE ══════════ */}
        {view === "recherche" && (
          <>
            {/* Bandeau perso du centre (uniquement si activité) */}
            {myOffers.length > 0 && (
              <div className="mb-4 grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-card px-3 py-2.5 text-center ring-1 ring-foreground/10">
                  <p className="text-xl font-bold leading-none text-amber-600">{pendingCount}</p>
                  <p className="mt-1 text-[11px] text-text-muted">en attente</p>
                </div>
                <div className="rounded-2xl bg-card px-3 py-2.5 text-center ring-1 ring-foreground/10">
                  <p className="text-xl font-bold leading-none text-emerald-600">{acceptedCount}</p>
                  <p className="mt-1 text-[11px] text-text-muted">à livrer</p>
                </div>
                <div className="rounded-2xl bg-brand-soft px-3 py-2.5 text-center ring-1 ring-brand/20">
                  <p className="text-xl font-bold leading-none text-brand">{fmtEuro(acceptedValue)} €</p>
                  <p className="mt-1 text-[11px] text-text-muted">à encaisser</p>
                </div>
              </div>
            )}

            {/* Barre de recherche */}
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (!e.target.value) setPlaqueResults(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && showPlateCTA && searchPlate()}
                placeholder="Plaque (AA-123-BB), code moteur ou marque…"
                className="h-14 rounded-2xl border-border bg-card pl-11 pr-12 text-base uppercase shadow-sm"
              />
              {search && (
                <button
                  onClick={() => {
                    setSearch("");
                    setPlaqueResults(null);
                  }}
                  className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-hover hover:text-foreground"
                  aria-label="Effacer la recherche"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* CTA plaque */}
            {showPlateCTA && (
              <Button
                onClick={searchPlate}
                disabled={plaqueLoading}
                className="mt-3 h-12 w-full rounded-2xl bg-brand text-base font-semibold text-white hover:bg-brand/90"
              >
                {plaqueLoading ? <Loader2 size={18} className="animate-spin" /> : <><Search size={18} className="mr-2" /> Chercher la plaque {search.toUpperCase()}</>}
              </Button>
            )}

            {/* Résultats plaque */}
            {plaqueResults !== null && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase text-text-muted">Résultat plaque</p>
                {plaqueResults.length === 0 ? (
                  <div className="rounded-2xl bg-card p-4 text-sm text-text-dim ring-1 ring-foreground/10">
                    Aucun véhicule trouvé pour cette plaque.
                  </div>
                ) : (
                  plaqueResults.map((p, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
                      <span className="rounded-lg bg-blue-600 px-2.5 py-1 font-mono text-sm font-bold text-white">{p.plaque}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono font-semibold text-foreground">{p.code_moteur || "Code moteur inconnu"}</p>
                        <p className="truncate text-sm text-text-dim">{[p.marque, p.modele].filter(Boolean).join(" ")}</p>
                      </div>
                      {p.code_moteur && (
                        <Button
                          onClick={() => {
                            setLockedCode(p.code_moteur!);
                            setSearch("");
                            setPlaqueResults(null);
                          }}
                          className="h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90"
                        >
                          Voir les besoins
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Bandeau plaque verrouillée */}
            {lockedCode && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-blue-500/10 px-4 py-3">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Filtré sur le moteur <span className="font-mono font-bold">{lockedCode}</span>
                </p>
                <button
                  onClick={() => setLockedCode(null)}
                  className="flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
                >
                  <X size={14} /> Effacer
                </button>
              </div>
            )}

            {/* En-tête liste + tri */}
            <div className="mt-5 flex items-center justify-between gap-3">
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Moteurs recherchés{" "}
                <span className="text-sm font-normal text-text-muted">({filtered.length})</span>
              </h2>
            </div>
            {!lockedCode && (
              <>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sortChips.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setSortKey(c.key)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        sortKey === c.key
                          ? "bg-brand text-white"
                          : "bg-surface-alt text-text-dim hover:bg-surface-hover"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["Tous", ...ENERGIES].map((e) => {
                    const active = (e === "Tous" && !energyFilter) || energyFilter === e;
                    return (
                      <button
                        key={e}
                        onClick={() => setEnergyFilter(e === "Tous" ? null : e)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
                          active
                            ? "bg-brand-soft text-brand ring-brand/30"
                            : "bg-transparent text-text-dim ring-border hover:bg-surface-alt"
                        }`}
                      >
                        {e}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Grille de besoins */}
            {loading ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-36 animate-pulse rounded-2xl bg-surface-alt" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl bg-card px-4 py-14 text-center ring-1 ring-foreground/10">
                <PackageSearch size={32} className="text-text-muted" />
                <p className="text-sm text-text-dim">Aucun moteur ne correspond à ta recherche.</p>
              </div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {shown.map((b) => (
                    <BesoinCard
                      key={b.code_moteur}
                      b={b}
                      onClaim={openClaim}
                      claimed={offeredCodes.has((b.code_moteur || "").toLowerCase())}
                    />
                  ))}
                </div>
                {visible < filtered.length && (
                  <div className="mt-5 flex justify-center">
                    <Button
                      variant="outline"
                      onClick={() => setVisible((v) => v + 24)}
                      className="h-11 rounded-xl px-6 text-sm"
                    >
                      Voir plus ({filtered.length - visible})
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Proposer un moteur hors liste */}
            <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface-alt/50 px-4 py-6 text-center">
              <TrendingUp size={22} className="text-brand" />
              <div>
                <p className="font-semibold text-foreground">Un moteur en stock hors liste ?</p>
                <p className="text-sm text-text-dim">Propose-le, même s&apos;il n&apos;apparaît pas ci-dessus.</p>
              </div>
              <Button
                onClick={() => setFreeOpen(true)}
                variant="outline"
                className="h-11 rounded-xl px-5 text-sm font-semibold"
              >
                <Plus size={16} className="mr-1.5" /> Proposer un moteur
              </Button>
            </div>
          </>
        )}

        {/* ══════════ MES OFFRES ══════════ */}
        {view === "offres" && (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Mes offres <span className="text-sm font-normal text-text-muted">({myOffers.length})</span>
              </h2>
              {acceptedCount > 0 && (
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600">
                  {acceptedCount} à livrer · {fmtEuro(acceptedValue)} €
                </span>
              )}
            </div>

            {myOffers.length === 0 ? (
              <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl bg-card px-4 py-14 text-center ring-1 ring-foreground/10">
                <Clock size={32} className="text-text-muted" />
                <p className="text-sm text-text-dim">
                  Aucune offre en cours. Va dans <span className="font-semibold text-foreground">Recherche</span> et clique
                  «&nbsp;Je l&apos;ai&nbsp;» sur un moteur.
                </p>
                <Button
                  onClick={() => setView("recherche")}
                  className="h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand/90"
                >
                  <Search size={16} className="mr-1.5" /> Voir les moteurs recherchés
                </Button>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {myOffers.map((o) => (
                  <MyOfferCard
                    key={o.id}
                    o={o}
                    busy={delivering === o.id}
                    onDeliver={deliverOffer}
                    onDismiss={dismissOffer}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* ══════════ SHEET "Je l'ai" ══════════ */}
      <Sheet open={!!claimTarget} onClose={() => setClaimTarget(null)} title="Je propose ce moteur">
        {claimTarget && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-surface-alt p-4">
              <p className="font-mono text-lg font-bold text-foreground">{claimTarget.code_moteur}</p>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-text-dim">
                {claimTarget.marque && <span>{claimTarget.marque}</span>}
                {claimTarget.energie && <span>· {claimTarget.energie}</span>}
              </div>
              {claimTarget.prix_moyen > 0 && (
                <p className="mt-2 text-sm text-text-dim">
                  Prix de reprise indicatif&nbsp;: <span className="font-semibold text-brand">{fmtEuro(claimTarget.prix_moyen)} €</span>
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-xs text-text-dim">Votre prix (€) *</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={offerPrix}
                  onChange={(e) => setOfferPrix(e.target.value)}
                  placeholder={claimTarget.prix_moyen > 0 ? `${Math.round(claimTarget.prix_moyen)}` : "Prix"}
                  className="mt-1 h-12 rounded-xl text-base"
                  autoFocus
                />
              </div>
              <div className="w-24">
                <Label className="text-xs text-text-dim">Quantité</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={offerQty}
                  onChange={(e) => setOfferQty(e.target.value)}
                  className="mt-1 h-12 rounded-xl text-base"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-text-dim">Note (optionnel)</Label>
              <Input
                value={offerNote}
                onChange={(e) => setOfferNote(e.target.value)}
                placeholder="État, kilométrage, disponibilité…"
                className="mt-1 h-12 rounded-xl text-base"
              />
            </div>
            <Button
              onClick={submitOffer}
              disabled={offerSubmitting || !offerPrix}
              className="h-13 w-full rounded-2xl bg-brand py-3.5 text-base font-semibold text-white hover:bg-brand/90"
            >
              {offerSubmitting ? <Loader2 size={18} className="animate-spin" /> : <><Check size={18} className="mr-2" /> Envoyer l&apos;offre</>}
            </Button>
          </div>
        )}
      </Sheet>

      {/* ══════════ SHEET "Proposer un moteur" ══════════ */}
      <Sheet open={freeOpen} onClose={() => setFreeOpen(false)} title="Proposer un moteur">
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Label className="text-xs text-text-dim">Code moteur</Label>
              <Input
                value={freeCode}
                onChange={(e) => setFreeCode(e.target.value)}
                placeholder="K9K-766"
                className="mt-1 h-12 rounded-xl text-base uppercase"
              />
            </div>
            <div className="w-28">
              <Label className="text-xs text-text-dim">Prix (€)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={freePrix}
                onChange={(e) => setFreePrix(e.target.value)}
                placeholder="350"
                className="mt-1 h-12 rounded-xl text-base"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-text-dim">Description</Label>
            <Input
              value={freeDesc}
              onChange={(e) => setFreeDesc(e.target.value)}
              placeholder="Moteur diesel 1.5 dCi, 90 000 km…"
              className="mt-1 h-12 rounded-xl text-base"
            />
          </div>
          <div>
            <Label className="text-xs text-text-dim">Note (optionnel)</Label>
            <Input
              value={freeNote}
              onChange={(e) => setFreeNote(e.target.value)}
              placeholder="Disponibilité, état…"
              className="mt-1 h-12 rounded-xl text-base"
            />
          </div>
          <Button
            onClick={submitFreeOffer}
            disabled={freeSubmitting || (!freeCode && !freeDesc)}
            className="h-13 w-full rounded-2xl bg-brand py-3.5 text-base font-semibold text-white hover:bg-brand/90"
          >
            {freeSubmitting ? <Loader2 size={18} className="animate-spin" /> : <><Plus size={18} className="mr-2" /> Envoyer la proposition</>}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/* ══════════════════════════ ÉTAT "non VHU" ══════════════════════════ */
function NotVhu() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-3xl bg-card p-8 text-center ring-1 ring-foreground/10">
        <PackageSearch size={40} className="mx-auto text-text-muted" />
        <h1 className="mt-4 font-heading text-xl font-semibold text-foreground">Portail réservé aux centres VHU</h1>
        <p className="mt-2 text-sm text-text-dim">
          Connecte-toi avec un compte centre VHU pour accéder à ce portail.
        </p>
        <Button
          onClick={() => (window.location.href = "/")}
          className="mt-6 h-11 w-full rounded-xl bg-brand text-sm font-semibold text-white hover:bg-brand/90"
        >
          Retour à la connexion
        </Button>
      </div>
    </div>
  );
}

/* ══════════════════════════ PAGE ══════════════════════════ */
export default function VhuPage() {
  const [state, setState] = useState<"loading" | "ok" | "denied">("loading");
  const [centreId, setCentreId] = useState("");
  const [centreName, setCentreName] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setState("denied");
          return;
        }
        const { user } = await res.json();
        if (!user || user.role !== "vhu") {
          if (!cancelled) setState("denied");
          return;
        }
        // Identité stable du centre : dérivée du compte (nom, sinon email).
        const name = (user.nom && user.nom.trim()) || user.email || `Centre #${user.id}`;
        const { data: existing } = await supabase.from("breakers").select("id, name").eq("name", name).maybeSingle();
        let id: string;
        if (existing) {
          id = existing.id;
        } else {
          const { data: inserted } = await supabase.from("breakers").insert({ name }).select("id").single();
          if (!inserted) {
            if (!cancelled) setState("denied");
            return;
          }
          id = inserted.id;
        }
        if (cancelled) return;
        sessionStorage.setItem("vhu_centre_id", id);
        sessionStorage.setItem("vhu_centre_name", name);
        setCentreId(id);
        setCentreName(name);
        setState("ok");
      } catch {
        if (!cancelled) setState("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-text-muted">
        <Loader2 className="mr-2 animate-spin" size={20} /> Chargement…
      </div>
    );
  }
  if (state === "denied") return <NotVhu />;
  return <VhuPortal centreId={centreId} centreName={centreName} />;
}
