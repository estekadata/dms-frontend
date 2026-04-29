-- Dashboard KPIs paramétrés par mois/année.
-- Si p_year/p_month sont NULL → mois courant (comportement par défaut).
-- Sinon → mois cible. Les KPIs "stock" (mot_dispo, etc.) restent toujours
-- l'état courant de la base car ils ne sont pas datés.
--
-- À exécuter dans Supabase → SQL Editor → Run.

CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(
  p_year INTEGER DEFAULT NULL,
  p_month INTEGER DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  month_start DATE;
  month_end DATE;
  prev_start DATE;
  prev_end DATE;
BEGIN
  IF p_year IS NULL OR p_month IS NULL THEN
    month_start := date_trunc('month', NOW())::DATE;
  ELSE
    month_start := make_date(p_year, p_month, 1);
  END IF;
  month_end := (month_start + INTERVAL '1 month')::DATE;
  prev_start := (month_start - INTERVAL '1 month')::DATE;
  prev_end := month_start;

  RETURN json_build_object(
    -- Stocks (état courant, pas dépendant du mois choisi)
    'mot_dispo', (SELECT COUNT(*)::int FROM v_moteurs_dispo WHERE est_disponible = 1),
    'mot_total', (SELECT COUNT(*)::int FROM v_moteurs_dispo),
    'bv_dispo', (SELECT COUNT(*)::int FROM v_boites_dispo WHERE est_disponible = 1),
    'bv_total', (SELECT COUNT(*)::int FROM v_boites_dispo),
    'mot_reserves', (SELECT COUNT(*)::int FROM tbl_moteurs WHERE resa_client_moteur IS NOT NULL AND TRIM(resa_client_moteur) <> '' AND n_expedition IS NULL AND (archiver IS NULL OR archiver = false)),
    'bv_reserves', (SELECT COUNT(*)::int FROM tbl_boites WHERE resa_client_bv IS NOT NULL AND TRIM(resa_client_bv) <> '' AND (vendu IS NULL OR vendu = false) AND stock = true),

    -- Ventes du mois cible
    'ventes_mois', (SELECT COUNT(*)::int FROM tbl_expeditions_moteurs WHERE date_validation >= month_start AND date_validation < month_end AND prix_vente_moteur IS NOT NULL),
    'ca_mois', COALESCE((SELECT SUM(prix_vente_moteur)::float FROM tbl_expeditions_moteurs WHERE date_validation >= month_start AND date_validation < month_end AND prix_vente_moteur IS NOT NULL), 0),

    -- Mois précédent (pour la tendance)
    'ventes_mois_prec', (SELECT COUNT(*)::int FROM tbl_expeditions_moteurs WHERE date_validation >= prev_start AND date_validation < prev_end AND prix_vente_moteur IS NOT NULL),
    'ca_mois_prec', COALESCE((SELECT SUM(prix_vente_moteur)::float FROM tbl_expeditions_moteurs WHERE date_validation >= prev_start AND date_validation < prev_end AND prix_vente_moteur IS NOT NULL), 0),

    -- Réceptions du mois cible
    'receptions_mois', (SELECT COUNT(*)::int FROM tbl_receptions WHERE date_achat >= month_start AND date_achat < month_end),
    'mot_recus_mois', (SELECT COUNT(*)::int FROM tbl_moteurs m JOIN tbl_receptions r ON r.n_reception = m.num_reception WHERE r.date_achat >= month_start AND r.date_achat < month_end),

    -- Marge du mois cible
    'marge_mois', COALESCE((
      SELECT (SUM(em.prix_vente_moteur) - SUM(m.prix_achat_moteur))::float
      FROM tbl_expeditions_moteurs em
      JOIN tbl_moteurs m ON m.n_moteur = em.n_moteur
      WHERE em.date_validation >= month_start AND em.date_validation < month_end
        AND em.prix_vente_moteur > 0 AND m.prix_achat_moteur > 0
    ), 0),
    'marge_pct', COALESCE((
      SELECT ROUND(((SUM(em.prix_vente_moteur) - SUM(m.prix_achat_moteur)) / NULLIF(SUM(em.prix_vente_moteur), 0) * 100)::numeric, 1)::float
      FROM tbl_expeditions_moteurs em
      JOIN tbl_moteurs m ON m.n_moteur = em.n_moteur
      WHERE em.date_validation >= month_start AND em.date_validation < month_end
        AND em.prix_vente_moteur > 0 AND m.prix_achat_moteur > 0
    ), 0),

    -- Prix moyens du mois cible
    'prix_vente_moy', COALESCE((SELECT AVG(prix_vente_moteur)::float FROM tbl_expeditions_moteurs WHERE date_validation >= month_start AND date_validation < month_end AND prix_vente_moteur > 0), 0),
    'prix_achat_moy', COALESCE((
      SELECT AVG(m.prix_achat_moteur)::float
      FROM tbl_moteurs m
      JOIN tbl_receptions r ON r.n_reception = m.num_reception
      WHERE r.date_achat >= month_start AND r.date_achat < month_end AND m.prix_achat_moteur > 0
    ), 0)
  );
END;
$$ LANGUAGE plpgsql;
