"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 200;
const STOCK_BAS = 2;

type Piece = {
  id: number;
  categorie: string;
  marque: string;
  reference: string;
  modele: string;
  stock: number;
};

type SortKey = "categorie" | "reference" | "modele" | "marque" | "stock";
type SortDir = "asc" | "desc";

type Mouvement = {
  id: number;
  date_mouvement: string | null;
  quantite: number | null;
  client: string | null;
  reference: string | null;
};

export default function PiecesPage() {
  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const [categorie, setCategorie] = useState("Toutes");
  const [alerte, setAlerte] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [counts, setCounts] = useState({ total: 0, alertes: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("reference");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Piece | null>(null);
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [mvLoading, setMvLoading] = useState(false);
  const reqRef = useRef(0);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(rawSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [rawSearch]);

  // Load category list once
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("tbl_pieces_detachees")
        .select("categorie")
        .limit(10000);
      const uniq = [...new Set((data || []).map((r: any) => r.categorie).filter(Boolean))].sort();
      setCategories(uniq as string[]);
    })();
  }, []);

  function applyFilters<T extends { or: (f: string) => T; eq: (c: string, v: any) => T; lte: (c: string, v: any) => T }>(q: T): T {
    let out = q;
    if (search) {
      // Recherche tolérante aux espaces dans les références (Bosch: "0 227 400 037")
      const stripped = search.replace(/\s+/g, "");
      const filters = [
        `reference.ilike.%${search}%`,
        `modele.ilike.%${search}%`,
        `marque.ilike.%${search}%`,
      ];
      if (stripped !== search && stripped.length > 2) {
        // tente aussi sans espaces — utile si le user tape "0227400037" alors que la réf est "0 227 400 037"
        // PostgREST ne permet pas de regex ici, donc on cherche sur des variantes texte simples.
        const spaced = stripped.split("").join(" ");
        filters.push(`reference.ilike.%${stripped}%`);
        filters.push(`reference.ilike.%${spaced}%`);
      }
      out = out.or(filters.join(","));
    }
    if (categorie !== "Toutes") out = out.eq("categorie", categorie);
    if (alerte) out = out.lte("stock", STOCK_BAS);
    return out;
  }

  const fetchPage = useCallback(
    async (offset: number) => {
      const my = ++reqRef.current;
      let q = supabase
        .from("tbl_pieces_detachees")
        .select("id, categorie, marque, reference, modele, stock")
        .order(sortKey, { ascending: sortDir === "asc", nullsFirst: false })
        .range(offset, offset + PAGE_SIZE - 1);
      q = applyFilters(q as any) as any;

      const countBase = () => applyFilters(
        supabase.from("tbl_pieces_detachees").select("*", { count: "exact", head: true }) as any
      );
      const alertCountBase = () => {
        let c = supabase.from("tbl_pieces_detachees").select("*", { count: "exact", head: true }) as any;
        if (search) {
          const stripped = search.replace(/\s+/g, "");
          const filters = [
            `reference.ilike.%${search}%`,
            `modele.ilike.%${search}%`,
            `marque.ilike.%${search}%`,
          ];
          if (stripped !== search && stripped.length > 2) {
            filters.push(`reference.ilike.%${stripped}%`);
          }
          c = c.or(filters.join(","));
        }
        if (categorie !== "Toutes") c = c.eq("categorie", categorie);
        return c.lte("stock", STOCK_BAS);
      };

      const [rowsRes, totalRes, alertRes] = await Promise.all([q, countBase(), alertCountBase()]);
      if (my !== reqRef.current) return null;
      return {
        rows: (rowsRes.data || []) as Piece[],
        total: totalRes.count || 0,
        alertes: alertRes.count || 0,
      };
    },
    [search, categorie, alerte, sortKey, sortDir]
  );

  // Reset & load on filter / sort change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const r = await fetchPage(0);
      if (cancelled || !r) return;
      setPieces(r.rows);
      setCounts({ total: r.total, alertes: r.alertes });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  async function loadMore() {
    setLoadingMore(true);
    const r = await fetchPage(pieces.length);
    if (r) {
      setPieces((prev) => [...prev, ...r.rows]);
      setCounts({ total: r.total, alertes: r.alertes });
    }
    setLoadingMore(false);
  }

  // Ouvre l'historique achats/ventes d'une référence (tbl_pieces_mouvements)
  async function openHistorique(p: Piece) {
    setSelected(p);
    setMvLoading(true);
    const { data } = await supabase
      .from("tbl_pieces_mouvements")
      .select("id, date_mouvement, quantite, client, reference")
      .eq("reference", p.reference)
      .order("date_mouvement", { ascending: false, nullsFirst: false })
      .limit(500);
    setMouvements((data as Mouvement[]) || []);
    setMvLoading(false);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "stock" ? "desc" : "asc");
    }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown size={12} className="inline ml-1 text-text-muted" />;
    return sortDir === "asc" ? (
      <ArrowUp size={12} className="inline ml-1 text-brand" />
    ) : (
      <ArrowDown size={12} className="inline ml-1 text-brand" />
    );
  }

  const stockTotal = pieces.reduce((s, p) => s + (p.stock || 0), 0);
  const remaining = Math.max(0, counts.total - pieces.length);

  return (
    <div>
      <PageHeader title="Pièces détachées" description="Stock pièces (alternateurs, démarreurs, compresseurs...) — cliquez une référence pour son historique achats/ventes" />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-dim font-semibold uppercase">Références</p>
            <p className="text-2xl font-bold text-brand">{counts.total.toLocaleString("fr-FR")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-dim font-semibold uppercase">Stock bas (≤ {STOCK_BAS})</p>
            <p className="text-2xl font-bold text-amber-600">{counts.alertes.toLocaleString("fr-FR")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-dim font-semibold uppercase">Unités affichées</p>
            <p className="text-2xl font-bold text-foreground">{stockTotal.toLocaleString("fr-FR")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Input
          placeholder="Rechercher (référence avec ou sans espaces, modèle, marque...)"
          value={rawSearch}
          onChange={(e) => setRawSearch(e.target.value)}
          className="max-w-md bg-surface-alt border-border text-foreground placeholder:text-text-muted"
        />
        <select
          value={categorie}
          onChange={(e) => setCategorie(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-surface-alt text-foreground"
        >
          <option>Toutes</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={alerte}
            onChange={(e) => setAlerte(e.target.checked)}
            className="rounded border-border bg-surface-alt"
          />
          <span className="text-sm text-amber-600 font-medium">Stock bas seulement</span>
        </label>
      </div>

      {loading ? (
        <div className="text-center py-12 text-text-muted">Chargement...</div>
      ) : (
        <div className={`grid grid-cols-1 gap-6 ${selected ? "lg:grid-cols-2" : ""}`}>
          <div>
          <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt text-text-dim text-xs uppercase">
                  <tr>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-surface-hover select-none"
                      onClick={() => toggleSort("categorie")}
                    >
                      Catégorie
                      <SortIcon k="categorie" />
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-surface-hover select-none"
                      onClick={() => toggleSort("reference")}
                    >
                      Référence
                      <SortIcon k="reference" />
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-surface-hover select-none"
                      onClick={() => toggleSort("modele")}
                    >
                      Modèle
                      <SortIcon k="modele" />
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-surface-hover select-none"
                      onClick={() => toggleSort("marque")}
                    >
                      Marque
                      <SortIcon k="marque" />
                    </th>
                    <th
                      className="px-4 py-3 text-center cursor-pointer hover:bg-surface-hover select-none"
                      onClick={() => toggleSort("stock")}
                    >
                      Stock
                      <SortIcon k="stock" />
                    </th>
                    <th className="px-4 py-3 text-center">Alerte</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pieces.map((p) => {
                    const isAlerte = (p.stock || 0) <= STOCK_BAS;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => openHistorique(p)}
                        className={`cursor-pointer hover:bg-surface-hover transition-colors ${
                          selected?.id === p.id
                            ? "bg-brand-soft"
                            : isAlerte
                            ? "bg-[rgba(251,191,36,0.05)]"
                            : ""
                        }`}
                      >
                        <td className="px-4 py-3 text-text-dim text-xs">{p.categorie || "—"}</td>
                        <td className="px-4 py-3 font-mono text-xs text-foreground font-semibold">
                          {p.reference || "—"}
                        </td>
                        <td className="px-4 py-3 text-text-dim">{p.modele || "—"}</td>
                        <td className="px-4 py-3 text-text-dim">{p.marque || "—"}</td>
                        <td className="px-4 py-3 text-center font-semibold tabular-nums text-foreground">
                          {p.stock ?? 0}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isAlerte && (
                            <Badge className="bg-[rgba(251,191,36,0.10)] text-amber-600 border border-[rgba(251,191,36,0.20)] hover:bg-[rgba(251,191,36,0.15)]">
                              Stock bas
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pieces.length === 0 && (
              <p className="text-center py-10 text-text-muted italic">Aucune pièce trouvée</p>
            )}
          </div>

          {remaining > 0 && (
            <div className="flex justify-center mt-5">
              <Button onClick={loadMore} disabled={loadingMore} variant="outline">
                {loadingMore
                  ? "Chargement..."
                  : `Charger plus (${remaining.toLocaleString("fr-FR")} restantes)`}
              </Button>
            </div>
          )}
          </div>
          {selected && (
            <PanelHistorique
              piece={selected}
              mouvements={mouvements}
              loading={mvLoading}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function PanelHistorique({
  piece,
  mouvements,
  loading,
  onClose,
}: {
  piece: Piece;
  mouvements: Mouvement[];
  loading: boolean;
  onClose: () => void;
}) {
  const totalEntrees = mouvements
    .filter((m) => (m.quantite ?? 0) >= 0)
    .reduce((s, m) => s + (m.quantite || 0), 0);
  const totalVendus = mouvements
    .filter((m) => (m.quantite ?? 0) < 0)
    .reduce((s, m) => s + Math.abs(m.quantite || 0), 0);

  return (
    <div className="h-fit rounded-[14px] border border-border bg-surface p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="font-mono font-bold text-foreground">{piece.reference}</h3>
          <p className="text-sm text-text-dim">
            {piece.categorie || "—"} · stock actuel {piece.stock ?? 0}
          </p>
        </div>
        <button onClick={onClose} className="text-lg text-text-muted transition-colors hover:text-foreground">
          ✕
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-surface-alt p-3">
          <p className="text-xs font-semibold uppercase text-text-dim">Entrées (achats)</p>
          <p className="text-xl font-bold text-emerald-600">{totalEntrees}</p>
        </div>
        <div className="rounded-lg bg-surface-alt p-3">
          <p className="text-xs font-semibold uppercase text-text-dim">Vendus</p>
          <p className="text-xl font-bold text-brand">{totalVendus}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Chargement de l'historique…</p>
      ) : mouvements.length === 0 ? (
        <p className="text-sm italic text-text-muted">Aucun mouvement pour cette référence.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-xs uppercase text-text-dim">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-center">Qté</th>
                <th className="px-3 py-2 text-left">Client</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mouvements.map((m) => {
                const vente = (m.quantite ?? 0) < 0;
                return (
                  <tr key={m.id} className="transition-colors hover:bg-surface-hover">
                    <td className="px-3 py-2 text-text-dim">
                      {m.date_mouvement ? new Date(m.date_mouvement).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {vente ? (
                        <Badge className="border border-[rgba(196,30,58,0.20)] bg-brand-soft text-brand">Vente</Badge>
                      ) : (
                        <Badge className="border border-[rgba(52,211,153,0.20)] bg-[rgba(52,211,153,0.10)] text-emerald-600">
                          Entrée
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center font-medium tabular-nums">{Math.abs(m.quantite ?? 0)}</td>
                    <td className="px-3 py-2 text-text-dim">{(m.client || "").trim() || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
