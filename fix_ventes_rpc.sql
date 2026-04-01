CREATE OR REPLACE FUNCTION get_ventes_par_mois(p_months int DEFAULT 12)
RETURNS TABLE(mois text, nb_vendus bigint, ca numeric, type_moteur text, marque text) AS $$
SELECT
  to_char(em.date_validation, 'YYYY-MM') AS mois,
  COUNT(*) AS nb_vendus,
  COALESCE(SUM(em.prix_vente_moteur), 0) AS ca,
  LEFT(UPPER(m.code_moteur), 3) AS type_moteur,
  COALESCE(vd.marque, '') AS marque
FROM tbl_expeditions_moteurs em
JOIN tbl_moteurs m ON m.n_moteur = em.n_moteur
LEFT JOIN v_moteurs_dispo vd ON vd.n_moteur = m.n_moteur
WHERE em.date_validation >= NOW() - make_interval(months => p_months)
  AND m.code_moteur IS NOT NULL AND TRIM(m.code_moteur) <> ''
GROUP BY mois, LEFT(UPPER(m.code_moteur), 3), vd.marque
ORDER BY mois;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION get_ventes_boites_par_mois(p_months int DEFAULT 12)
RETURNS TABLE(mois text, nb_vendus bigint, code_boite text) AS $$
SELECT
  to_char(eb.date_validation, 'YYYY-MM') AS mois,
  COUNT(*) AS nb_vendus,
  COALESCE(b.ref_bv, eb.n_bv::text) AS code_boite
FROM tbl_expeditions_boites eb
LEFT JOIN tbl_boites b ON b.n_bv = eb.n_bv
WHERE eb.date_validation >= NOW() - make_interval(months => p_months)
GROUP BY mois, code_boite
ORDER BY mois;
$$ LANGUAGE sql;
