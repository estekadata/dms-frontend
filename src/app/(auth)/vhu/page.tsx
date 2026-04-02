"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/* ────────── AUTH SCREEN ────────── */
function AuthScreen({ onAuth }: { onAuth: (centreId: string, centreName: string) => void }) {
  const [code, setCode] = useState("");
  const [nom, setNom] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError("");
    if (!code || !nom) { setError("Code et nom du centre requis"); return; }
    setLoading(true);

    const expectedCode = process.env.NEXT_PUBLIC_BREAKER_ACCESS_CODE;
    if (expectedCode && code !== expectedCode) {
      setError("Code d'acces invalide");
      setLoading(false);
      return;
    }

    const { data: existing } = await supabase
      .from("breakers")
      .select("id, name")
      .eq("name", nom.trim())
      .maybeSingle();

    let centreId: string;
    if (existing) {
      centreId = existing.id;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("breakers")
        .insert({ name: nom.trim() })
        .select("id")
        .single();
      if (insertErr || !inserted) {
        setError("Erreur lors de l'enregistrement du centre");
        setLoading(false);
        return;
      }
      centreId = inserted.id;
    }

    sessionStorage.setItem("vhu_centre_id", centreId);
    sessionStorage.setItem("vhu_centre_name", nom.trim());
    onAuth(centreId, nom.trim());
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Portail VHU</h1>
            <p className="text-gray-500 mt-1">Connectez-vous avec votre code centre</p>
          </div>
          <div className="space-y-4">
            <div>
              <Label>Code d&apos;acces</Label>
              <Input type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Entrez le code" className="mt-1" />
            </div>
            <div>
              <Label>Nom du centre</Label>
              <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex: Centre Auto Toulouse" className="mt-1" />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <Button onClick={handleLogin} disabled={loading} className="w-full bg-[#C41E3A] hover:bg-[#8B1A2B] text-white">
              {loading ? "Connexion..." : "Se connecter"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ────────── TYPES ────────── */
type SortKey = "code_moteur" | "marque" | "urgence" | "prix_moyen" | "stock_dispo" | "quantite";
type SortDir = "asc" | "desc";

/* ────────── MAIN PORTAL ────────── */
function VhuPortal({ centreId, centreName }: { centreId: string; centreName: string }) {
  const [besoins, setBesoins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [plaqueResults, setPlaqueResults] = useState<any[] | null>(null);
  const [expandedBesoin, setExpandedBesoin] = useState<string | null>(null);
  const [todayCount, setTodayCount] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("urgence");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 25;

  // Offer form state
  const [offerPrix, setOfferPrix] = useState("");
  const [offerQty, setOfferQty] = useState("1");
  const [offerNote, setOfferNote] = useState("");
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const [offerSuccess, setOfferSuccess] = useState<string | null>(null);

  // Free offer
  const [freeCode, setFreeCode] = useState("");
  const [freeDesc, setFreeDesc] = useState("");
  const [freePrix, setFreePrix] = useState("");
  const [freeNote, setFreeNote] = useState("");
  const [freeSubmitting, setFreeSubmitting] = useState(false);

  // Stats
  useEffect(() => {
    async function loadStats() {
      const today = new Date().toISOString().substring(0, 10);
      const { count } = await supabase
        .from("breaker_click_offers")
        .select("id", { count: "exact", head: true })
        .eq("breaker_id", centreId)
        .gte("created_at", today);
      setTodayCount(count || 0);
    }
    loadStats();
  }, [centreId]);

  // Load ALL besoins (no pagination server-side, we paginate client-side)
  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("v_besoins")
        .select("*")
        .order("urgence", { ascending: false })
        .limit(2000);
      setBesoins(data || []);
      setLoading(false);
    }
    load();
  }, []);

  // Smart search: detect plate format
  const isPlateFormat = (s: string) => /^[A-Z]{2}[-\s]?\d{3}[-\s]?[A-Z]{2}$/i.test(s.trim());

  async function handleSearch() {
    const q = search.trim();
    if (!q) { setPlaqueResults(null); return; }

    if (isPlateFormat(q)) {
      const normalized = q.toUpperCase().replace(/[-\s]/g, "");
      const { data } = await supabase
        .from("plaques_vehicules")
        .select("*")
        .or(`plaque.ilike.%${normalized}%,plaque.ilike.%${q.toUpperCase()}%`)
        .limit(10);
      setPlaqueResults(data || []);
    } else {
      setPlaqueResults(null);
    }
    setPage(0);
  }

  // Filter + sort besoins
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = besoins;

    if (q && !isPlateFormat(search)) {
      list = list.filter((b) =>
        b.code_moteur?.toLowerCase().includes(q) ||
        b.marque?.toLowerCase().includes(q) ||
        b.energie?.toLowerCase().includes(q) ||
        b.type_moteur?.toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [besoins, search, sortKey, sortDir]);

  const paginated = filtered.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "urgence" ? "desc" : "asc"); }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return " \u2195";
    return sortDir === "asc" ? " \u2191" : " \u2193";
  }

  // Submit click offer
  async function submitOffer(besoin: any) {
    if (!offerPrix) return;
    setOfferSubmitting(true);
    const { error } = await supabase.from("breaker_click_offers").insert({
      breaker_id: centreId,
      code_moteur: besoin.code_moteur,
      marque: besoin.marque || null,
      energie: besoin.energie || null,
      prix_demande: parseFloat(offerPrix),
      qty: parseInt(offerQty) || 1,
      note: offerNote || null,
    });
    if (error) {
      alert("Erreur: " + error.message);
    } else {
      setOfferSuccess(besoin.code_moteur);
      setOfferPrix(""); setOfferQty("1"); setOfferNote("");
      setTodayCount((c) => c + 1);
      setTimeout(() => { setOfferSuccess(null); setExpandedBesoin(null); }, 2000);
    }
    setOfferSubmitting(false);
  }

  // Submit free offer
  async function submitFreeOffer() {
    if (!freeCode && !freeDesc) return;
    setFreeSubmitting(true);
    const { error } = await supabase.from("breaker_free_offers").insert({
      breaker_id: centreId,
      texte: freeDesc || freeCode || null,
      prix_demande: freePrix ? parseFloat(freePrix) : null,
      note: freeNote || null,
    });
    if (error) {
      alert("Erreur: " + error.message);
    } else {
      setFreeCode(""); setFreeDesc(""); setFreePrix(""); setFreeNote("");
      alert("Offre envoyee !");
    }
    setFreeSubmitting(false);
  }

  function handleLogout() {
    sessionStorage.removeItem("vhu_centre_id");
    sessionStorage.removeItem("vhu_centre_name");
    window.location.reload();
  }

  const urgencyBadge = (u: number) => {
    if (u >= 8) return "bg-red-600 text-white";
    if (u >= 5) return "bg-amber-500 text-white";
    return "bg-gray-300 text-gray-700";
  };

  const thClass = "px-3 py-3 cursor-pointer hover:bg-gray-200 select-none transition text-xs uppercase whitespace-nowrap";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Portail VHU</h1>
            <p className="text-sm text-gray-500">Centre : <span className="font-semibold text-gray-700">{centreName}</span></p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-[#C41E3A]">{todayCount}</p>
              <p className="text-[10px] text-gray-400 uppercase">offres aujourd&apos;hui</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-700">{filtered.length}</p>
              <p className="text-[10px] text-gray-400 uppercase">besoins</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>Deconnexion</Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Search bar */}
        <div className="mb-6">
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); if (!e.target.value) setPlaqueResults(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Rechercher par plaque (AA-123-BB), code moteur, marque..."
              className="text-lg py-6 uppercase"
            />
            <Button onClick={handleSearch} className="bg-[#C41E3A] hover:bg-[#8B1A2B] text-white px-8 py-6">
              Chercher
            </Button>
          </div>

          {/* Plate results */}
          {plaqueResults !== null && (
            <div className="mt-3 bg-white rounded-xl shadow-sm border p-4">
              <h4 className="text-sm font-semibold text-gray-600 mb-2">Resultats plaque</h4>
              {plaqueResults.length === 0 ? (
                <p className="text-sm text-gray-400">Aucun vehicule trouve</p>
              ) : (
                <div className="space-y-2">
                  {plaqueResults.map((p, i) => (
                    <div key={i} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                      <span className="font-mono font-bold text-lg bg-blue-600 text-white px-3 py-1 rounded">{p.plaque}</span>
                      <div>
                        <p className="font-semibold">{p.code_moteur || "Code moteur inconnu"}</p>
                        <p className="text-sm text-gray-500">{[p.marque, p.modele].filter(Boolean).join(" ")}</p>
                      </div>
                      {p.code_moteur && (
                        <Button
                          size="sm"
                          className="ml-auto bg-[#C41E3A] hover:bg-[#8B1A2B] text-white"
                          onClick={() => { setSearch(p.code_moteur); setPlaqueResults(null); }}
                        >
                          Voir besoins
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Besoins table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h3 className="font-semibold text-gray-700">
              Moteurs recherches ({filtered.length})
              {search && !isPlateFormat(search) && <span className="text-sm font-normal text-gray-400 ml-2">filtre : &quot;{search}&quot;</span>}
            </h3>
            {search && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setPlaqueResults(null); }}>
                Effacer filtre
              </Button>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Chargement...</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 border-b">
                    <tr>
                      <th className={`${thClass} text-left`} onClick={() => toggleSort("code_moteur")}>
                        Code moteur{sortIcon("code_moteur")}
                      </th>
                      <th className={`${thClass} text-left`} onClick={() => toggleSort("marque")}>
                        Marque{sortIcon("marque")}
                      </th>
                      <th className={`${thClass} text-center`}>Energie</th>
                      <th className={`${thClass} text-center`} onClick={() => toggleSort("urgence")}>
                        Urgence{sortIcon("urgence")}
                      </th>
                      <th className={`${thClass} text-center`} onClick={() => toggleSort("quantite")}>
                        Vendus{sortIcon("quantite")}
                      </th>
                      <th className={`${thClass} text-center`} onClick={() => toggleSort("stock_dispo")}>
                        Stock{sortIcon("stock_dispo")}
                      </th>
                      <th className={`${thClass} text-right`} onClick={() => toggleSort("prix_moyen")}>
                        Prix achat{sortIcon("prix_moyen")}
                      </th>
                      <th className="px-3 py-3 text-center text-xs uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginated.map((b) => (
                      <>
                        <tr key={b.code_moteur} className="hover:bg-gray-50">
                          <td className="px-3 py-3 font-bold text-gray-900">{b.code_moteur}</td>
                          <td className="px-3 py-3">
                            <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50">{b.marque || "\u2014"}</Badge>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">{b.energie || "\u2014"}</Badge>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${urgencyBadge(b.urgence)}`}>
                              {b.urgence}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center tabular-nums text-gray-600">{b.quantite || 0}</td>
                          <td className="px-3 py-3 text-center tabular-nums">
                            <span className={b.stock_dispo === 0 ? "text-red-600 font-bold" : "text-gray-600"}>
                              {b.stock_dispo || 0}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            {b.prix_moyen > 0 ? (
                              <span className="font-bold text-[#C41E3A] text-base">{Math.round(b.prix_moyen)} \u20AC</span>
                            ) : (
                              <span className="text-gray-400">\u2014</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {offerSuccess === b.code_moteur ? (
                              <span className="text-emerald-600 font-medium text-xs">Envoye !</span>
                            ) : (
                              <Button
                                size="sm"
                                className={expandedBesoin === b.code_moteur
                                  ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                                  : "bg-[#C41E3A] hover:bg-[#8B1A2B] text-white"}
                                onClick={() => {
                                  setExpandedBesoin(expandedBesoin === b.code_moteur ? null : b.code_moteur);
                                  setOfferPrix(""); setOfferQty("1"); setOfferNote("");
                                }}
                              >
                                {expandedBesoin === b.code_moteur ? "Annuler" : "Je l'ai"}
                              </Button>
                            )}
                          </td>
                        </tr>
                        {expandedBesoin === b.code_moteur && (
                          <tr key={`${b.code_moteur}-form`} className="bg-gray-50">
                            <td colSpan={8} className="px-4 py-4">
                              <div className="flex items-end gap-3 max-w-2xl">
                                <div className="flex-1">
                                  <Label className="text-xs">Votre prix (EUR)</Label>
                                  <Input
                                    type="number"
                                    value={offerPrix}
                                    onChange={(e) => setOfferPrix(e.target.value)}
                                    placeholder={b.prix_moyen > 0 ? `~${Math.round(b.prix_moyen)}` : "Prix"}
                                    className="mt-1"
                                    autoFocus
                                  />
                                </div>
                                <div className="w-20">
                                  <Label className="text-xs">Qte</Label>
                                  <Input type="number" value={offerQty} onChange={(e) => setOfferQty(e.target.value)} className="mt-1" />
                                </div>
                                <div className="flex-1">
                                  <Label className="text-xs">Note</Label>
                                  <Input value={offerNote} onChange={(e) => setOfferNote(e.target.value)} placeholder="Optionnel" className="mt-1" />
                                </div>
                                <Button
                                  onClick={() => submitOffer(b)}
                                  disabled={offerSubmitting || !offerPrix}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-6"
                                >
                                  {offerSubmitting ? "..." : "Envoyer"}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              {filtered.length === 0 && <p className="text-center py-10 text-gray-400">Aucun besoin trouve</p>}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 py-4 border-t">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    Precedent
                  </Button>
                  <span className="text-sm text-gray-500">Page {page + 1} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                    Suivant
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Free offer */}
        <Card className="border-[#C41E3A]/20">
          <CardContent className="p-6">
            <h3 className="font-semibold text-gray-800 mb-1">Proposer un moteur</h3>
            <p className="text-sm text-gray-400 mb-4">Vous avez un moteur en stock ? Proposez-le meme s&apos;il n&apos;est pas dans la liste.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Code moteur</Label>
                <Input value={freeCode} onChange={(e) => setFreeCode(e.target.value)} placeholder="K9K-766" className="mt-1 uppercase" />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Input value={freeDesc} onChange={(e) => setFreeDesc(e.target.value)} placeholder="Moteur diesel 1.5..." className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Prix (EUR)</Label>
                <Input type="number" value={freePrix} onChange={(e) => setFreePrix(e.target.value)} placeholder="350" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Note</Label>
                <Input value={freeNote} onChange={(e) => setFreeNote(e.target.value)} placeholder="Optionnel" className="mt-1" />
              </div>
            </div>
            <Button
              onClick={submitFreeOffer}
              disabled={freeSubmitting || (!freeCode && !freeDesc)}
              className="mt-4 bg-[#C41E3A] hover:bg-[#8B1A2B] text-white"
            >
              {freeSubmitting ? "Envoi..." : "Envoyer l'offre"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ────────── MAIN PAGE ────────── */
export default function VhuPage() {
  const [authed, setAuthed] = useState(false);
  const [centreId, setCentreId] = useState("");
  const [centreName, setCentreName] = useState("");

  useEffect(() => {
    const storedId = sessionStorage.getItem("vhu_centre_id");
    const storedName = sessionStorage.getItem("vhu_centre_name");
    if (storedId && storedName) {
      setCentreId(storedId);
      setCentreName(storedName);
      setAuthed(true);
    }
  }, []);

  if (!authed) {
    return (
      <AuthScreen
        onAuth={(id, name) => {
          setCentreId(id);
          setCentreName(name);
          setAuthed(true);
        }}
      />
    );
  }

  return <VhuPortal centreId={centreId} centreName={centreName} />;
}
