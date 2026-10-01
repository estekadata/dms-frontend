"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, ChevronRight, Check, Trash2, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Recherche = {
  id: number;
  n_client: number;
  recherche: string;
  marque: string | null;
  notes: string | null;
  active: boolean;
  date_creation: string | null;
};

type ClientHit = { n_client: number; societe: string | null; nom_contact: string | null; nom_usage: string | null; ville: string | null };

type MoteurMatch = { n_moteur: number; nom_type_moteur: string | null; code_moteur: string | null; num_serie: string | null; marque: string | null; energie: string | null };

function clientLabel(c: { societe?: string | null; nom_usage?: string | null; nom_contact?: string | null; n_client: number }) {
  return c.societe || c.nom_usage || c.nom_contact || `Client #${c.n_client}`;
}

export default function RecherchesPage() {
  const [recherches, setRecherches] = useState<Recherche[]>([]);
  const [clientNames, setClientNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  // Formulaire d'ajout
  const [clientSearch, setClientSearch] = useState("");
  const [clientHits, setClientHits] = useState<ClientHit[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientHit | null>(null);
  const [terme, setTerme] = useState("");
  const [marque, setMarque] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const cliReq = useRef(0);

  // Correspondances (par recherche dépliée)
  const [expanded, setExpanded] = useState<number | null>(null);
  const [matches, setMatches] = useState<Record<number, MoteurMatch[]>>({});
  const [matchLoading, setMatchLoading] = useState<number | null>(null);
  const [busyMoteur, setBusyMoteur] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tbl_recherches_clients")
      .select("id, n_client, recherche, marque, notes, active, date_creation")
      .order("active", { ascending: false })
      .order("date_creation", { ascending: false })
      .limit(1000);
    const rows = (data as Recherche[]) || [];
    const ids = [...new Set(rows.map((r) => r.n_client).filter(Boolean))];
    const names: Record<number, string> = {};
    if (ids.length) {
      const { data: cli } = await supabase
        .from("tbl_clients")
        .select("n_client, societe, nom_contact, nom_usage")
        .in("n_client", ids);
      (cli || []).forEach((c: any) => {
        names[c.n_client] = clientLabel(c);
      });
    }
    setClientNames(names);
    setRecherches(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Recherche client (formulaire)
  useEffect(() => {
    const term = clientSearch.trim();
    if (!term) {
      setClientHits([]);
      return;
    }
    const my = ++cliReq.current;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("tbl_clients")
        .select("n_client, societe, nom_contact, nom_usage, ville")
        .or(`societe.ilike.%${term}%,nom_contact.ilike.%${term}%,nom_usage.ilike.%${term}%`)
        .order("societe", { ascending: true })
        .limit(30);
      if (my !== cliReq.current) return;
      setClientHits((data as ClientHit[]) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [clientSearch]);

  async function ajouter() {
    if (!selectedClient || !terme.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("tbl_recherches_clients").insert({
      n_client: selectedClient.n_client,
      recherche: terme.trim(),
      marque: marque.trim() || null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      alert(`Erreur : ${error.message}`);
      return;
    }
    setSelectedClient(null);
    setClientSearch("");
    setTerme("");
    setMarque("");
    setNotes("");
    await load();
  }

  async function resoudre(r: Recherche) {
    const { error } = await supabase
      .from("tbl_recherches_clients")
      .update({ active: false, date_resolue: new Date().toISOString() })
      .eq("id", r.id);
    if (error) {
      alert(`Erreur : ${error.message}`);
      return;
    }
    await load();
  }

  async function reactiver(r: Recherche) {
    const { error } = await supabase
      .from("tbl_recherches_clients")
      .update({ active: true, date_resolue: null })
      .eq("id", r.id);
    if (error) {
      alert(`Erreur : ${error.message}`);
      return;
    }
    await load();
  }

  async function supprimer(r: Recherche) {
    if (!confirm(`Supprimer la recherche « ${r.recherche} » ?`)) return;
    const { error } = await supabase.from("tbl_recherches_clients").delete().eq("id", r.id);
    if (error) {
      alert(`Erreur : ${error.message}`);
      return;
    }
    await load();
  }

  async function toggleMatches(r: Recherche) {
    if (expanded === r.id) {
      setExpanded(null);
      return;
    }
    setExpanded(r.id);
    if (matches[r.id]) return;
    setMatchLoading(r.id);
    const term = r.recherche.trim();
    let q = supabase
      .from("v_moteurs_dispo")
      .select("n_moteur, nom_type_moteur, code_moteur, num_serie, marque, energie")
      .eq("est_disponible", 1)
      .is("resa_client_moteur", null)
      .or(`nom_type_moteur.ilike.%${term}%,code_moteur.ilike.%${term}%`)
      .limit(50);
    if (r.marque) q = q.ilike("marque", `%${r.marque}%`);
    const { data } = await q;
    setMatches((prev) => ({ ...prev, [r.id]: (data as MoteurMatch[]) || [] }));
    setMatchLoading(null);
  }

  async function reserverPour(n_moteur: number, r: Recherche) {
    setBusyMoteur(n_moteur);
    const { error } = await supabase
      .from("tbl_moteurs")
      .update({ resa_client_moteur: String(r.n_client), date_resa_moteur: new Date().toISOString() })
      .eq("n_moteur", n_moteur);
    setBusyMoteur(null);
    if (error) {
      alert(`Erreur lors de la réservation : ${error.message}`);
      return;
    }
    // Retire le moteur réservé de la liste des correspondances
    setMatches((prev) => ({ ...prev, [r.id]: (prev[r.id] || []).filter((m) => m.n_moteur !== n_moteur) }));
  }

  const actives = recherches.filter((r) => r.active);
  const resolues = recherches.filter((r) => !r.active);

  function RechercheCard({ r }: { r: Recherche }) {
    const open = expanded === r.id;
    const matchRows = matches[r.id];
    return (
      <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <button onClick={() => toggleMatches(r)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <ChevronRight size={16} className={`shrink-0 text-text-muted transition-transform ${open ? "rotate-90" : ""}`} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">
                {r.recherche}
                {r.marque ? <span className="ml-2 text-xs font-normal text-text-muted">· {r.marque}</span> : null}
              </p>
              <p className="truncate text-xs text-text-dim">
                <Link href={`/clients/${r.n_client}`} onClick={(e) => e.stopPropagation()} className="text-brand hover:underline">
                  {clientNames[r.n_client] || `Client #${r.n_client}`}
                </Link>
                {r.notes ? ` — ${r.notes}` : ""}
              </p>
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            {r.active ? (
              <Button size="xs" variant="outline" onClick={() => resoudre(r)} title="Marquer comme résolue">
                <Check size={13} className="mr-1" /> Résoudre
              </Button>
            ) : (
              <Button size="xs" variant="outline" onClick={() => reactiver(r)}>
                Réactiver
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={() => supprimer(r)} className="text-text-dim hover:text-destructive" title="Supprimer">
              <Trash2 size={13} />
            </Button>
          </div>
        </div>

        {open && (
          <div className="border-t border-border px-4 py-3">
            {matchLoading === r.id ? (
              <p className="text-sm text-text-muted">Recherche des moteurs correspondants…</p>
            ) : !matchRows || matchRows.length === 0 ? (
              <p className="text-sm italic text-text-muted">Aucun moteur disponible ne correspond pour l&apos;instant.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-text-dim">
                  {matchRows.length} moteur{matchRows.length > 1 ? "s" : ""} disponible{matchRows.length > 1 ? "s" : ""}
                </p>
                {matchRows.map((m) => (
                  <div key={m.n_moteur} className="flex items-center justify-between gap-3 rounded-lg bg-surface-alt px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{m.nom_type_moteur || m.code_moteur || `Moteur #${m.n_moteur}`}</p>
                      <p className="truncate text-xs text-text-muted">
                        n°{m.n_moteur}
                        {m.marque ? ` · ${m.marque}` : ""}
                        {m.num_serie ? ` · SN ${m.num_serie}` : ""}
                      </p>
                    </div>
                    <Button size="xs" onClick={() => reserverPour(m.n_moteur, r)} disabled={busyMoteur === m.n_moteur}>
                      {busyMoteur === m.n_moteur ? "…" : `Réserver pour ${clientNames[r.n_client]?.split(" ")[0] || "client"}`}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Aide à la commande"
        description="Moteurs recherchés par client — l'outil propose les moteurs disponibles qui correspondent"
      />

      {/* Formulaire d'ajout */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
            <Plus size={16} className="text-brand" /> Nouvelle recherche client
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {/* Client */}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-text-dim">Client</label>
              {selectedClient ? (
                <div className="flex items-center justify-between rounded-lg border border-brand/30 bg-brand-soft px-3 py-2">
                  <span className="truncate text-sm font-medium text-foreground">{clientLabel(selectedClient)}</span>
                  <button onClick={() => setSelectedClient(null)} className="text-xs text-text-dim hover:text-foreground">Changer</button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <Input
                      placeholder="Rechercher un client…"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="border-border bg-surface-alt pl-9 text-foreground placeholder:text-text-muted"
                    />
                  </div>
                  {clientHits.length > 0 && (
                    <div className="mt-1 max-h-44 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                      {clientHits.map((h) => (
                        <button
                          key={h.n_client}
                          onClick={() => { setSelectedClient(h); setClientHits([]); setClientSearch(""); }}
                          className="w-full px-3 py-2 text-left transition-colors hover:bg-surface-hover"
                        >
                          <p className="text-sm font-medium text-foreground">{clientLabel(h)}</p>
                          <p className="text-xs text-text-dim">n°{h.n_client}{h.ville ? ` — ${h.ville}` : ""}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Moteur recherché */}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-text-dim">Moteur recherché *</label>
              <Input
                placeholder="Type ou code moteur (ex. K9K-752, 9H06…)"
                value={terme}
                onChange={(e) => setTerme(e.target.value)}
                className="border-border bg-surface-alt text-foreground placeholder:text-text-muted"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-text-dim">Marque (optionnel)</label>
              <Input
                placeholder="RENAULT, PSA…"
                value={marque}
                onChange={(e) => setMarque(e.target.value)}
                className="border-border bg-surface-alt text-foreground placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-text-dim">Note (optionnel)</label>
              <Input
                placeholder="Contexte, urgence, prix cible…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="border-border bg-surface-alt text-foreground placeholder:text-text-muted"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={ajouter} disabled={saving || !selectedClient || !terme.trim()} className="bg-brand text-white hover:bg-brand/80">
              {saving ? "Ajout…" : "Ajouter la recherche"}
            </Button>
            {(!selectedClient || !terme.trim()) && (
              <span className="text-xs text-text-muted">Sélectionne un client et saisis le moteur recherché.</span>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="py-12 text-center text-text-muted">Chargement…</div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="font-semibold text-foreground">Recherches actives</h3>
            <Badge className="border border-[rgba(196,30,58,0.20)] bg-brand-soft text-brand">{actives.length}</Badge>
          </div>
          {actives.length === 0 ? (
            <div className="rounded-[14px] border border-border bg-surface py-8 text-center italic text-text-muted">
              Aucune recherche active. Ajoute la première ci-dessus.
            </div>
          ) : (
            <div className="space-y-2">
              {actives.map((r) => (
                <RechercheCard key={r.id} r={r} />
              ))}
            </div>
          )}

          {resolues.length > 0 && (
            <>
              <h3 className="mb-3 mt-8 font-semibold text-text-dim">Résolues ({resolues.length})</h3>
              <div className="space-y-2 opacity-70">
                {resolues.map((r) => (
                  <RechercheCard key={r.id} r={r} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
