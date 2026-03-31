import { supabase } from "@/lib/supabase";
import type { DashboardKpis } from "@/lib/types";

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const { data, error } = await supabase.rpc("get_dashboard_kpis");

  if (error || !data) {
    console.error("Dashboard KPIs error:", error);
    return {
      mot_dispo: 0, mot_total: 0, bv_dispo: 0, bv_total: 0,
      mot_reserves: 0, bv_reserves: 0, ventes_mois: 0, ca_mois: 0,
      ventes_mois_prec: 0, ca_mois_prec: 0, receptions_mois: 0,
      mot_recus_mois: 0, marge_mois: 0, marge_pct: 0,
      prix_vente_moy: 0, prix_achat_moy: 0,
    };
  }

  return data as DashboardKpis;
}
