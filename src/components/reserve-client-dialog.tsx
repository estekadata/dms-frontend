"use client";
import { useEffect, useRef, useState } from "react";
import { X, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

type ClientHit = {
  n_client: number;
  societe: string | null;
  nom_contact: string | null;
  nom_usage: string | null;
  ville: string | null;
};

function clientLabel(c: ClientHit) {
  return (
    c.societe ||
    c.nom_usage ||
    c.nom_contact ||
    `Client #${c.n_client}`
  );
}

export type ReserveDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (clientId: number) => Promise<void> | void;
  title: string;
  pieceLabel: string; // e.g. "CR12DE — moteur n°180970"
};

export function ReserveClientDialog({ open, onClose, onConfirm, title, pieceLabel }: ReserveDialogProps) {
  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ClientHit | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const reqRef = useRef(0);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setRawSearch("");
      setSearch("");
      setHits([]);
      setSelected(null);
      setSubmitting(false);
    }
  }, [open]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(rawSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [rawSearch]);

  // Run search
  useEffect(() => {
    if (!open) return;
    if (!search) {
      setHits([]);
      return;
    }
    const my = ++reqRef.current;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("tbl_clients")
        .select("n_client, societe, nom_contact, nom_usage, ville")
        .or(
          `societe.ilike.%${search}%,nom_contact.ilike.%${search}%,nom_usage.ilike.%${search}%`
        )
        .order("societe", { ascending: true })
        .limit(50);
      if (my !== reqRef.current) return;
      setHits((data as ClientHit[]) || []);
      setLoading(false);
    })();
  }, [search, open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleConfirm() {
    if (!selected) return;
    setSubmitting(true);
    try {
      await onConfirm(selected.n_client);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-surface rounded-[14px] border border-border shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-foreground">{title}</h2>
            <p className="text-xs text-text-muted mt-0.5">{pieceLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="text-text-dim hover:text-foreground p-1 rounded"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase text-text-dim mb-2 block">
              Client
            </label>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                autoFocus
                type="text"
                placeholder="Rechercher société ou contact..."
                value={rawSearch}
                onChange={(e) => setRawSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-alt border border-border text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          {selected ? (
            <div className="bg-brand-soft border border-brand/30 rounded-lg px-3 py-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">{clientLabel(selected)}</p>
                <p className="text-xs text-text-dim">
                  Client n°{selected.n_client}
                  {selected.ville ? ` — ${selected.ville}` : ""}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-text-dim hover:text-foreground text-xs"
              >
                Changer
              </button>
            </div>
          ) : search ? (
            <div className="max-h-64 overflow-y-auto border border-border rounded-lg divide-y divide-border">
              {loading ? (
                <p className="text-center py-6 text-sm text-text-muted">Recherche...</p>
              ) : hits.length === 0 ? (
                <p className="text-center py-6 text-sm text-text-muted italic">Aucun client trouvé</p>
              ) : (
                hits.map((h) => (
                  <button
                    key={h.n_client}
                    onClick={() => setSelected(h)}
                    className="w-full text-left px-3 py-2 hover:bg-surface-hover transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground">{clientLabel(h)}</p>
                    <p className="text-xs text-text-dim">
                      n°{h.n_client}
                      {h.ville ? ` — ${h.ville}` : ""}
                    </p>
                  </button>
                ))
              )}
            </div>
          ) : (
            <p className="text-xs text-text-muted italic">
              Tape au moins quelques caractères pour rechercher un client.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 bg-surface-alt border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={!selected || submitting}>
            {submitting ? "Réservation..." : "Réserver"}
          </Button>
        </div>
      </div>
    </div>
  );
}
