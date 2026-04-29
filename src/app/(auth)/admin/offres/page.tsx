"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";

type Offer = {
  id: number;
  breaker_id: number;
  breaker_name: string;
  code_moteur: string;
  marque: string | null;
  energie: string | null;
  type_nom: string | null;
  type_modele: string | null;
  type_annee: string | null;
  prix_demande: number | null;
  qty: number | null;
  note: string | null;
  created_at: string;
};

export default function OffresAdminPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("v_offres_pending").select("*");
    if (error) {
      setFlash({ kind: "err", msg: `Chargement KO : ${error.message}` });
      setOffers([]);
    } else {
      setOffers(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Group by breaker
  const grouped = useMemo(() => {
    const map = new Map<number, { breaker_id: number; breaker_name: string; rows: Offer[] }>();
    for (const o of offers) {
      const g = map.get(o.breaker_id);
      if (g) g.rows.push(o);
      else map.set(o.breaker_id, { breaker_id: o.breaker_id, breaker_name: o.breaker_name, rows: [o] });
    }
    return Array.from(map.values());
  }, [offers]);

  function selectedIdsForBreaker(breakerId: number): number[] {
    return offers.filter((o) => o.breaker_id === breakerId && selected[o.id]).map((o) => o.id);
  }

  function toggleAllForBreaker(breakerId: number, value: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      offers.filter((o) => o.breaker_id === breakerId).forEach((o) => { next[o.id] = value; });
      return next;
    });
  }

  async function accept(breakerId: number) {
    const ids = selectedIdsForBreaker(breakerId);
    if (ids.length === 0) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_accept_offers", { p_offer_ids: ids });
    setBusy(false);
    if (error) {
      setFlash({ kind: "err", msg: `Erreur : ${error.message}` });
    } else {
      setFlash({ kind: "ok", msg: `${ids.length} offre(s) acceptee(s) — reception #${data} creee` });
      setSelected({});
      load();
    }
  }

  async function reject(breakerId: number) {
    const ids = selectedIdsForBreaker(breakerId);
    if (ids.length === 0) return;
    if (!confirm(`Refuser ${ids.length} offre(s) ?`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_reject_offers", { p_offer_ids: ids });
    setBusy(false);
    if (error) {
      setFlash({ kind: "err", msg: `Erreur : ${error.message}` });
    } else {
      setFlash({ kind: "ok", msg: `${data} offre(s) refusee(s)` });
      setSelected({});
      load();
    }
  }

  return (
    <div>
      <PageHeader title="Offres VHU" subtitle="Propositions des centres VHU en attente de validation" />

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-dim">
          {offers.length} offre(s) en attente, regroupees par centre VHU.
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading || busy}>
          <RefreshCw size={14} className="mr-2" /> Rafraichir
        </Button>
      </div>

      {flash && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          flash.kind === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {flash.msg}
          <button className="ml-3 text-xs underline" onClick={() => setFlash(null)}>fermer</button>
        </div>
      )}

      {loading ? (
        <p className="text-text-dim">Chargement...</p>
      ) : grouped.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-text-dim">Aucune offre en attente</CardContent></Card>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => {
            const ids = selectedIdsForBreaker(g.breaker_id);
            const allSelected = ids.length === g.rows.length && g.rows.length > 0;
            return (
              <Card key={g.breaker_id}>
                <CardContent className="p-0">
                  <div className="px-4 py-3 border-b bg-surface-alt flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{g.breaker_name}</h3>
                      <p className="text-xs text-text-dim">{g.rows.length} offre(s) — {ids.length} selectionnee(s)</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={busy || ids.length === 0} onClick={() => reject(g.breaker_id)}>
                        <XCircle size={14} className="mr-2" /> Refuser ({ids.length})
                      </Button>
                      <Button size="sm" disabled={busy || ids.length === 0} onClick={() => accept(g.breaker_id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        <CheckCircle2 size={14} className="mr-2" /> Accepter ({ids.length})
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-alt text-text-dim border-b">
                        <tr>
                          <th className="px-3 py-2 text-left">
                            <input type="checkbox" checked={allSelected}
                              onChange={(e) => toggleAllForBreaker(g.breaker_id, e.target.checked)} />
                          </th>
                          <th className="px-3 py-2 text-left">Code moteur</th>
                          <th className="px-3 py-2 text-left">Marque</th>
                          <th className="px-3 py-2 text-left">Energie</th>
                          <th className="px-3 py-2 text-right">Prix</th>
                          <th className="px-3 py-2 text-center">Qte</th>
                          <th className="px-3 py-2 text-left">Note</th>
                          <th className="px-3 py-2 text-left">Recue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {g.rows.map((o) => (
                          <tr key={o.id} className="hover:bg-surface-hover">
                            <td className="px-3 py-2">
                              <input type="checkbox" checked={!!selected[o.id]}
                                onChange={(e) => setSelected((p) => ({ ...p, [o.id]: e.target.checked }))} />
                            </td>
                            <td className="px-3 py-2 font-semibold">{o.code_moteur}</td>
                            <td className="px-3 py-2">
                              {o.marque ? <Badge className="bg-blue-50 text-blue-700">{o.marque}</Badge> : "—"}
                            </td>
                            <td className="px-3 py-2">
                              {o.energie ? <Badge className="bg-emerald-50 text-emerald-700">{o.energie}</Badge> : "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {o.prix_demande != null ? `${o.prix_demande} €` : "—"}
                            </td>
                            <td className="px-3 py-2 text-center">{o.qty ?? 1}</td>
                            <td className="px-3 py-2 text-text-dim text-xs">{o.note || "—"}</td>
                            <td className="px-3 py-2 text-text-dim text-xs">
                              {new Date(o.created_at).toLocaleString("fr-FR")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
