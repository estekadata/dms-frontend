"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const ITEMS_PER_PAGE = 20;

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

    // Verify access code against env
    const expectedCode = process.env.NEXT_PUBLIC_BREAKER_ACCESS_CODE;
    if (expectedCode && code !== expectedCode) {
      setError("Code d'acces invalide");
      setLoading(false);
      return;
    }

    // Find or register the centre in breakers
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
              <Input
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Entrez le code d'acces"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Nom du centre</Label>
              <Input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Ex: Centre Auto Toulouse"
                className="mt-1"
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <Button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-[#C41E3A] hover:bg-[#8B1A2B] text-white"
            >
              {loading ? "Connexion..." : "Se connecter"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ────────── OFFER FORM ────────── */
function OfferForm({ besoin, centreId, onSubmit }: { besoin: any; centreId: string; onSubmit: () => void }) {
  const [prix, setPrix] = useState("");
  const [quantite, setQuantite] = useState("1");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    if (!prix) return;
    setSubmitting(true);
    const { error } = await supabase.from("breaker_click_offers").insert({
      breaker_id: centreId,
      code_moteur: besoin.code_moteur,
      prix: parseFloat(prix),
      quantite: parseInt(quantite) || 1,
      note: note || null,
    });
    if (error) {
      alert("Erreur: " + error.message);
    } else {
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onSubmit(); }, 1500);
    }
    setSubmitting(false);
  }

  if (success) return <div className="text-emerald-600 text-sm font-medium py-2">Offre envoyee avec succes !</div>;

  return (
    <div className="mt-3 p-3 bg-gray-50 rounded-lg space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Prix (EUR)</Label>
          <Input type="number" value={prix} onChange={(e) => setPrix(e.target.value)} placeholder="350" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Quantite</Label>
          <Input type="number" value={quantite} onChange={(e) => setQuantite(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Note</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optionnel" className="mt-1" />
        </div>
      </div>
      <Button
        onClick={handleSubmit}
        disabled={submitting || !prix}
        className="bg-[#C41E3A] hover:bg-[#8B1A2B] text-white w-full"
        size="sm"
      >
        {submitting ? "Envoi..." : "Envoyer l'offre"}
      </Button>
    </div>
  );
}

/* ────────── MAIN PORTAL ────────── */
function VhuPortal({ centreId, centreName }: { centreId: string; centreName: string }) {
  const [besoins, setBesoins] = useState<any[]>([]);
  const [totalBesoins, setTotalBesoins] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchPlaque, setSearchPlaque] = useState("");
  const [searchMoteur, setSearchMoteur] = useState("");
  const [plaqueResults, setPlaqueResults] = useState<any[] | null>(null);
  const [moteurResults, setMoteurResults] = useState<any[] | null>(null);
  const [expandedBesoin, setExpandedBesoin] = useState<string | null>(null);
  const [todayCount, setTodayCount] = useState(0);

  // Free offer form
  const [freeCode, setFreeCode] = useState("");
  const [freeDesc, setFreeDesc] = useState("");
  const [freePrix, setFreePrix] = useState("");
  const [freeNote, setFreeNote] = useState("");
  const [freeSubmitting, setFreeSubmitting] = useState(false);

  // Load stats
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

  // Load besoins
  const loadBesoins = useCallback(async () => {
    setLoading(true);
    const from = page * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    const { data, count } = await supabase
      .from("v_besoins")
      .select("*", { count: "exact" })
      .order("urgence", { ascending: false })
      .range(from, to);

    setBesoins(data || []);
    setTotalBesoins(count || 0);
    setLoading(false);
  }, [page]);

  useEffect(() => { loadBesoins(); }, [loadBesoins]);

  // Plaque search
  async function handlePlaqueSearch() {
    if (!searchPlaque) return;
    const { data } = await supabase
      .from("plaques_vehicules")
      .select("*")
      .ilike("plaque", `%${searchPlaque.toUpperCase()}%`)
      .limit(10);
    setPlaqueResults(data || []);
  }

  // Motor search
  async function handleMoteurSearch() {
    if (!searchMoteur) return;
    const { data } = await supabase
      .from("v_besoins")
      .select("*")
      .ilike("code_moteur", `%${searchMoteur.toUpperCase()}%`)
      .limit(20);
    setMoteurResults(data || []);
  }

  // Free offer submit
  async function submitFreeOffer() {
    if (!freeCode && !freeDesc) return;
    setFreeSubmitting(true);
    const { error } = await supabase.from("breaker_free_offers").insert({
      breaker_id: centreId,
      code_moteur: freeCode || null,
      description: freeDesc || null,
      prix: freePrix ? parseFloat(freePrix) : null,
      note: freeNote || null,
    });
    if (error) {
      alert("Erreur: " + error.message);
    } else {
      setFreeCode(""); setFreeDesc(""); setFreePrix(""); setFreeNote("");
      alert("Offre libre envoyee !");
    }
    setFreeSubmitting(false);
  }

  function handleLogout() {
    sessionStorage.removeItem("vhu_centre_id");
    sessionStorage.removeItem("vhu_centre_name");
    window.location.reload();
  }

  const totalPages = Math.ceil(totalBesoins / ITEMS_PER_PAGE);

  const urgencyColor = (u: number) => {
    if (u >= 8) return "bg-red-100 text-red-700";
    if (u >= 5) return "bg-amber-100 text-amber-700";
    return "bg-gray-100 text-gray-600";
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portail VHU</h1>
          <p className="text-gray-500">Centre : <span className="font-semibold text-gray-700">{centreName}</span></p>
        </div>
        <Button variant="outline" onClick={handleLogout}>Deconnexion</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Offres aujourd&apos;hui</p>
            <p className="text-2xl font-bold text-[#C41E3A]">{todayCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Besoins actifs</p>
            <p className="text-2xl font-bold text-gray-700">{totalBesoins}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Plate search */}
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-gray-700 mb-3">Recherche par plaque</h3>
            <div className="flex gap-2">
              <Input
                value={searchPlaque}
                onChange={(e) => setSearchPlaque(e.target.value)}
                placeholder="AA-123-BB"
                className="uppercase"
                onKeyDown={(e) => e.key === "Enter" && handlePlaqueSearch()}
              />
              <Button onClick={handlePlaqueSearch} className="bg-[#C41E3A] hover:bg-[#8B1A2B] text-white">Chercher</Button>
            </div>
            {plaqueResults !== null && (
              <div className="mt-3">
                {plaqueResults.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucun resultat</p>
                ) : (
                  <div className="space-y-2">
                    {plaqueResults.map((p, i) => (
                      <div key={i} className="border rounded-lg p-2 text-sm">
                        <span className="font-mono font-bold">{p.plaque}</span>
                        {p.code_moteur && <span className="ml-2 text-gray-500">Moteur: {p.code_moteur}</span>}
                        {p.marque && <span className="ml-2 text-gray-500">{p.marque}</span>}
                        {p.modele && <span className="ml-1 text-gray-400">{p.modele}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Motor search */}
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-gray-700 mb-3">Recherche moteur</h3>
            <div className="flex gap-2">
              <Input
                value={searchMoteur}
                onChange={(e) => setSearchMoteur(e.target.value)}
                placeholder="Code moteur..."
                className="uppercase"
                onKeyDown={(e) => e.key === "Enter" && handleMoteurSearch()}
              />
              <Button onClick={handleMoteurSearch} className="bg-[#C41E3A] hover:bg-[#8B1A2B] text-white">Chercher</Button>
            </div>
            {moteurResults !== null && (
              <div className="mt-3">
                {moteurResults.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucun besoin correspondant</p>
                ) : (
                  <div className="space-y-2">
                    {moteurResults.map((b, i) => (
                      <div key={i} className="border rounded-lg p-2 text-sm flex items-center justify-between">
                        <div>
                          <span className="font-mono font-bold">{b.code_moteur}</span>
                          {b.marque && <Badge className="ml-2 bg-blue-100 text-blue-700">{b.marque}</Badge>}
                          {b.energie && <Badge className="ml-1 bg-gray-100 text-gray-600">{b.energie}</Badge>}
                        </div>
                        {b.prix_moyen && <span className="font-semibold text-[#C41E3A]">{Math.round(b.prix_moyen)} EUR moy.</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Besoins list */}
      <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
        <h3 className="font-semibold text-gray-700 mb-4">Besoins en cours ({totalBesoins})</h3>
        {loading ? (
          <div className="text-center py-10 text-gray-400">Chargement...</div>
        ) : (
          <div className="space-y-3">
            {besoins.map((b, i) => (
              <div key={i} className="border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge className="font-mono bg-gray-900 text-white hover:bg-gray-900">{b.code_moteur || "—"}</Badge>
                    {b.urgence != null && <Badge className={urgencyColor(b.urgence)}>Urgence {b.urgence}</Badge>}
                    {b.prix_moyen && <span className="text-sm text-gray-600">{Math.round(b.prix_moyen)} EUR moy.</span>}
                    {b.marque && <Badge className="bg-blue-50 text-blue-700">{b.marque}</Badge>}
                    {b.energie && <Badge className="bg-emerald-50 text-emerald-700">{b.energie}</Badge>}
                    {b.quantite && <span className="text-xs text-gray-400">Qte: {b.quantite}</span>}
                  </div>
                  <Button
                    size="sm"
                    variant={expandedBesoin === b.code_moteur ? "outline" : "default"}
                    className={expandedBesoin === b.code_moteur ? "" : "bg-[#C41E3A] hover:bg-[#8B1A2B] text-white"}
                    onClick={() => setExpandedBesoin(expandedBesoin === b.code_moteur ? null : b.code_moteur)}
                  >
                    {expandedBesoin === b.code_moteur ? "Fermer" : "Je l'ai"}
                  </Button>
                </div>
                {expandedBesoin === b.code_moteur && (
                  <OfferForm besoin={b} centreId={centreId} onSubmit={() => setExpandedBesoin(null)} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Precedent
            </Button>
            <span className="text-sm text-gray-500">
              Page {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              Suivant
            </Button>
          </div>
        )}
      </div>

      {/* Free offer section */}
      <Card className="border-[#C41E3A]/20">
        <CardContent className="p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Proposer une offre libre</h3>
          <p className="text-sm text-gray-500 mb-4">Proposez un moteur ou une piece que vous avez en stock, meme sans besoin correspondant.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label>Code moteur</Label>
              <Input value={freeCode} onChange={(e) => setFreeCode(e.target.value)} placeholder="N47D20A" className="mt-1 uppercase" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={freeDesc} onChange={(e) => setFreeDesc(e.target.value)} placeholder="Moteur diesel 2.0..." className="mt-1" />
            </div>
            <div>
              <Label>Prix (EUR)</Label>
              <Input type="number" value={freePrix} onChange={(e) => setFreePrix(e.target.value)} placeholder="400" className="mt-1" />
            </div>
            <div>
              <Label>Note</Label>
              <Input value={freeNote} onChange={(e) => setFreeNote(e.target.value)} placeholder="Optionnel" className="mt-1" />
            </div>
          </div>
          <Button
            onClick={submitFreeOffer}
            disabled={freeSubmitting || (!freeCode && !freeDesc)}
            className="mt-4 bg-[#C41E3A] hover:bg-[#8B1A2B] text-white"
          >
            {freeSubmitting ? "Envoi..." : "Envoyer l'offre libre"}
          </Button>
        </CardContent>
      </Card>
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
