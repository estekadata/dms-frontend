"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FournisseurLite = { n_fournisseur: number; nom_fournisseur: string | null };

type MoteurDraft = {
  key: string;
  code_moteur: string;
  num_serie: string;
  prix_achat: string;
  etat: string;
  avec_bv: boolean;
};

function newMoteur(): MoteurDraft {
  return {
    key: Math.random().toString(36).slice(2),
    code_moteur: "",
    num_serie: "",
    prix_achat: "",
    etat: "",
    avec_bv: false,
  };
}

export default function NouvelleReceptionPage() {
  const router = useRouter();

  // Réception fields
  const [nReception, setNReception] = useState("");
  const [dateAchat, setDateAchat] = useState(() => new Date().toISOString().slice(0, 10));
  const [montantHt, setMontantHt] = useState("");
  const [observations, setObservations] = useState("");

  // Fournisseur picker
  const [fournisseurSearch, setFournisseurSearch] = useState("");
  const [fournisseurHits, setFournisseurHits] = useState<FournisseurLite[]>([]);
  const [selectedFournisseur, setSelectedFournisseur] = useState<FournisseurLite | null>(null);
  const [newFournisseurMode, setNewFournisseurMode] = useState(false);

  // Moteurs
  const [moteurs, setMoteurs] = useState<MoteurDraft[]>([newMoteur()]);

  // UI
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string>("");

  // Load current user (for utilisateur field)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const { user } = await res.json();
          if (user) setCurrentUser(user.nom || user.email || "");
        }
      } catch {}
    })();
  }, []);

  // Search fournisseurs as user types
  useEffect(() => {
    if (selectedFournisseur || newFournisseurMode) return;
    const q = fournisseurSearch.trim();
    if (!q) {
      setFournisseurHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("tbl_fournisseurs")
        .select("n_fournisseur, nom_fournisseur")
        .ilike("nom_fournisseur", `%${q}%`)
        .order("nom_fournisseur", { ascending: true })
        .limit(20);
      setFournisseurHits((data as FournisseurLite[]) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [fournisseurSearch, selectedFournisseur, newFournisseurMode]);

  function addMoteur() {
    setMoteurs((prev) => [...prev, newMoteur()]);
  }
  function removeMoteur(key: string) {
    setMoteurs((prev) => (prev.length > 1 ? prev.filter((m) => m.key !== key) : prev));
  }
  function updateMoteur(key: string, patch: Partial<MoteurDraft>) {
    setMoteurs((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }

  async function handleSubmit() {
    setErrorMsg(null);

    // Validation
    const n_reception = parseInt(nReception, 10);
    if (!Number.isFinite(n_reception) || n_reception <= 0) {
      setErrorMsg("Le numéro de réception doit être un entier positif.");
      return;
    }
    if (!selectedFournisseur && !(newFournisseurMode && fournisseurSearch.trim())) {
      setErrorMsg("Choisis ou crée un fournisseur.");
      return;
    }
    if (!dateAchat) {
      setErrorMsg("Date d'achat requise.");
      return;
    }
    const validMoteurs = moteurs.filter((m) => m.code_moteur.trim() || m.num_serie.trim());
    if (validMoteurs.length === 0) {
      setErrorMsg("Ajoute au moins un moteur (code ou numéro de série).");
      return;
    }

    setSaving(true);
    try {
      // 1. Vérifie que le n_reception n'existe pas déjà
      const { data: existing } = await supabase
        .from("tbl_receptions")
        .select("n_reception")
        .eq("n_reception", n_reception)
        .maybeSingle();
      if (existing) {
        setErrorMsg(`La réception n°${n_reception} existe déjà. Choisis un autre numéro.`);
        setSaving(false);
        return;
      }

      // 2. Crée le fournisseur si nouveau
      let n_fournisseur: number;
      if (selectedFournisseur) {
        n_fournisseur = selectedFournisseur.n_fournisseur;
      } else {
        // calcul du prochain n_fournisseur
        const { data: maxF } = await supabase
          .from("tbl_fournisseurs")
          .select("n_fournisseur")
          .order("n_fournisseur", { ascending: false })
          .limit(1);
        const nextF = ((maxF || [])[0]?.n_fournisseur || 0) + 1;
        const { error: errF } = await supabase
          .from("tbl_fournisseurs")
          .insert({ n_fournisseur: nextF, nom_fournisseur: fournisseurSearch.trim(), afficher: true });
        if (errF) throw new Error(`Création fournisseur échouée : ${errF.message}`);
        n_fournisseur = nextF;
      }

      // 3. Insère la réception (en brouillon)
      const { error: errR } = await supabase.from("tbl_receptions").insert({
        n_reception,
        n_fournisseur,
        date_achat: new Date(dateAchat).toISOString(),
        montant_ht: montantHt ? parseFloat(montantHt) : null,
        autres_info: observations || null,
        reception_terminee: false,
      });
      if (errR) throw new Error(`Création réception échouée : ${errR.message}`);

      // 4. Calcul du prochain n_moteur (offset à partir de MAX existant)
      const { data: maxM } = await supabase
        .from("tbl_moteurs")
        .select("n_moteur")
        .order("n_moteur", { ascending: false })
        .limit(1);
      const baseN = ((maxM || [])[0]?.n_moteur || 0);

      // 5. Insère les moteurs en batch
      const nowIso = new Date().toISOString();
      const moteurRows = validMoteurs.map((m, i) => ({
        n_moteur: baseN + i + 1,
        num_reception: n_reception,
        code_moteur: m.code_moteur.trim().toUpperCase() || null,
        num_serie: m.num_serie.trim() || null,
        prix_achat_moteur: m.prix_achat ? parseFloat(m.prix_achat) : null,
        observations: m.etat.trim() || null,
        info_bv: m.avec_bv ? "Oui" : null,
        utilisateur: currentUser || null,
        date_modif: nowIso,
      }));
      const { error: errM } = await supabase.from("tbl_moteurs").insert(moteurRows);
      if (errM) throw new Error(`Insertion moteurs échouée : ${errM.message}`);

      router.push("/receptions");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Link
        href="/receptions"
        className="inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground mb-4"
      >
        <ArrowLeft size={14} /> Retour aux réceptions
      </Link>

      <PageHeader
        title="Nouvelle réception"
        description="Saisie d'un arrivage fournisseur — enregistré en brouillon, à valider ensuite"
      />

      {errorMsg && (
        <div className="mb-5 bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.25)] rounded-[14px] p-4 text-sm text-red-600">
          {errorMsg}
        </div>
      )}

      {/* Section : entête réception */}
      <Card className="mb-6">
        <CardContent className="p-5 space-y-4">
          <h3 className="font-semibold text-foreground">Informations réception</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="n_reception" className="text-text-dim">N° de réception *</Label>
              <Input
                id="n_reception"
                type="number"
                value={nReception}
                onChange={(e) => setNReception(e.target.value)}
                placeholder="Ex: 2322"
                className="mt-1 bg-surface-alt border-border text-foreground"
              />
            </div>
            <div>
              <Label htmlFor="date_achat" className="text-text-dim">Date d&apos;achat *</Label>
              <Input
                id="date_achat"
                type="date"
                value={dateAchat}
                onChange={(e) => setDateAchat(e.target.value)}
                className="mt-1 bg-surface-alt border-border text-foreground"
              />
            </div>
          </div>

          {/* Fournisseur picker */}
          <div>
            <Label className="text-text-dim">Fournisseur *</Label>
            {selectedFournisseur ? (
              <div className="mt-1 flex items-center justify-between bg-brand-soft border border-brand/30 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{selectedFournisseur.nom_fournisseur}</p>
                  <p className="text-xs text-text-dim">n° {selectedFournisseur.n_fournisseur}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFournisseur(null);
                    setFournisseurSearch("");
                    setNewFournisseurMode(false);
                  }}
                  className="text-xs text-text-dim hover:text-foreground"
                >
                  Changer
                </button>
              </div>
            ) : newFournisseurMode ? (
              <div className="mt-1 space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Nom du nouveau fournisseur"
                    value={fournisseurSearch}
                    onChange={(e) => setFournisseurSearch(e.target.value)}
                    className="bg-surface-alt border-border text-foreground"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setNewFournisseurMode(false);
                      setFournisseurSearch("");
                    }}
                  >
                    Annuler
                  </Button>
                </div>
                <p className="text-xs text-text-muted">
                  Ce fournisseur sera créé avec juste son nom — tu pourras compléter ses coordonnées ensuite.
                </p>
              </div>
            ) : (
              <div className="mt-1 space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    placeholder="Rechercher un fournisseur existant..."
                    value={fournisseurSearch}
                    onChange={(e) => setFournisseurSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-alt border border-border text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-brand"
                  />
                </div>
                {fournisseurHits.length > 0 && (
                  <div className="max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                    {fournisseurHits.map((f) => (
                      <button
                        type="button"
                        key={f.n_fournisseur}
                        onClick={() => {
                          setSelectedFournisseur(f);
                          setFournisseurSearch("");
                          setFournisseurHits([]);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-surface-hover transition-colors"
                      >
                        <p className="text-sm font-medium text-foreground">{f.nom_fournisseur}</p>
                        <p className="text-xs text-text-dim">n° {f.n_fournisseur}</p>
                      </button>
                    ))}
                  </div>
                )}
                {fournisseurSearch.trim() && fournisseurHits.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setNewFournisseurMode(true)}
                    className="text-xs text-brand hover:underline"
                  >
                    + Créer &quot;{fournisseurSearch.trim()}&quot; comme nouveau fournisseur
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="montant_ht" className="text-text-dim">Montant HT total (€)</Label>
              <Input
                id="montant_ht"
                type="number"
                step="0.01"
                value={montantHt}
                onChange={(e) => setMontantHt(e.target.value)}
                placeholder="Ex: 12500"
                className="mt-1 bg-surface-alt border-border text-foreground"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="observations" className="text-text-dim">Observations</Label>
            <textarea
              id="observations"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Notes, conditions de livraison, etc."
              rows={2}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-alt border border-border text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-brand"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section : moteurs */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-foreground">Moteurs reçus ({moteurs.length})</h3>
            <Button type="button" variant="outline" size="sm" onClick={addMoteur}>
              <Plus size={14} className="mr-1" /> Ajouter un moteur
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-text-dim text-xs uppercase">
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left">Code moteur *</th>
                  <th className="px-2 py-2 text-left">Num série</th>
                  <th className="px-2 py-2 text-right w-32">Prix achat (€)</th>
                  <th className="px-2 py-2 text-left">État / Obs</th>
                  <th className="px-2 py-2 text-center w-24">Avec BV</th>
                  <th className="px-2 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {moteurs.map((m) => (
                  <tr key={m.key}>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={m.code_moteur}
                        onChange={(e) => updateMoteur(m.key, { code_moteur: e.target.value })}
                        placeholder="K9K714"
                        className="w-full px-2 py-1.5 rounded bg-surface-alt border border-border text-sm font-mono uppercase text-foreground"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={m.num_serie}
                        onChange={(e) => updateMoteur(m.key, { num_serie: e.target.value })}
                        placeholder="123456"
                        className="w-full px-2 py-1.5 rounded bg-surface-alt border border-border text-sm text-foreground"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={m.prix_achat}
                        onChange={(e) => updateMoteur(m.key, { prix_achat: e.target.value })}
                        placeholder="450"
                        className="w-full px-2 py-1.5 rounded bg-surface-alt border border-border text-sm text-right tabular-nums text-foreground"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={m.etat}
                        onChange={(e) => updateMoteur(m.key, { etat: e.target.value })}
                        placeholder="Bon état, complet..."
                        className="w-full px-2 py-1.5 rounded bg-surface-alt border border-border text-sm text-foreground"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={m.avec_bv}
                        onChange={(e) => updateMoteur(m.key, { avec_bv: e.target.checked })}
                        className="w-4 h-4 rounded border-border bg-surface-alt"
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeMoteur(m.key)}
                        disabled={moteurs.length <= 1}
                        className="text-text-dim hover:text-destructive disabled:opacity-30"
                        title="Supprimer cette ligne"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Link href="/receptions">
          <Button variant="outline" disabled={saving}>Annuler</Button>
        </Link>
        <Button onClick={handleSubmit} disabled={saving} className="bg-brand hover:bg-brand/80 text-white">
          {saving ? "Enregistrement..." : "Enregistrer en brouillon"}
        </Button>
      </div>
    </div>
  );
}
