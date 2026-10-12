"use client";
import { useState } from "react";
import Link from "next/link";
import { Users, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Buyer = { id: number; name: string; count: number; last: string | null };
type Search = { id: number; name: string; recherche: string };
type Result = { buyers: Buyer[]; searches: Search[] } | null;

/**
 * Propose les clients susceptibles d'être intéressés par un moteur, à partir
 * de son code / type : acheteurs historiques du même type + recherches actives
 * correspondantes (aide à la commande). Chargement à la demande (bouton).
 */
export function ClientsInteresses({ code }: { code: string }) {
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Result>(null);
  const [opened, setOpened] = useState(false);

  const clean = code.trim().replace(/[%,()]/g, "");

  async function lookup() {
    setOpened(true);
    if (clean.length < 2) {
      setRes({ buyers: [], searches: [] });
      return;
    }
    setLoading(true);
    try {
      // 1. Moteurs dont le code OU le type correspond
      const { data: mots } = await supabase
        .from("v_moteurs_dispo")
        .select("n_moteur")
        .or(`code_moteur.ilike.%${clean}%,nom_type_moteur.ilike.%${clean}%`)
        .limit(2000);
      const ids = (mots || []).map((m: any) => m.n_moteur).filter(Boolean) as number[];

      // 2. Lesquels ont été expédiés (vendus)
      const expByMot: Record<number, number> = {};
      for (let i = 0; i < ids.length; i += 300) {
        const slice = ids.slice(i, i + 300);
        const { data } = await supabase
          .from("tbl_expeditions_moteurs")
          .select("n_moteur, n_expedition")
          .in("n_moteur", slice);
        (data || []).forEach((r: any) => {
          if (r.n_expedition) expByMot[r.n_moteur] = r.n_expedition;
        });
      }
      const exps = [...new Set(Object.values(expByMot))];

      // 3. Expéditions -> client (comptage + dernière date)
      const cliAgg: Record<number, { count: number; last: string | null }> = {};
      for (let i = 0; i < exps.length; i += 300) {
        const slice = exps.slice(i, i + 300);
        const { data } = await supabase
          .from("tbl_expeditions")
          .select("n_expedition, n_client, date_chargement")
          .in("n_expedition", slice);
        (data || []).forEach((r: any) => {
          const c = r.n_client;
          if (c == null) return;
          const g = cliAgg[c] || (cliAgg[c] = { count: 0, last: null });
          g.count++;
          if (r.date_chargement && (!g.last || r.date_chargement > g.last)) g.last = r.date_chargement;
        });
      }
      const topBuyers = Object.entries(cliAgg)
        .map(([id, g]) => ({ id: Number(id), ...g }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      // 4. Recherches actives correspondantes (aide à la commande)
      let searches: { n_client: number; recherche: string }[] = [];
      try {
        const { data } = await supabase
          .from("tbl_recherches_clients")
          .select("n_client, recherche")
          .eq("active", true)
          .ilike("recherche", `%${clean}%`)
          .limit(10);
        searches = (data as any[]) || [];
      } catch {
        searches = [];
      }

      // 5. Noms des clients (acheteurs + recherches)
      const allIds = [...new Set([...topBuyers.map((b) => b.id), ...searches.map((s) => s.n_client)])];
      const names: Record<number, string> = {};
      if (allIds.length) {
        const { data } = await supabase
          .from("tbl_clients")
          .select("n_client, societe, nom_usage, nom_contact")
          .in("n_client", allIds);
        (data || []).forEach((c: any) => {
          names[c.n_client] = c.societe || c.nom_usage || c.nom_contact || `Client #${c.n_client}`;
        });
      }

      setRes({
        buyers: topBuyers.map((b) => ({ id: b.id, name: names[b.id] || `Client #${b.id}`, count: b.count, last: b.last })),
        searches: searches.map((s) => ({ id: s.n_client, name: names[s.n_client] || `Client #${s.n_client}`, recherche: s.recherche })),
      });
    } finally {
      setLoading(false);
    }
  }

  if (!clean) return null;

  if (!opened) {
    return (
      <button
        type="button"
        onClick={lookup}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
      >
        <Users size={12} /> Clients intéressés ?
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-xs">
      {loading ? (
        <span className="inline-flex items-center gap-2 text-text-muted">
          <Loader2 size={12} className="animate-spin" /> Recherche des clients…
        </span>
      ) : !res || (res.buyers.length === 0 && res.searches.length === 0) ? (
        <span className="italic text-text-muted">Aucun client identifié pour « {clean} ».</span>
      ) : (
        <div className="space-y-1.5">
          {res.searches.length > 0 && (
            <div>
              <span className="font-semibold text-amber-600">Recherche active : </span>
              {res.searches.map((s, i) => (
                <span key={`s${s.id}${i}`}>
                  <Link href={`/clients/${s.id}`} className="text-brand hover:underline">{s.name}</Link>
                  {i < res.searches.length - 1 ? ", " : ""}
                </span>
              ))}
            </div>
          )}
          {res.buyers.length > 0 && (
            <div>
              <span className="font-semibold text-text-dim">Ont déjà acheté ce type : </span>
              {res.buyers.map((b, i) => (
                <span key={b.id}>
                  <Link href={`/clients/${b.id}`} className="text-brand hover:underline" title={b.last ? `dernier achat ${new Date(b.last).toLocaleDateString("fr-FR")}` : undefined}>
                    {b.name}
                  </Link>
                  <span className="text-text-muted"> ({b.count})</span>
                  {i < res.buyers.length - 1 ? ", " : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
