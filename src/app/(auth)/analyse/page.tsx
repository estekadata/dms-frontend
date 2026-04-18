"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

type Tab = "Stock" | "Prix" | "Tendances" | "Offres";

const COLORS = ["#C41E3A", "#F87171", "#FBBF24", "#34D399", "#60A5FA", "#A78BFA", "#FB923C", "#F472B6"];

const tooltipStyle = { background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 10, color: "#111827", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" };

function ChartHeader({ title, total, unit }: { title: string; total: number; unit: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-semibold text-foreground">{title}</h3>
      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-brand-soft text-brand tabular-nums">
        {total.toLocaleString("fr-FR")} {unit}
      </span>
    </div>
  );
}

export default function AnalysePage() {
  const [tab, setTab] = useState<Tab>("Stock");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setData(null); // Reset pour éviter de réutiliser les données du tab précédent
      if (tab === "Stock") {
        // Filtrer directement côté DB pour ne récupérer que les dispos
        const { data: moteurs } = await supabase
          .from("v_moteurs_dispo")
          .select("marque, energie")
          .eq("est_disponible", 1)
          .limit(10000);

        const byMarque: Record<string, number> = {};
        const byEnergie: Record<string, number> = {};
        (moteurs || []).forEach((m: any) => {
          const marque = m.marque || "Inconnu";
          const energie = m.energie || "Inconnu";
          byMarque[marque] = (byMarque[marque] || 0) + 1;
          byEnergie[energie] = (byEnergie[energie] || 0) + 1;
        });
        setData({
          totalStock: (moteurs || []).length,
          topMarques: Object.entries(byMarque).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value })),
          byEnergie: Object.entries(byEnergie).map(([name, value]) => ({ name, value })),
        });
      } else if (tab === "Prix") {
        const { data: moteurs } = await supabase
          .from("v_moteurs_dispo")
          .select("code_moteur, prix_achat_moteur")
          .eq("est_disponible", 1)
          .gt("prix_achat_moteur", 0) // exclure les 0 qui faussent la distribution
          .limit(10000);

        const ranges = [
          { label: "0–100€", min: 0, max: 100, count: 0 },
          { label: "100–200€", min: 100, max: 200, count: 0 },
          { label: "200–400€", min: 200, max: 400, count: 0 },
          { label: "400–600€", min: 400, max: 600, count: 0 },
          { label: "600–1000€", min: 600, max: 1000, count: 0 },
          { label: "1000€+", min: 1000, max: Infinity, count: 0 },
        ];
        (moteurs || []).forEach((m: any) => {
          const p = m.prix_achat_moteur || 0;
          const range = ranges.find((r) => p >= r.min && p < r.max);
          if (range) range.count++;
        });
        const avg = (moteurs || []).reduce((s: number, m: any) => s + (m.prix_achat_moteur || 0), 0) / ((moteurs || []).length || 1);
        setData({ ranges, avg: Math.round(avg), totalPrix: (moteurs || []).length });
      } else if (tab === "Tendances") {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - 12);
        const [{ data: recData }, { data: expData }] = await Promise.all([
          supabase.from("v_receptions").select("date_reception, nb_moteurs").gte("date_reception", cutoff.toISOString()),
          supabase.from("tbl_expeditions_moteurs").select("date_validation, prix_vente_moteur").gte("date_validation", cutoff.toISOString()),
        ]);
        const byMonth: Record<string, { mois: string; recus: number; vendus: number; ca: number }> = {};
        (recData || []).forEach((r: any) => {
          const k = r.date_reception?.substring(0, 7) || "";
          if (!byMonth[k]) byMonth[k] = { mois: k, recus: 0, vendus: 0, ca: 0 };
          byMonth[k].recus += r.nb_moteurs || 0;
        });
        (expData || []).forEach((e: any) => {
          const k = e.date_validation?.substring(0, 7) || "";
          if (!byMonth[k]) byMonth[k] = { mois: k, recus: 0, vendus: 0, ca: 0 };
          byMonth[k].vendus++;
          byMonth[k].ca += e.prix_vente_moteur || 0;
        });
        const monthsArr = Object.values(byMonth).sort((a, b) => a.mois.localeCompare(b.mois));
        const totalRecus = monthsArr.reduce((s, m) => s + m.recus, 0);
        const totalVendus = monthsArr.reduce((s, m) => s + m.vendus, 0);
        setData({ months: monthsArr, totalRecus, totalVendus });
      } else {
        // Récupérer les expéditions avec n_moteur puis joindre sur la vue pour obtenir nom_type_moteur
        const { data: topSales } = await supabase
          .from("tbl_expeditions_moteurs")
          .select("n_moteur, prix_vente_moteur")
          .not("n_moteur", "is", null)
          .limit(5000);

        const motorIds = [...new Set((topSales || []).map((e: any) => e.n_moteur).filter(Boolean))];
        const codeByMotor: Record<number, string> = {};
        if (motorIds.length > 0) {
          const { data: motors } = await supabase
            .from("v_moteurs_dispo")
            .select("n_moteur, nom_type_moteur")
            .in("n_moteur", motorIds);
          (motors || []).forEach((m: any) => {
            const raw = (m.nom_type_moteur || "").trim();
            const code = raw.split(/[\s\-]+/)[0].toUpperCase();
            if (code && code.length >= 2) codeByMotor[m.n_moteur] = code;
          });
        }

        const codeMap: Record<string, { ventes: number; ca: number }> = {};
        (topSales || []).forEach((e: any) => {
          const k = codeByMotor[e.n_moteur];
          if (!k) return;
          if (!codeMap[k]) codeMap[k] = { ventes: 0, ca: 0 };
          codeMap[k].ventes++;
          codeMap[k].ca += e.prix_vente_moteur || 0;
        });
        setData({
          totalVentes: (topSales || []).length,
          topOffres: Object.entries(codeMap)
            .sort((a, b) => b[1].ventes - a[1].ventes)
            .slice(0, 15)
            .map(([code, v]) => ({ code, ...v, ca: Math.round(v.ca) })),
        });
      }
      setLoading(false);
    }
    load();
  }, [tab]);

  return (
    <div>
      <PageHeader title="Analyse avancée" description="Statistiques détaillées du stock et des ventes" />

      <div className="flex bg-surface-alt rounded-lg border border-border overflow-hidden mb-6 w-fit">
        {(["Stock", "Prix", "Tendances", "Offres"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 text-sm font-medium transition-all ${tab === t ? "bg-brand text-white" : "text-text-dim hover:bg-surface-hover"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-text-muted">Chargement...</div>
      ) : tab === "Stock" && data && data.topMarques && data.byEnergie ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface border border-border rounded-[14px] p-6">
            <ChartHeader title="Stock disponible par marque (Top 10)" total={data.totalStock ?? 0} unit="moteurs" />
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.topMarques} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#4B5563" }} />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11, fill: "#4B5563" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="#C41E3A" radius={[0, 4, 4, 0]} name="Disponibles" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-surface border border-border rounded-[14px] p-6">
            <ChartHeader title="Répartition par énergie" total={data.totalStock ?? 0} unit="moteurs" />
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={data.byEnergie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {data.byEnergie.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : tab === "Prix" && data && data.ranges ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface border border-border rounded-[14px] p-6">
            <ChartHeader title="Distribution des prix d'achat" total={data.totalPrix ?? 0} unit="moteurs" />
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.ranges}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#4B5563" }} />
                <YAxis tick={{ fontSize: 12, fill: "#4B5563" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#C41E3A" radius={[6, 6, 0, 0]} name="Nb moteurs" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-surface border border-border rounded-[14px] p-6 flex flex-col justify-center items-center">
            <p className="text-text-dim text-sm mb-2">Prix d&apos;achat moyen</p>
            <p className="text-5xl font-bold text-brand">{(data.avg ?? 0).toLocaleString("fr-FR")} €</p>
          </div>
        </div>
      ) : tab === "Tendances" && data && data.months ? (
        <div className="bg-surface border border-border rounded-[14px] p-6">
          <ChartHeader title="Réceptions vs Ventes — 12 derniers mois" total={(data.totalRecus ?? 0) + (data.totalVendus ?? 0)} unit="mouvements" />
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.months}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="mois" tick={{ fontSize: 11, fill: "#4B5563" }} />
              <YAxis tick={{ fontSize: 12, fill: "#4B5563" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: "#4B5563" }} />
              <Bar dataKey="recus" fill="#60A5FA" radius={[4, 4, 0, 0]} name="Reçus" />
              <Bar dataKey="vendus" fill="#C41E3A" radius={[4, 4, 0, 0]} name="Vendus" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : tab === "Offres" && data && data.topOffres ? (
        <div className="bg-surface border border-border rounded-[14px] p-6">
          <ChartHeader title="Top 15 références les plus vendues" total={data.totalVentes ?? 0} unit="ventes" />
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.topOffres}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="code" tick={{ fontSize: 11, fill: "#4B5563" }} />
              <YAxis tick={{ fontSize: 12, fill: "#4B5563" }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [name === "ca" ? `${Number(value).toLocaleString("fr-FR")} €` : value, name === "ca" ? "CA" : "Ventes"]} />
              <Legend wrapperStyle={{ color: "#4B5563" }} />
              <Bar dataKey="ventes" fill="#C41E3A" radius={[4, 4, 0, 0]} name="Ventes" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}
