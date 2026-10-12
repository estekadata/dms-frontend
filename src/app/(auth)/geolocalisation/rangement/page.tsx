"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Printer, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { exportXlsx } from "@/lib/export";

type Row = { id: number; nom: string; moteurs: number; boites: number };

function empIdFromGeloc(g: string | null): number | null {
  if (!g) return null;
  const n = parseFloat(String(g));
  return Number.isFinite(n) ? Math.round(n) : null;
}

async function pageAll(table: string, cols: string, apply: (q: any) => any): Promise<any[]> {
  const all: any[] = [];
  const PAGE = 5000;
  let from = 0;
  while (from < 200000) {
    const { data, error } = await apply(supabase.from(table).select(cols)).range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export default function RangementPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [onlyFree, setOnlyFree] = useState(false);
  const [sortKey, setSortKey] = useState<"nom" | "total">("total");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [emps, mots, bvs] = await Promise.all([
        supabase.from("tbl_emplacements").select("id_emplacement, nom_emplacement").limit(5000),
        pageAll("tbl_moteurs", "geloc_mot", (q) => q.is("n_expedition", null).not("geloc_mot", "is", null)),
        pageAll("v_boites_dispo", "id_emplacement", (q) => q.eq("est_disponible", 1).not("id_emplacement", "is", null)),
      ]);
      if (cancelled) return;
      const motCount = new Map<number, number>();
      mots.forEach((m: any) => {
        const id = empIdFromGeloc(m.geloc_mot);
        if (id != null) motCount.set(id, (motCount.get(id) || 0) + 1);
      });
      const bvCount = new Map<number, number>();
      bvs.forEach((b: any) => {
        const id = b.id_emplacement;
        if (id != null) bvCount.set(id, (bvCount.get(id) || 0) + 1);
      });
      const out: Row[] = ((emps.data as any[]) || []).map((e) => ({
        id: e.id_emplacement,
        nom: e.nom_emplacement || `#${e.id_emplacement}`,
        moteurs: motCount.get(e.id_emplacement) || 0,
        boites: bvCount.get(e.id_emplacement) || 0,
      }));
      setRows(out);
    })();
    return () => { cancelled = true; };
  }, []);

  const view = useMemo(() => {
    if (!rows) return [];
    let v = rows;
    const t = q.trim().toUpperCase();
    if (t) v = v.filter((r) => r.nom.toUpperCase().includes(t));
    if (onlyFree) v = v.filter((r) => r.moteurs + r.boites === 0);
    return [...v].sort((a, b) =>
      sortKey === "nom" ? a.nom.localeCompare(b.nom, "fr", { numeric: true }) : b.moteurs + b.boites - (a.moteurs + a.boites)
    );
  }, [rows, q, onlyFree, sortKey]);

  const stats = useMemo(() => {
    if (!rows) return { total: 0, used: 0, free: 0, placed: 0 };
    const used = rows.filter((r) => r.moteurs + r.boites > 0).length;
    const placed = rows.reduce((a, r) => a + r.moteurs + r.boites, 0);
    return { total: rows.length, used, free: rows.length - used, placed };
  }, [rows]);

  function exportExcel() {
    if (!rows) return;
    const aoa: (string | number)[][] = [["Emplacement", "Moteurs", "Boîtes", "Total"]];
    [...rows].sort((a, b) => a.nom.localeCompare(b.nom, "fr", { numeric: true })).forEach((r) => aoa.push([r.nom, r.moteurs, r.boites, r.moteurs + r.boites]));
    exportXlsx(`rangement-emplacements-${new Date().toISOString().slice(0, 10)}`, [{ name: "Rangement", aoa }]);
  }

  return (
    <div>
      <Link href="/geolocalisation" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground print:hidden">
        <ArrowLeft size={14} /> Retour à la géolocalisation
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Rangement — occupation des emplacements" description="Ce qui est stocké à chaque emplacement, et les cases libres, pour guider le rangement." />
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={exportExcel} disabled={!rows}>
            <FileSpreadsheet size={14} className="mr-1" /> Export Excel
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!rows}>
            <Printer size={14} className="mr-1" /> Imprimer
          </Button>
        </div>
      </div>

      {rows === null ? (
        <div className="py-16 text-center text-text-muted">Calcul de l&apos;occupation…</div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4 print:hidden">
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Emplacements</p><p className="text-2xl font-bold text-foreground">{stats.total}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Occupés</p><p className="text-2xl font-bold text-brand">{stats.used}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Libres</p><p className="text-2xl font-bold text-emerald-600">{stats.free}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-text-dim">Articles placés</p><p className="text-2xl font-bold text-foreground">{stats.placed.toLocaleString("fr-FR")}</p></CardContent></Card>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer un emplacement…" className="rounded-lg border border-border bg-surface-alt py-2 pl-9 pr-3 text-sm text-foreground" />
            </div>
            <label className="flex items-center gap-2 text-sm text-text-dim">
              <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> Cases libres seulement
            </label>
            <span className="ml-2 text-xs text-text-muted">Trier :</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as "nom" | "total")} className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-foreground">
              <option value="total">Les plus remplis</option>
              <option value="nom">Par nom</option>
            </select>
          </div>

          <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
            <div className="max-h-[70vh] overflow-y-auto print:max-h-none print:overflow-visible">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-alt text-xs uppercase text-text-dim">
                  <tr>
                    <th className="px-4 py-3 text-left">Emplacement</th>
                    <th className="px-4 py-3 text-center">Moteurs</th>
                    <th className="px-4 py-3 text-center">Boîtes</th>
                    <th className="px-4 py-3 text-center">Total</th>
                    <th className="px-4 py-3 text-left">État</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {view.map((r) => {
                    const total = r.moteurs + r.boites;
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-surface-hover">
                        <td className="px-4 py-2.5 font-medium text-foreground">
                          <Link href={`/geolocalisation?emp=${encodeURIComponent(r.nom)}`} className="hover:text-brand hover:underline">{r.nom}</Link>
                        </td>
                        <td className="px-4 py-2.5 text-center tabular-nums text-text-dim">{r.moteurs || "—"}</td>
                        <td className="px-4 py-2.5 text-center tabular-nums text-text-dim">{r.boites || "—"}</td>
                        <td className="px-4 py-2.5 text-center font-semibold tabular-nums text-foreground">{total || "—"}</td>
                        <td className="px-4 py-2.5">
                          {total === 0 ? <span className="text-emerald-600">Libre</span> : <span className="text-text-muted">Occupé</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {view.length === 0 && <p className="py-8 text-center italic text-text-muted">Aucun emplacement.</p>}
          </div>
        </>
      )}
    </div>
  );
}
