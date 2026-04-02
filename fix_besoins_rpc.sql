CREATE OR REPLACE FUNCTION get_besoins_moteurs(p_limit int DEFAULT 100)
RETURNS TABLE(
  code_moteur text,
  type_moteur text,
  marque text,
  energie text,
  type_nom text,
  type_modele text,
  type_annee text,
  nb_vendus_3m bigint,
  nb_stock_dispo bigint,
  prix_moy_achat_3m numeric
) AS $$
WITH ventes AS (
    SELECT
        UPPER(m.code_moteur) AS code_moteur,
        m.n_type_moteur,
        COUNT(*) AS nb_vendus_3m
    FROM tbl_expeditions_moteurs em
    JOIN tbl_moteurs m ON m.n_moteur = em.n_moteur
    WHERE em.date_validation >= NOW() - INTERVAL '3 months'
      AND m.code_moteur IS NOT NULL
      AND TRIM(m.code_moteur) <> ''
    GROUP BY UPPER(m.code_moteur), m.n_type_moteur
),
achats AS (
    SELECT
        UPPER(m.code_moteur) AS code_moteur,
        AVG(CASE WHEN r.date_achat >= NOW() - INTERVAL '3 months' THEN m.prix_achat_moteur END) AS prix_moy_3m
    FROM tbl_moteurs m
    JOIN tbl_receptions r ON r.n_reception = m.num_reception
    WHERE m.prix_achat_moteur IS NOT NULL AND r.date_achat IS NOT NULL
    GROUP BY UPPER(m.code_moteur)
),
stock_dispo AS (
    SELECT
        UPPER(m.code_moteur) AS code_moteur,
        MAX(ma.nom_marque) AS marque,
        MAX(e.nom_energie) AS energie,
        MAX(tm.nom_type_moteur) AS type_nom,
        MAX(tm.nom_type_moteur) AS type_modele,
        '' AS type_annee,
        COUNT(*) AS nb_stock_dispo
    FROM tbl_moteurs m
    LEFT JOIN tbl_types_moteurs tm ON tm.n_type_moteur = m.n_type_moteur
    LEFT JOIN tbl_marques ma ON ma.n_marque = tm.n_marque
    LEFT JOIN tbl_energie e ON e.n_energie = COALESCE(tm.n_energie, m.compo_moteur)
    WHERE m.n_expedition IS NULL
      AND (m.archiver IS NULL OR m.archiver = false)
      AND m.code_moteur IS NOT NULL
    GROUP BY UPPER(m.code_moteur)
),
type_info AS (
    SELECT
        UPPER(m.code_moteur) AS code_moteur,
        MAX(tm.nom_type_moteur) AS nom_type,
        MAX(ma.nom_marque) AS marque,
        MAX(e.nom_energie) AS energie
    FROM tbl_moteurs m
    LEFT JOIN tbl_types_moteurs tm ON tm.n_type_moteur = m.n_type_moteur
    LEFT JOIN tbl_marques ma ON ma.n_marque = tm.n_marque
    LEFT JOIN tbl_energie e ON e.n_energie = COALESCE(tm.n_energie, m.compo_moteur)
    WHERE m.code_moteur IS NOT NULL
    GROUP BY UPPER(m.code_moteur)
)
SELECT
    v.code_moteur,
    LEFT(COALESCE(ti.nom_type, s.type_nom, v.code_moteur), 3) AS type_moteur,
    COALESCE(ti.marque, s.marque, '') AS marque,
    COALESCE(ti.energie, s.energie, '') AS energie,
    COALESCE(ti.nom_type, s.type_nom, '') AS type_nom,
    COALESCE(s.type_modele, '') AS type_modele,
    COALESCE(s.type_annee, '') AS type_annee,
    v.nb_vendus_3m,
    COALESCE(s.nb_stock_dispo, 0) AS nb_stock_dispo,
    ROUND(a.prix_moy_3m, 2) AS prix_moy_achat_3m
FROM ventes v
LEFT JOIN achats a ON a.code_moteur = v.code_moteur
LEFT JOIN stock_dispo s ON s.code_moteur = v.code_moteur
LEFT JOIN type_info ti ON ti.code_moteur = v.code_moteur
ORDER BY v.nb_vendus_3m DESC
LIMIT p_limit;
$$ LANGUAGE sql;
