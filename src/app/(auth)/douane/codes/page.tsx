"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

type TypeRow = { n_type_moteur: number; nom: string; energie: string | null; hs_code: string | null };

export default function CodesDouanePage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<TypeRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  async function run(term: string) {
    const t = term.trim();
    setLoading(true);
    let query = supabase
      .from("tbl_types_moteurs")
      .select("n_type_moteur, nom_type_moteur, obs_energie, hs_code")
      .order("nom_type_moteur", { ascending: true })
      .limit(200);
    if (t) query = query.ilike("nom_type_moteur", `%${t}%`);
    else query = query.not("hs_code", "is", null); // sans recherche : montre ceux déjà renseignés
    const { data } = await query;
    setRows(((data as any[]) || []).map((r) => ({ n_type_moteur: r.n_type_moteur, nom: r.nom_type_moteur || `Type ${r.n_type_moteur}`, energie: r.obs_energie, hs_code: r.hs_code })));
    setLoading(false);
  }
  useEffect(() => { run(""); }, []);

  async function saveHs(row: TypeRow, value: string) {
    const v = value.trim() || null;
    if (v === (row.hs_code || null)) return;
    const { error } = await supabase.from("tbl_types_moteurs").update({ hs_code: v }).eq("n_type_moteur", row.n_type_moteur);
    if (error) { setFlash(`Enregistrement KO : ${error.message}`); return; }
    setRows((prev) => (prev || []).map((r) => (r.n_type_moteur === row.n_type_moteur ? { ...r, hs_code: v } : r)));
    setFlash(`Code SH du type « ${row.nom} » → ${v || "—"}`);
    setTimeout(() => setFlash(null), 2500);
  }

  return (
    <div>
      <Link href="/douane" className="mb-4 inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground">
        <ArrowLeft size={14} /> Retour à la déclaration douane
      </Link>
      <PageHeader title="Codes douane (nomenclature SH) par type" description="Renseigne le code SH de chaque type de moteur ; il est repris automatiquement dans les déclarations douanières." />

      <Card className="my-4">
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run(q)}
              placeholder="Rechercher un type de moteur…"
              className="w-full rounded-lg border border-border bg-surface-alt py-2 pl-9 pr-3 text-sm text-foreground"
            />
          </div>
          <p className="mt-2 text-xs text-text-muted">Sans recherche : liste des types déjà renseignés. Saisis un code SH (ex. 8408.90) puis quitte le champ pour enregistrer.</p>
        </CardContent>
      </Card>

      {flash && <div className="mb-4 rounded-lg bg-[rgba(52,211,153,0.10)] px-3 py-2 text-sm text-emerald-700">{flash}</div>}

      {loading ? (
        <div className="py-12 text-center text-text-muted">Chargement…</div>
      ) : rows && rows.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-surface py-10 text-center italic text-text-muted">{q.trim() ? "Aucun type trouvé." : "Aucun code SH renseigné pour l'instant — recherche un type pour commencer."}</div>
      ) : rows ? (
        <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-alt text-xs uppercase text-text-dim">
                <tr>
                  <th className="px-4 py-3 text-left">Type de moteur</th>
                  <th className="px-4 py-3 text-left">Énergie</th>
                  <th className="px-4 py-3 text-left">Code SH</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.n_type_moteur} className="transition-colors hover:bg-surface-hover">
                    <td className="px-4 py-2.5 font-medium text-foreground">{r.nom}</td>
                    <td className="px-4 py-2.5 text-text-dim">{r.energie || "—"}</td>
                    <td className="px-4 py-2.5">
                      <input
                        defaultValue={r.hs_code || ""}
                        placeholder="ex. 8408.90"
                        onBlur={(e) => saveHs(r, e.target.value)}
                        className="w-32 rounded border border-border bg-surface-alt px-2 py-1 text-sm tabular-nums text-foreground"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length >= 200 && <p className="px-4 py-2 text-xs text-text-muted">200 premiers types — affine la recherche.</p>}
        </div>
      ) : null}
    </div>
  );
}
