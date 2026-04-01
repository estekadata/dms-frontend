"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

type Piece = {
  id: number;
  reference?: string;
  modele?: string;
  marque?: string;
  categorie?: string;
  stock?: number;
  date_import?: string;
};

export default function PiecesPage() {
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loading, setLoading] = useState(true);

  // Movement history
  const [selectedRef, setSelectedRef] = useState<Piece | null>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [movLoading, setMovLoading] = useState(false);

  // Entry/Exit form
  const [formRef, setFormRef] = useState("");
  const [formQty, setFormQty] = useState("");
  const [formClient, setFormClient] = useState("");
  const [formType, setFormType] = useState<"entree" | "sortie">("entree");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Inactive parts
  const [inactiveMonths, setInactiveMonths] = useState(6);
  const [inactiveParts, setInactiveParts] = useState<any[]>([]);
  const [showInactive, setShowInactive] = useState(false);

  // Load categories
  useEffect(() => {
    async function loadCats() {
      const { data } = await supabase
        .from("tbl_pieces_detachees")
        .select("categorie")
        .not("categorie", "is", null)
        .limit(1000);
      const catSet = new Set<string>();
      (data || []).forEach((d: any) => { if (d.categorie) catSet.add(d.categorie); });
      setCategories([...catSet].sort());
    }
    loadCats();
  }, []);

  // Load pieces
  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase
        .from("tbl_pieces_detachees")
        .select("id, reference, modele, marque, categorie, stock, date_import")
        .order("reference", { ascending: true })
        .limit(500);

      if (search) {
        query = query.or(`reference.ilike.%${search}%,modele.ilike.%${search}%,marque.ilike.%${search}%`);
      }
      if (selectedCats.length > 0) {
        query = query.in("categorie", selectedCats);
      }

      const { data } = await query;
      setPieces(data || []);
      setLoading(false);
    }
    load();
  }, [search, selectedCats]);

  // Load movements for a reference
  async function loadMovements(piece: Piece) {
    setSelectedRef(piece);
    setMovLoading(true);
    const { data } = await supabase
      .from("tbl_pieces_mouvements")
      .select("*")
      .eq("n_piece", piece.id)
      .order("date_mouvement", { ascending: true })
      .limit(200);

    // Group by month
    const monthMap: Record<string, { entrees: number; sorties: number }> = {};
    (data || []).forEach((m: any) => {
      const k = m.date_mouvement?.substring(0, 7) || "";
      if (!k) return;
      if (!monthMap[k]) monthMap[k] = { entrees: 0, sorties: 0 };
      const qty = Math.abs(m.quantite || 0);
      if (m.type_mouvement === "entree" || (m.quantite || 0) > 0) monthMap[k].entrees += qty;
      else monthMap[k].sorties += qty;
    });

    let cumul = 0;
    const result = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mois, v]) => {
        cumul += v.entrees - v.sorties;
        return { mois, entrees: v.entrees, sorties: v.sorties, cumul };
      });

    setMovements(result);
    setMovLoading(false);
  }

  // Submit movement
  async function submitMovement() {
    if (!formRef || !formQty) return;
    setFormSubmitting(true);

    const piece = pieces.find((p) => p.reference === formRef || p.id === parseInt(formRef));
    if (!piece) {
      alert("Reference introuvable");
      setFormSubmitting(false);
      return;
    }

    const qty = parseInt(formQty);
    const { error: mvtError } = await supabase.from("tbl_pieces_mouvements").insert({
      n_piece: piece.id,
      type_mouvement: formType,
      quantite: formType === "entree" ? qty : -qty,
      client: formClient || null,
      date_mouvement: new Date().toISOString(),
    });

    if (mvtError) {
      alert("Erreur mouvement: " + mvtError.message);
      setFormSubmitting(false);
      return;
    }

    const newStock = (piece.stock || 0) + (formType === "entree" ? qty : -qty);
    const { error: updError } = await supabase
      .from("tbl_pieces_detachees")
      .update({ stock: newStock })
      .eq("n_piece", piece.id);

    if (updError) {
      alert("Erreur mise a jour stock: " + updError.message);
    } else {
      setFormRef(""); setFormQty(""); setFormClient("");
      // Reload
      setPieces((prev) =>
        prev.map((p) => (p.id === piece.id ? { ...p, stock: newStock } : p))
      );
    }
    setFormSubmitting(false);
  }

  // Load inactive parts
  async function loadInactive() {
    setShowInactive(!showInactive);
    if (showInactive) return;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - inactiveMonths);

    // Get all pieces with stock > 0
    const { data: allPieces } = await supabase
      .from("tbl_pieces_detachees")
      .select("id, reference, modele, stock")
      .gt("stock", 0)
      .limit(500);

    if (!allPieces || allPieces.length === 0) { setInactiveParts([]); return; }

    // Get recent movements
    const { data: recentMvts } = await supabase
      .from("tbl_pieces_mouvements")
      .select("n_piece")
      .gte("date_mouvement", cutoff.toISOString());

    const activeIds = new Set((recentMvts || []).map((m: any) => m.n_piece));
    setInactiveParts(allPieces.filter((p: any) => !activeIds.has(p.id)));
  }

  // KPIs
  const totalRefs = pieces.length;
  const totalStock = pieces.reduce((s, p) => s + (p.stock || 0), 0);
  const catCount = new Set(pieces.map((p) => p.categorie).filter(Boolean)).size;
  const zeroStock = pieces.filter((p) => (p.stock || 0) === 0).length;

  function stockColor(qty: number) {
    if (qty === 0) return "text-red-600 bg-red-50";
    if (qty <= 2) return "text-amber-600 bg-amber-50";
    return "text-emerald-600 bg-emerald-50";
  }

  return (
    <div>
      <PageHeader title="Pieces detachees" icon="🔩" description="Gestion du stock pieces (alternateurs, demarreurs...)" />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Total references</p>
            <p className="text-2xl font-bold text-[#C41E3A]">{totalRefs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Total stock</p>
            <p className="text-2xl font-bold text-gray-700">{totalStock}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Categories</p>
            <p className="text-2xl font-bold text-blue-600">{catCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Stock = 0</p>
            <p className="text-2xl font-bold text-red-600">{zeroStock}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Input
          placeholder="Rechercher (reference, modele, marque...)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCats((prev) =>
                    prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                  );
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  selectedCats.includes(cat)
                    ? "bg-[#C41E3A] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
            {selectedCats.length > 0 && (
              <button onClick={() => setSelectedCats([])} className="text-xs text-gray-400 hover:text-gray-600 ml-1">
                Tout effacer
              </button>
            )}
          </div>
        )}
      </div>

      {/* Data table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Categorie</th>
                  <th className="px-4 py-3 text-left">Marque</th>
                  <th className="px-4 py-3 text-center">Stock</th>
                  <th className="px-4 py-3 text-left">Reference</th>
                  <th className="px-4 py-3 text-center">Historique</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pieces.map((p) => {
                  const qty = p.stock ?? 0;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{p.categorie || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{p.marque || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${stockColor(qty)}`}>
                          {qty}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{p.reference || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => loadMovements(p)}
                          className="text-xs text-[#C41E3A] hover:underline font-medium"
                        >
                          Voir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pieces.length === 0 && <p className="text-center py-10 text-gray-400">Aucune piece trouvee</p>}
        </div>
      )}

      {/* Movement history chart */}
      {selectedRef && (
        <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-700">
              Historique mouvements : {selectedRef.reference || selectedRef.modele}
            </h3>
            <button onClick={() => setSelectedRef(null)} className="text-gray-400 hover:text-gray-600">Fermer</button>
          </div>
          {movLoading ? (
            <div className="text-center py-8 text-gray-400">Chargement...</div>
          ) : movements.length === 0 ? (
            <p className="text-sm text-gray-400">Aucun mouvement enregistre</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-medium text-gray-600 mb-2">Entrees / Sorties par mois</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={movements}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="entrees" fill="#2563EB" radius={[4, 4, 0, 0]} name="Entrees" />
                    <Bar dataKey="sorties" fill="#C41E3A" radius={[4, 4, 0, 0]} name="Sorties" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-600 mb-2">Stock cumule</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={movements}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="cumul" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3 }} name="Cumul" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Entry/Exit form */}
      <Card className="mb-6 border-[#C41E3A]/20">
        <CardContent className="p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Enregistrer un mouvement</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div>
              <Label>Type</Label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as "entree" | "sortie")}
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="entree">Entree</option>
                <option value="sortie">Sortie</option>
              </select>
            </div>
            <div>
              <Label>Reference</Label>
              <select
                value={formRef}
                onChange={(e) => setFormRef(e.target.value)}
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">Selectionner...</option>
                {pieces.map((p) => (
                  <option key={p.id} value={p.reference || p.id}>
                    {p.reference} - {p.modele} (stock: {p.stock ?? 0})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Quantite</Label>
              <Input type="number" min="1" value={formQty} onChange={(e) => setFormQty(e.target.value)} className="mt-1" placeholder="1" />
            </div>
            <div>
              <Label>Client / Fournisseur</Label>
              <Input value={formClient} onChange={(e) => setFormClient(e.target.value)} className="mt-1" placeholder="Optionnel" />
            </div>
            <Button
              onClick={submitMovement}
              disabled={formSubmitting || !formRef || !formQty}
              className="bg-[#C41E3A] hover:bg-[#8B1A2B] text-white"
            >
              {formSubmitting ? "Enregistrement..." : "Valider"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Inactive parts */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h3 className="font-semibold text-gray-800">Pieces inactives</h3>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500">Sans mouvement depuis</label>
                <select
                  value={inactiveMonths}
                  onChange={(e) => setInactiveMonths(+e.target.value)}
                  className="border rounded-lg px-2 py-1 text-sm bg-white"
                >
                  {[3, 6, 9, 12, 18, 24].map((m) => (
                    <option key={m} value={m}>{m} mois</option>
                  ))}
                </select>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={loadInactive}>
              {showInactive ? "Masquer" : "Afficher"}
            </Button>
          </div>
          {showInactive && (
            inactiveParts.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune piece inactive trouvee</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Reference</th>
                      <th className="px-4 py-2 text-left">Designation</th>
                      <th className="px-4 py-2 text-center">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {inactiveParts.map((p: any) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-xs">{p.reference || "—"}</td>
                        <td className="px-4 py-2">{p.modele || "—"}</td>
                        <td className="px-4 py-2 text-center">
                          <span className="text-amber-600 font-semibold">{p.stock}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-gray-400 mt-2">{inactiveParts.length} pieces avec stock en dormance</p>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
