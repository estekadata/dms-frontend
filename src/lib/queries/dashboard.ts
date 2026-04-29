import { supabase } from "@/lib/supabase";
import type { DashboardKpis } from "@/lib/types";

const EMPTY: DashboardKpis = {
  mot_dispo: 0, mot_total: 0, bv_dispo: 0, bv_total: 0,
  mot_reserves: 0, bv_reserves: 0, ventes_mois: 0, ca_mois: 0,
  ventes_mois_prec: 0, ca_mois_prec: 0, receptions_mois: 0,
  mot_recus_mois: 0, marge_mois: 0, marge_pct: 0,
  prix_vente_moy: 0, prix_achat_moy: 0,
};

/**
 * Récupère les KPIs du tableau de bord.
 * Si year/month sont fournis → KPIs de ce mois précis. Sinon → mois courant.
 * La RPC accepte ces paramètres (cf create_dashboard_rpc_v2.sql).
 */
export async function getDashboardKpis(year?: number, month?: number): Promise<DashboardKpis> {
  const args =
    year && month ? { p_year: year, p_month: month } : {};
  const { data, error } = await supabase.rpc("get_dashboard_kpis", args);

  if (error || !data) {
    console.error("Dashboard KPIs error:", error);
    return EMPTY;
  }
  return data as DashboardKpis;
}
