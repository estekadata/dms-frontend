"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { parseXlsxRows, mapHeaders, toNumber } from "@/lib/import-xlsx";

type Breaker = { id: number; name: string };
type OfferRow = { code_moteur: string; marque: string | null; energie: string | null; prix_demande: number | null; qty: number | null; immatriculation: string | null; vin: string | null; note: string | null };

const ALIASES: Record<string, string[]> = {
  code_moteur: ["code moteur", "code", "moteur", "reference", "ref", "type"],
  marque: ["marque", "brand", "constructeur"],
  energie: ["energie", "carburant", "fuel"],
  prix_demande: ["prix demande", "prix", "prix achat", "montant", "tarif", "prix propose"],
  qty: ["qty", "quantite", "qte", "nombre", "nb", "stock"],
  immatriculation: ["immatriculation", "immat", "plaque"],
  vin: ["vin", "numero de chassis", "chassis"],
  note: ["note", "remarque", "observation", "commentaire", "info", "etat"],
};

export default function ImportOffresPage() {
  const [breakers, setBreakers] = useState<Breaker[]>([]);
  const [breakerId, setBreakerId] = useState<string>("");
  const [rows, setRows] = useState<OfferRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapInfo, setMapInfo] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<{ ok: number; ko: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("breakers").select("id, name").order("name");
      setBreakers((data as Breaker[]) || []);
    })();
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null);
    setDone(null);
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    try {
      const raw = await parseXlsxRows(f);
      if (raw.length === 0) {
        setErr("Fichier vide ou illisible.");
        setRows([]);
        return;
      }
      const headers = Object.keys(raw[0] as object);
      const m = mapHeaders(headers, ALIASES);
      setMapInfo(m);
      if (!m.code_moteur) {
        setErr("Impossible de trouver une colonne « code moteur » (ou type/référence). Vérifie les en-têtes.");
        setRows([]);
        return;
      }
      const parsed: OfferRow[] = raw.map((r) => {
        const g = (field: string) => (m[field] ? (r as Record<string, unknown>)[m[field]] : null);
        const code = g("code_moteur");
        return {
          code_moteur: code != null ? String(code).trim() : "",
          marque: g("marque") != null ? String(g("marque")).trim() : null,
          energie: g("energie") != null ? String(g("energie")).trim() : null,
          prix_demande: toNumber(g("prix_demande")),
          qty: toNumber(g("qty")) != null ? Math.round(toNumber(g("qty"))!) : null,
          immatriculation: g("immatriculation") != null ? String(g("immatriculation")).trim() : null,
          vin: g("vin") != null ? String(g("vin")).trim() : null,
          note: g("note") != null ? String(g("note")).trim() : null,
        };
      });
      setRows(parsed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur de lecture du fichier.");
      setRows([]);
    }
  }

  const valides = useMemo(() => (rows || []).filter((r) => r.code_moteur), [rows]);
  const invalides = (rows?.length || 0) - valides.length;

  async function doImport() {
    if (!breakerId) { setErr("Choisis d'abord un centre VHU (fournisseur de l'offre)."); return; }
    if (valides.length === 0) return;
    setImporting(true);
    setErr(null);
    let ok = 0;
    let ko = 0;
    const payload = valides.map((r) => ({
      breaker_id: Number(breakerId),
      code_moteur: r.code_moteur,
      marque: r.marque,
      energie: r.energie,
      prix_demande: r.prix_demande,
      qty: r.qty ?? 1,
      immatriculation: r.immatriculation,
      vin: r.vin,
      note: r.note,
      status: "pending",
    }));
    for (let i = 0; i < payload.length; i += 200) {
      const slice = payload.slice(i, i + 200);
      const { error, data } = await supabase.from("breaker_click_offers").insert(slice).select("id");
      if (error) ko += slice.length;
      else ok += (data as any[])?.length || slice.length;
    }
    setImporting(false);
    setDone({ ok, ko });
    if (ko > 0 && ok === 0) setErr("L'import a échoué (droits d'écriture ?).");
  }

  return (
    <div>
      <Link href="/admin/offres" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground">
        <ArrowLeft size={14} /> Retour aux offres
      </Link>
      <PageHeader title="Importer des offres (Excel)" description="Charge un fichier Excel d'offres moteurs pour un centre VHU ; elles rejoignent la file d'acceptation." />

      <Card className="mb-4">
        <CardContent className="space-y-4 p-5">
          {/* Centre VHU */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-text-dim">Centre VHU (émetteur de l'offre)</label>
            <select value={breakerId} onChange={(e) => setBreakerId(e.target.value)} className="w-full max-w-sm rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground">
              <option value="">— choisir —</option>
              {breakers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {/* Fichier */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-text-dim">Fichier Excel (.xlsx / .csv)</label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-alt px-4 py-2 text-sm text-foreground hover:bg-surface-hover">
              <FileSpreadsheet size={16} /> {fileName || "Choisir un fichier…"}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" />
            </label>
            <p className="mt-2 text-xs text-text-muted">
              Colonnes reconnues (souple, insensible aux accents) : <span className="font-medium">code moteur</span> (obligatoire), marque, énergie, prix, quantité, immatriculation, VIN, note.
            </p>
          </div>

          {Object.keys(mapInfo).length > 0 && (
            <p className="text-xs text-text-dim">
              Colonnes détectées : {Object.entries(mapInfo).map(([f, h]) => `${f} ← « ${h} »`).join(" · ")}
            </p>
          )}

          {err && <p className="rounded-lg bg-[rgba(248,113,113,0.08)] px-3 py-2 text-sm text-red-600">{err}</p>}
        </CardContent>
      </Card>

      {done ? (
        <div className="rounded-[14px] border border-[rgba(52,211,153,0.25)] bg-[rgba(52,211,153,0.06)] p-5 text-sm text-emerald-700">
          <p className="inline-flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> Import terminé</p>
          <p className="mt-1">{done.ok} offre{done.ok > 1 ? "s" : ""} créée{done.ok > 1 ? "s" : ""} (statut « en attente »){done.ko > 0 ? ` · ${done.ko} en échec` : ""}.</p>
          <Link href="/admin/offres" className="mt-2 inline-block font-medium text-brand hover:underline">Voir la file d'acceptation →</Link>
        </div>
      ) : rows && rows.length > 0 ? (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-text-dim">
              {valides.length} offre{valides.length > 1 ? "s" : ""} valide{valides.length > 1 ? "s" : ""}
              {invalides > 0 ? ` · ${invalides} ignorée(s) (code moteur manquant)` : ""}
            </p>
            <Button onClick={doImport} disabled={importing || !breakerId || valides.length === 0} className="bg-brand text-white hover:bg-brand/80">
              <Upload size={14} className="mr-1" /> {importing ? "Import en cours…" : `Importer ${valides.length} offre${valides.length > 1 ? "s" : ""}`}
            </Button>
          </div>
          <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-alt text-xs uppercase text-text-dim">
                  <tr>
                    <th className="px-3 py-2 text-left">Code moteur</th>
                    <th className="px-3 py-2 text-left">Marque</th>
                    <th className="px-3 py-2 text-left">Énergie</th>
                    <th className="px-3 py-2 text-right">Prix</th>
                    <th className="px-3 py-2 text-center">Qté</th>
                    <th className="px-3 py-2 text-left">Immat / VIN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(rows || []).slice(0, 300).map((r, i) => (
                    <tr key={i} className={r.code_moteur ? "" : "opacity-40"}>
                      <td className="px-3 py-1.5 font-medium text-foreground">{r.code_moteur || "— (ignorée)"}</td>
                      <td className="px-3 py-1.5 text-text-dim">{r.marque || "—"}</td>
                      <td className="px-3 py-1.5 text-text-dim">{r.energie || "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-text-dim">{r.prix_demande != null ? `${r.prix_demande} €` : "—"}</td>
                      <td className="px-3 py-1.5 text-center tabular-nums text-text-dim">{r.qty ?? "—"}</td>
                      <td className="px-3 py-1.5 text-xs text-text-muted">{[r.immatriculation, r.vin].filter(Boolean).join(" / ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(rows?.length || 0) > 300 && <p className="px-3 py-2 text-xs text-text-muted">Aperçu limité à 300 lignes ({rows?.length} au total seront importées).</p>}
          </div>
        </>
      ) : null}
    </div>
  );
}
