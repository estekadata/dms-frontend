-- Marges par type de moteur (CDC : calcul des marges).
-- Pour chaque type, sur les moteurs réellement VENDUS dans la période :
--   prix de vente moyen, prix d'achat moyen (de ces mêmes moteurs),
--   marge unitaire et marge %.
-- Mêmes jointures que get_marge_mois (déjà en prod), donc cohérent.
-- À exécuter une fois dans le SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION get_marges_moteurs(p_months int DEFAULT 12, p_limit int DEFAULT 500)
RETURNS TABLE(
  type_moteur text,
  marque text,
  nb_vendus bigint,
  prix_achat_moy numeric,
  prix_vente_moy numeric,
  marge_unitaire numeric,
  marge_pct numeric
) AS $$
WITH ventes AS (
    SELECT tm.nom_type_moteur AS type_moteur,
           COUNT(*)                     AS nb_vendus,
           AVG(em.prix_vente_moteur)    AS prix_vente_moy,
           AVG(m.prix_achat_moteur)     AS prix_achat_moy,
           MAX(ma.nom_marque)           AS marque
    FROM tbl_expeditions_moteurs em
    JOIN tbl_moteurs m        ON m.n_moteur = em.n_moteur
    JOIN tbl_types_moteurs tm ON tm.n_type_moteur = m.n_type_moteur
    LEFT JOIN tbl_marques ma  ON ma.n_marque = tm.n_marque
    WHERE em.date_validation >= NOW() - (p_months || ' months')::INTERVAL
      AND em.prix_vente_moteur IS NOT NULL AND em.prix_vente_moteur > 0
      AND m.prix_achat_moteur  IS NOT NULL AND m.prix_achat_moteur  > 0
      AND tm.nom_type_moteur IS NOT NULL AND TRIM(tm.nom_type_moteur) <> ''
    GROUP BY tm.nom_type_moteur
)
SELECT type_moteur,
       COALESCE(marque, '')                         AS marque,
       nb_vendus,
       ROUND(prix_achat_moy, 2)                      AS prix_achat_moy,
       ROUND(prix_vente_moy, 2)                      AS prix_vente_moy,
       ROUND(prix_vente_moy - prix_achat_moy, 2)     AS marge_unitaire,
       CASE WHEN prix_vente_moy > 0
            THEN ROUND((prix_vente_moy - prix_achat_moy) / prix_vente_moy * 100, 1)
            ELSE 0 END                               AS marge_pct
FROM ventes
ORDER BY nb_vendus DESC
LIMIT p_limit;
$$ LANGUAGE sql;
