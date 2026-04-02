"use client";
import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import * as XLSX from "xlsx";

type CatalogRow = {
  code_moteur: string;
  prix_catalogue: number;
  marque?: string;
};

type MoteurMapping = {
  code_moteur: string;
  prix_achat_moteur?: number;
  prix_vente_moteur?: number;
  nb_en_stock?: number;
  nb_vendus?: number;
  jours_stock_moyen?: number;
  urgence?: number;
};

type PricingResult = {
  code_moteur: string;
  marque?: string;
  prix_catalogue: number;
  prix_achat_actuel: number;
  prix_vente_actuel: number;
  nb_en_stock: number;
  nb_vendus: number;
  urgence: number;
  score: number;
  prix_achat_propose: number;
  prix_vente_propose: number;
  marge_pct: number;
  delta_achat_pct: number;
  delta_vente_pct: number;
};

export default function PrixPage() {
  // File uploads
  const [catalogFile, setCatalogFile] = useState<File | null>(null);
  const [moteursFile, setMoteursFile] = useState<File | null>(null);
  const [catalogData, setCatalogData] = useState<CatalogRow[]>([]);
  const [moteursData, setMoteursData] = useState<MoteurMapping[]>([]);

  // Sliders
  const [margeCible, setMargeCible] = useState(35);
  const [bonusUrgence, setBonusUrgence] = useState(8);
  const [malusSurstock, setMalusSurstock] = useState(5);

  // Results
  const [results, setResults] = useState<PricingResult[]>([]);
  const [status, setStatus] = useState<"idle" | "parsing" | "computing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [filterMarque, setFilterMarque] = useState("");
  const [filterCode, setFilterCode] = useState("");
  const [editingCell, setEditingCell] = useState<{ code: string; field: "prix_achat_propose" | "prix_vente_propose" } | null>(null);
  const [editValue, setEditValue] = useState("");

  // Parse Excel file
  function parseExcel(file: File, onParsed: (rows: any[]) => void) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);
        onParsed(json);
      } catch (err: any) {
        setErrorMsg("Erreur de lecture du fichier Excel: " + err.message);
        setStatus("error");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleCatalogFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCatalogFile(f);
    setStatus("parsing");
    parseExcel(f, (rows) => {
      const parsed: CatalogRow[] = rows
        .filter((r: any) => r.code_moteur && r.prix_catalogue != null)
        .map((r: any) => ({
          code_moteur: String(r.code_moteur).toUpperCase().trim(),
          prix_catalogue: parseFloat(r.prix_catalogue) || 0,
          marque: r.marque || undefined,
        }));
      setCatalogData(parsed);
      setStatus("idle");
    });
  }

  function handleMoteursFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setMoteursFile(f);
    setStatus("parsing");
    parseExcel(f, (rows) => {
      const parsed: MoteurMapping[] = rows
        .filter((r: any) => r.code_moteur)
        .map((r: any) => ({
          code_moteur: String(r.code_moteur).toUpperCase().trim(),
          prix_achat_moteur: parseFloat(r.prix_achat_moteur) || 0,
          prix_vente_moteur: parseFloat(r.prix_vente_moteur) || 0,
          nb_en_stock: parseInt(r.nb_en_stock) || 0,
          nb_vendus: parseInt(r.nb_vendus) || 0,
          jours_stock_moyen: parseInt(r.jours_stock_moyen) || 0,
          urgence: parseInt(r.urgence) || 0,
        }));
      setMoteursData(parsed);
      setStatus("idle");
    });
  }

  // Load moteurs data from Supabase if no file
  async function loadMoteursFromDB() {
    setStatus("parsing");
    const { data } = await supabase
      .from("v_moteurs_dispo")
      .select("code_moteur, prix_achat_moteur, est_disponible, marque")
      .limit(5000);

    // Aggregate by code_moteur
    const codeMap: Record<string, { achats: number[]; stock: number; vendus: number }> = {};
    (data || []).forEach((d: any) => {
      const code = (d.code_moteur || "").toUpperCase().trim();
      if (!code) return;
      if (!codeMap[code]) codeMap[code] = { achats: [], stock: 0, vendus: 0 };
      if (d.prix_achat_moteur) codeMap[code].achats.push(d.prix_achat_moteur);
      if (d.est_disponible === 1) codeMap[code].stock++;
    });

    // Get sales
    const { data: sales } = await supabase
      .from("tbl_expeditions_moteurs")
      .select("code_moteur, prix_vente_moteur")
      .not("code_moteur", "is", null)
      .limit(5000);

    const salesMap: Record<string, number[]> = {};
    (sales || []).forEach((s: any) => {
      const code = (s.code_moteur || "").toUpperCase().trim();
      if (!code) return;
      if (!salesMap[code]) salesMap[code] = [];
      if (s.prix_vente_moteur) salesMap[code].push(s.prix_vente_moteur);
    });

    const parsed: MoteurMapping[] = Object.entries(codeMap).map(([code, v]) => {
      const avgAchat = v.achats.length ? v.achats.reduce((a, b) => a + b, 0) / v.achats.length : 0;
      const salesPrices = salesMap[code] || [];
      const avgVente = salesPrices.length ? salesPrices.reduce((a, b) => a + b, 0) / salesPrices.length : 0;
      return {
        code_moteur: code,
        prix_achat_moteur: Math.round(avgAchat),
        prix_vente_moteur: Math.round(avgVente),
        nb_en_stock: v.stock,
        nb_vendus: salesPrices.length,
        urgence: 0,
      };
    });

    setMoteursData(parsed);
    setStatus("idle");
  }

  // Compute pricing recommendations
  function computePricing() {
    if (catalogData.length === 0 && moteursData.length === 0) {
      setErrorMsg("Chargez le catalogue ou les donnees moteurs depuis la BDD");
      setStatus("error");
      return;
    }

    setStatus("computing");
    setErrorMsg("");

    const catalogIndex: Record<string, CatalogRow> = {};
    catalogData.forEach((c) => { catalogIndex[c.code_moteur] = c; });

    const moteurIndex: Record<string, MoteurMapping> = {};
    moteursData.forEach((m) => { moteurIndex[m.code_moteur] = m; });

    const allCodes = new Set([...catalogData.map(c => c.code_moteur), ...moteursData.map(m => m.code_moteur)]);
    const output: PricingResult[] = [];

    for (const code of allCodes) {
      const cat = catalogIndex[code];
      const moteur = moteurIndex[code];

      const prixCatalogue = cat?.prix_catalogue || 0;
      const prixAchatActuel = moteur?.prix_achat_moteur || 0;
      const prixVenteActuel = moteur?.prix_vente_moteur || 0;
      const nbStock = moteur?.nb_en_stock || 0;
      const nbVendus = moteur?.nb_vendus || 0;
      const urgence = moteur?.urgence || 0;

      let score = 50;
      score += urgence * (bonusUrgence / 10);
      if (nbStock > 3) score -= (nbStock - 3) * (malusSurstock / 10);
      if (nbVendus > 5) score += Math.min(nbVendus - 5, 20);
      score = Math.max(10, Math.min(100, score));

      const scoreRatio = score / 100;
      let prixAchatPropose: number;
      let prixVentePropose: number;

      if (prixCatalogue > 0) {
        const maxAchat = prixCatalogue * (1 - margeCible / 100);
        prixAchatPropose = Math.round(maxAchat * (0.7 + 0.3 * scoreRatio));
        prixVentePropose = Math.round(prixAchatPropose * (1 + margeCible / 100) * (1 + scoreRatio * 0.1));
      } else {
        const base = prixAchatActuel || 0;
        prixAchatPropose = Math.round(base * (0.85 + 0.3 * scoreRatio));
        prixVentePropose = Math.round(prixAchatPropose * (1 + margeCible / 100));
      }

      const margePct = prixAchatPropose > 0
        ? Math.round(((prixVentePropose - prixAchatPropose) / prixAchatPropose) * 100)
        : 0;
      const deltaAchatPct = prixAchatActuel > 0
        ? Math.round(((prixAchatPropose - prixAchatActuel) / prixAchatActuel) * 100)
        : 0;
      const deltaVentePct = prixVenteActuel > 0
        ? Math.round(((prixVentePropose - prixVenteActuel) / prixVenteActuel) * 100)
        : 0;

      if (prixAchatPropose === 0 && prixVentePropose === 0) continue;

      output.push({
        code_moteur: code,
        marque: cat?.marque,
        prix_catalogue: prixCatalogue,
        prix_achat_actuel: prixAchatActuel,
        prix_vente_actuel: prixVenteActuel,
        nb_en_stock: nbStock,
        nb_vendus: nbVendus,
        urgence,
        score: Math.round(score),
        prix_achat_propose: prixAchatPropose,
        prix_vente_propose: prixVentePropose,
        marge_pct: margePct,
        delta_achat_pct: deltaAchatPct,
        delta_vente_pct: deltaVentePct,
      });
    }

    output.sort((a, b) => b.score - a.score);
    setResults(output);
    setStatus("done");

    // Save to besoins_overrides so VHU sees updated prices
    saveOverrides(output);
  }

  async function saveOverrides(data: PricingResult[]) {
    for (const r of data) {
      if (r.prix_achat_propose <= 0) continue;
      await supabase.from("besoins_overrides").upsert({
        code_moteur: r.code_moteur,
        prix_override: r.prix_achat_propose,
        urgence_override: r.urgence > 0 ? r.urgence : null,
        statut: "actif",
        modifie_par: "prix_page",
        updated_at: new Date().toISOString(),
      }, { onConflict: "code_moteur" });
    }
  }

  // Edit a single price
  async function handlePriceEdit(code: string, field: "prix_achat_propose" | "prix_vente_propose", newVal: number) {
    setResults((prev) =>
      prev.map((r) => {
        if (r.code_moteur !== code) return r;
        const updated = { ...r, [field]: newVal };
        if (field === "prix_achat_propose" && updated.prix_achat_propose > 0) {
          updated.marge_pct = Math.round(((updated.prix_vente_propose - updated.prix_achat_propose) / updated.prix_achat_propose) * 100);
        }
        return updated;
      })
    );
    // Save override
    const row = results.find((r) => r.code_moteur === code);
    if (row) {
      const prix = field === "prix_achat_propose" ? newVal : row.prix_achat_propose;
      await supabase.from("besoins_overrides").upsert({
        code_moteur: code,
        prix_override: prix,
        statut: "actif",
        modifie_par: "prix_page_manual",
        updated_at: new Date().toISOString(),
      }, { onConflict: "code_moteur" });
    }
    setEditingCell(null);
  }

  // Get unique marques for filter
  const marques = [...new Set(results.map((r) => r.marque).filter(Boolean))].sort();
  const filteredResults = results.filter((r) => {
    if (filterMarque && r.marque !== filterMarque) return false;
    if (filterCode && !r.code_moteur.toLowerCase().includes(filterCode.toLowerCase())) return false;
    return true;
  });

  // CSV download
  function downloadCSV() {
    if (results.length === 0) return;
    const headers = [
      "code_moteur", "marque", "prix_catalogue", "prix_achat_actuel", "prix_vente_actuel",
      "nb_en_stock", "nb_vendus", "urgence", "score",
      "prix_achat_propose", "prix_vente_propose", "marge_pct", "delta_achat_pct", "delta_vente_pct",
    ];
    const rows = results.map((r) => headers.map((h) => (r as any)[h] ?? "").join(";"));
    const csv = [headers.join(";"), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prix_recommandes_${new Date().toISOString().substring(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader title="Mise a jour des prix" icon="💶" description="Import catalogue, calcul des recommandations de prix" />

      {/* File uploads */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold text-gray-800 mb-3">1. Catalogue fournisseur (Excel)</h3>
            <p className="text-sm text-gray-500 mb-3">
              Colonnes requises : <code className="bg-gray-100 px-1 rounded">code_moteur</code>, <code className="bg-gray-100 px-1 rounded">prix_catalogue</code>, <code className="bg-gray-100 px-1 rounded">marque</code> (opt.)
            </p>
            <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleCatalogFile} />
            {catalogData.length > 0 && (
              <p className="text-sm text-emerald-600 mt-2">{catalogData.length} references chargees</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold text-gray-800 mb-3">2. Donnees moteurs (Excel ou BDD)</h3>
            <p className="text-sm text-gray-500 mb-3">
              Colonnes : <code className="bg-gray-100 px-1 rounded">code_moteur</code>, <code className="bg-gray-100 px-1 rounded">prix_achat_moteur</code>, <code className="bg-gray-100 px-1 rounded">nb_en_stock</code>, <code className="bg-gray-100 px-1 rounded">nb_vendus</code>, <code className="bg-gray-100 px-1 rounded">urgence</code>
            </p>
            <div className="flex gap-2">
              <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleMoteursFile} className="flex-1" />
              <Button variant="outline" onClick={loadMoteursFromDB} className="whitespace-nowrap">
                Charger depuis BDD
              </Button>
            </div>
            {moteursData.length > 0 && (
              <p className="text-sm text-emerald-600 mt-2">{moteursData.length} codes moteur charges</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sliders */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <h3 className="font-semibold text-gray-800 mb-4">3. Parametres de calcul</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <Label>Marge cible : {margeCible}%</Label>
              <input
                type="range"
                min={5}
                max={60}
                value={margeCible}
                onChange={(e) => setMargeCible(+e.target.value)}
                className="w-full mt-2 accent-[#C41E3A]"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>5%</span><span>60%</span>
              </div>
            </div>
            <div>
              <Label>Bonus urgence : {bonusUrgence}</Label>
              <input
                type="range"
                min={0}
                max={20}
                value={bonusUrgence}
                onChange={(e) => setBonusUrgence(+e.target.value)}
                className="w-full mt-2 accent-[#C41E3A]"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>0</span><span>20</span>
              </div>
            </div>
            <div>
              <Label>Malus surstock : {malusSurstock}</Label>
              <input
                type="range"
                min={0}
                max={20}
                value={malusSurstock}
                onChange={(e) => setMalusSurstock(+e.target.value)}
                className="w-full mt-2 accent-[#C41E3A]"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>0</span><span>20</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button
              onClick={computePricing}
              disabled={status === "computing" || (catalogData.length === 0 && moteursData.length === 0)}
              className="bg-[#C41E3A] hover:bg-[#8B1A2B] text-white"
            >
              {status === "computing" ? "Calcul en cours..." : "Calculer les recommandations"}
            </Button>
            {results.length > 0 && (
              <Button variant="outline" onClick={downloadCSV}>
                Telecharger CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status */}
      {status === "error" && errorMsg && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 rounded-lg text-sm">{errorMsg}</div>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">{filteredResults.length} / {results.length} recommandations</h3>
              <div className="flex gap-4 text-sm text-gray-500">
                <span>Marge: {margeCible}%</span>
                <span>Urgence: {bonusUrgence}</span>
                <span>Surstock: {malusSurstock}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Input
                placeholder="Filtrer par code moteur..."
                value={filterCode}
                onChange={(e) => setFilterCode(e.target.value)}
                className="max-w-xs"
              />
              <select
                value={filterMarque}
                onChange={(e) => setFilterMarque(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">Toutes les marques</option>
                {marques.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {(filterCode || filterMarque) && (
                <button onClick={() => { setFilterCode(""); setFilterMarque(""); }} className="text-xs text-gray-400 hover:text-gray-600">
                  Effacer filtres
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-3 py-3 text-left">Code</th>
                  <th className="px-3 py-3 text-left">Marque</th>
                  <th className="px-3 py-3 text-right">Catalogue</th>
                  <th className="px-3 py-3 text-right">Achat actuel</th>
                  <th className="px-3 py-3 text-center">Stock</th>
                  <th className="px-3 py-3 text-center">Vendus</th>
                  <th className="px-3 py-3 text-center">Score</th>
                  <th className="px-3 py-3 text-right font-bold">Achat propose</th>
                  <th className="px-3 py-3 text-right font-bold">Vente propose</th>
                  <th className="px-3 py-3 text-right">Marge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredResults.map((r) => (
                  <tr key={r.code_moteur} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono font-semibold text-xs">{r.code_moteur}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{r.marque || "\u2014"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.prix_catalogue ? `${r.prix_catalogue} EUR` : "\u2014"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{r.prix_achat_actuel ? `${r.prix_achat_actuel} EUR` : "\u2014"}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.nb_en_stock}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.nb_vendus}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                        r.score >= 70 ? "bg-emerald-100 text-emerald-700"
                        : r.score >= 40 ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                      }`}>
                        {r.score}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {editingCell?.code === r.code_moteur && editingCell?.field === "prix_achat_propose" ? (
                        <input
                          type="number"
                          autoFocus
                          className="w-20 border rounded px-1 py-0.5 text-right text-sm"
                          defaultValue={r.prix_achat_propose}
                          onBlur={(e) => handlePriceEdit(r.code_moteur, "prix_achat_propose", parseInt(e.target.value) || 0)}
                          onKeyDown={(e) => { if (e.key === "Enter") handlePriceEdit(r.code_moteur, "prix_achat_propose", parseInt((e.target as HTMLInputElement).value) || 0); if (e.key === "Escape") setEditingCell(null); }}
                        />
                      ) : (
                        <span
                          className="font-bold text-[#C41E3A] cursor-pointer hover:underline"
                          onClick={() => { setEditingCell({ code: r.code_moteur, field: "prix_achat_propose" }); setEditValue(String(r.prix_achat_propose)); }}
                        >
                          {r.prix_achat_propose} EUR
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {editingCell?.code === r.code_moteur && editingCell?.field === "prix_vente_propose" ? (
                        <input
                          type="number"
                          autoFocus
                          className="w-20 border rounded px-1 py-0.5 text-right text-sm"
                          defaultValue={r.prix_vente_propose}
                          onBlur={(e) => handlePriceEdit(r.code_moteur, "prix_vente_propose", parseInt(e.target.value) || 0)}
                          onKeyDown={(e) => { if (e.key === "Enter") handlePriceEdit(r.code_moteur, "prix_vente_propose", parseInt((e.target as HTMLInputElement).value) || 0); if (e.key === "Escape") setEditingCell(null); }}
                        />
                      ) : (
                        <span
                          className="font-bold text-blue-700 cursor-pointer hover:underline"
                          onClick={() => { setEditingCell({ code: r.code_moteur, field: "prix_vente_propose" }); setEditValue(String(r.prix_vente_propose)); }}
                        >
                          {r.prix_vente_propose} EUR
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-600">{r.marge_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
