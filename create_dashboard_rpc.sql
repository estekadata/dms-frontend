CREATE OR REPLACE FUNCTION get_dashboard_kpis()
RETURNS JSON AS $$
SELECT json_build_object(
  'mot_dispo', (SELECT COUNT(*)::int FROM v_moteurs_dispo WHERE est_disponible = 1),
  'mot_total', (SELECT COUNT(*)::int FROM v_moteurs_dispo),
  'bv_dispo', (SELECT COUNT(*)::int FROM v_boites_dispo WHERE est_disponible = 1),
  'bv_total', (SELECT COUNT(*)::int FROM v_boites_dispo),
  'mot_reserves', (SELECT COUNT(*)::int FROM tbl_moteurs WHERE resa_client_moteur IS NOT NULL AND TRIM(resa_client_moteur) <> '' AND n_expedition IS NULL AND (archiver IS NULL OR archiver = false)),
  'bv_reserves', (SELECT COUNT(*)::int FROM tbl_boites WHERE resa_client_bv IS NOT NULL AND TRIM(resa_client_bv) <> '' AND (vendu IS NULL OR vendu = false) AND stock = true),
  'ventes_mois', (SELECT COUNT(*)::int FROM tbl_expeditions_moteurs WHERE date_validation >= date_trunc('month', NOW()) AND prix_vente_moteur IS NOT NULL),
  'ca_mois', COALESCE((SELECT SUM(prix_vente_moteur)::float FROM tbl_expeditions_moteurs WHERE date_validation >= date_trunc('month', NOW()) AND prix_vente_moteur IS NOT NULL), 0),
  'ventes_mois_prec', (SELECT COUNT(*)::int FROM tbl_expeditions_moteurs WHERE date_validation >= date_trunc('month', NOW()) - INTERVAL '1 month' AND date_validation < date_trunc('month', NOW()) AND prix_vente_moteur IS NOT NULL),
  'ca_mois_prec', COALESCE((SELECT SUM(prix_vente_moteur)::float FROM tbl_expeditions_moteurs WHERE date_validation >= date_trunc('month', NOW()) - INTERVAL '1 month' AND date_validation < date_trunc('month', NOW()) AND prix_vente_moteur IS NOT NULL), 0),
  'receptions_mois', (SELECT COUNT(*)::int FROM tbl_receptions WHERE date_achat >= date_trunc('month', NOW())),
  'mot_recus_mois', (SELECT COUNT(*)::int FROM tbl_moteurs m JOIN tbl_receptions r ON r.n_reception = m.num_reception WHERE r.date_achat >= date_trunc('month', NOW())),
  'marge_mois', COALESCE((SELECT (SUM(em.prix_vente_moteur) - SUM(m.prix_achat_moteur))::float FROM tbl_expeditions_moteurs em JOIN tbl_moteurs m ON m.n_moteur = em.n_moteur WHERE em.date_validation >= date_trunc('month', NOW()) AND em.prix_vente_moteur > 0 AND m.prix_achat_moteur > 0), 0),
  'marge_pct', COALESCE((SELECT ROUND(((SUM(em.prix_vente_moteur) - SUM(m.prix_achat_moteur)) / NULLIF(SUM(em.prix_vente_moteur), 0) * 100)::numeric, 1)::float FROM tbl_expeditions_moteurs em JOIN tbl_moteurs m ON m.n_moteur = em.n_moteur WHERE em.date_validation >= date_trunc('month', NOW()) AND em.prix_vente_moteur > 0 AND m.prix_achat_moteur > 0), 0),
  'prix_vente_moy', COALESCE((SELECT AVG(prix_vente_moteur)::float FROM tbl_expeditions_moteurs WHERE date_validation >= date_trunc('month', NOW()) AND prix_vente_moteur > 0), 0),
  'prix_achat_moy', COALESCE((SELECT AVG(m.prix_achat_moteur)::float FROM tbl_moteurs m JOIN tbl_receptions r ON r.n_reception = m.num_reception WHERE r.date_achat >= date_trunc('month', NOW()) AND m.prix_achat_moteur > 0), 0)
);
$$ LANGUAGE sql;
