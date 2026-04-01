"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Reception = {
  n_reception: number;
  date_achat: string | null;
  montant_ht: number | null;
  n_fournisseur: number | null;
  tbl_fournisseurs: { nom_fournisseur: string } | null;
};

type MoteurDetail = {
  n_moteur: number;
  code_moteur: string | null;
  tbl_types_moteurs?: { nom_type_moteur: string } | null;
  num_serie: string | null;
  modele_saisi: string | null;
  prix_achat_moteur: number | null;
  etat_moteur: string | null;
  resa_client_moteur: string | null;
};

type BoiteDetail = {
  n_bv: number;
  ref_bv: string | null;
  achat_bv: number | null;
  observations_bv: string | null;
  resa_client_bv: string | null;
};

export default function ReceptionsPage() {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(100);
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedReception, setSelectedReception] = useState<Reception | null>(null);
  const [detailMoteurs, setDetailMoteurs] = useState<MoteurDetail[]>([]);
  const [detailBoites, setDetailBoites] = useState<BoiteDetail[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Load receptions
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from("tbl_receptions")
          .select("n_reception, date_achat, montant_ht, n_fournisseur, tbl_fournisseurs(nom_fournisseur)")
          .order("n_reception", { ascending: false })
          .limit(limit);

        if (err) throw err;
        if (cancelled) return;
        setReceptions((data || []) as unknown as Reception[]);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Erreur lors du chargement");
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [limit]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return receptions;
    const q = search.toLowerCase();
    return receptions.filter((r) => {
      const nom = (r.tbl_fournisseurs?.nom_fournisseur || "").toLowerCase();
      const num = String(r.n_reception);
      return nom.includes(q) || num.includes(q);
    });
  }, [receptions, search]);

  // KPIs
  const nbReceptions = filtered.length;
  const totalMontantHT = useMemo(
    () => filtered.reduce((s, r) => s + (r.montant_ht || 0), 0),
    [filtered]
  );

  // Load detail when selecting a reception
  async function openDetail(rec: Reception) {
    setSelectedReception(rec);
    setDetailLoading(true);
    setDetailMoteurs([]);
    setDetailBoites([]);

    try {
      const [motRes, boiRes] = await Promise.all([
        supabase
          .from("tbl_moteurs")
          .select("n_moteur, code_moteur, num_serie, modele_saisi, prix_achat_moteur, etat_moteur, resa_client_moteur, tbl_types_moteurs(nom_type_moteur)")
          .eq("num_reception", rec.n_reception),
        supabase
          .from("tbl_boites")
          .select("n_bv, ref_bv, achat_bv, observations_bv, resa_client_bv")
          .eq("n_reception", rec.n_reception),
      ]);

      setDetailMoteurs((motRes.data || []) as unknown as MoteurDetail[]);
      setDetailBoites((boiRes.data || []) as unknown as BoiteDetail[]);
    } catch {
      // silently handle
    }
    setDetailLoading(false);
  }

  const totalMoteurs = detailMoteurs.length;
  const totalBoites = detailBoites.length;

  return (
    <div>
      <PageHeader title="Receptions" icon="PackageOpen" description="Gestion des arrivages fournisseurs" />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Nb receptions</p>
            <p className="text-2xl font-bold text-[#C41E3A]">{nbReceptions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Moteurs (selection)</p>
            <p className="text-2xl font-bold text-gray-700">{selectedReception ? totalMoteurs : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Boites (selection)</p>
            <p className="text-2xl font-bold text-gray-700">{selectedReception ? totalBoites : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Montant HT total</p>
            <p className="text-2xl font-bold text-gray-700">{Math.round(totalMontantHT).toLocaleString("fr-FR")} EUR</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Input
          placeholder="Rechercher par N reception ou fournisseur..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Limite :</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className={`grid gap-6 ${selectedReception ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
        {/* Receptions table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <p className="text-center py-10 text-gray-400">Chargement...</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">N reception</th>
                    <th className="px-4 py-3 text-left">Date achat</th>
                    <th className="px-4 py-3 text-left">Fournisseur</th>
                    <th className="px-4 py-3 text-right">Montant HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((r) => (
                    <tr
                      key={r.n_reception}
                      onClick={() => openDetail(r)}
                      className={`hover:bg-gray-50 cursor-pointer ${selectedReception?.n_reception === r.n_reception ? "bg-red-50" : ""}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{r.n_reception}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {r.date_achat ? new Date(r.date_achat).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td className="px-4 py-3 font-medium">{r.tbl_fournisseurs?.nom_fournisseur || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {r.montant_ht ? `${Math.round(r.montant_ht).toLocaleString("fr-FR")} EUR` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {!loading && filtered.length === 0 && (
            <p className="text-center py-10 text-gray-400">Aucune reception trouvee</p>
          )}
        </div>

        {/* Detail panel */}
        {selectedReception && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {/* Header card */}
            <div className="bg-gradient-to-r from-[#C41E3A] to-[#8B1A2B] text-white p-5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">Reception N {selectedReception.n_reception}</h3>
                  <p className="text-white/80 text-sm mt-1">
                    {selectedReception.tbl_fournisseurs?.nom_fournisseur || "Fournisseur inconnu"}
                  </p>
                  <p className="text-white/80 text-sm">
                    Date : {selectedReception.date_achat ? new Date(selectedReception.date_achat).toLocaleDateString("fr-FR") : "—"}
                    {" — "}
                    Montant HT : {selectedReception.montant_ht ? `${Math.round(selectedReception.montant_ht).toLocaleString("fr-FR")} EUR` : "—"}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedReception(null)}
                  className="text-white/70 hover:text-white text-lg"
                >
                  X
                </button>
              </div>
            </div>

            <div className="p-5">
              {detailLoading ? (
                <p className="text-gray-400 text-sm py-4 text-center">Chargement des details...</p>
              ) : (
                <>
                  {/* Moteurs */}
                  <h4 className="font-semibold text-gray-700 mb-3">Moteurs ({detailMoteurs.length})</h4>
                  {detailMoteurs.length > 0 ? (
                    <div className="overflow-x-auto mb-6">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-gray-500 uppercase">
                          <tr>
                            <th className="px-3 py-2 text-left">N</th>
                            <th className="px-3 py-2 text-left">Code</th>
                            <th className="px-3 py-2 text-left">Num serie</th>
                            <th className="px-3 py-2 text-left">Modele</th>
                            <th className="px-3 py-2 text-right">Prix achat</th>
                            <th className="px-3 py-2 text-center">Etat</th>
                            <th className="px-3 py-2 text-left">Resa client</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {detailMoteurs.map((m) => (
                            <tr key={m.n_moteur} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-mono">{m.n_moteur}</td>
                              <td className="px-3 py-2 font-semibold">{m.tbl_types_moteurs?.nom_type_moteur || m.code_moteur || "—"}</td>
                              <td className="px-3 py-2 text-gray-500">{m.num_serie || "—"}</td>
                              <td className="px-3 py-2">{m.modele_saisi || "—"}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {m.prix_achat_moteur ? `${Math.round(m.prix_achat_moteur).toLocaleString("fr-FR")} EUR` : "—"}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <Badge className={
                                  m.etat_moteur === "Disponible"
                                    ? "bg-green-100 text-green-700 hover:bg-green-100"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-100"
                                }>
                                  {m.etat_moteur || "—"}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-gray-600">{m.resa_client_moteur || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm mb-6">Aucun moteur dans cette reception</p>
                  )}

                  {/* Boites */}
                  <h4 className="font-semibold text-gray-700 mb-3">Boites de vitesses ({detailBoites.length})</h4>
                  {detailBoites.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-gray-500 uppercase">
                          <tr>
                            <th className="px-3 py-2 text-left">N BV</th>
                            <th className="px-3 py-2 text-left">Ref BV</th>
                            <th className="px-3 py-2 text-right">Prix achat</th>
                            <th className="px-3 py-2 text-left">Observations</th>
                            <th className="px-3 py-2 text-left">Resa client</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {detailBoites.map((b) => (
                            <tr key={b.n_bv} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-mono">{b.n_bv}</td>
                              <td className="px-3 py-2 font-semibold">{b.ref_bv || "—"}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {b.achat_bv ? `${Math.round(b.achat_bv).toLocaleString("fr-FR")} EUR` : "—"}
                              </td>
                              <td className="px-3 py-2 text-gray-600">{b.observations_bv || "—"}</td>
                              <td className="px-3 py-2 text-gray-600">{b.resa_client_bv || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">Aucune boite dans cette reception</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
