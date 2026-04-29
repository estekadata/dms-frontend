-- Diagnostic : pourquoi ventes_mois = 0 en avril 2026 ?
-- A executer dans Supabase SQL Editor.

-- 1) Combien de lignes dans tbl_expeditions_moteurs sur avril 2026 (toutes confondues) ?
SELECT 'avril_2026_total' AS bucket,
       COUNT(*)                                                      AS n_lignes,
       COUNT(prix_vente_moteur)                                      AS n_avec_prix,
       COUNT(*) - COUNT(prix_vente_moteur)                           AS n_sans_prix,
       MIN(date_validation)                                          AS premiere_date,
       MAX(date_validation)                                          AS derniere_date
FROM tbl_expeditions_moteurs
WHERE date_validation >= DATE '2026-04-01'
  AND date_validation <  DATE '2026-05-01';

-- 2) Idem pour mars 2026 (la tendance dit 72 ventes -> on doit retomber sur ~72)
SELECT 'mars_2026_total' AS bucket,
       COUNT(*)                                                      AS n_lignes,
       COUNT(prix_vente_moteur)                                      AS n_avec_prix,
       COUNT(*) - COUNT(prix_vente_moteur)                           AS n_sans_prix
FROM tbl_expeditions_moteurs
WHERE date_validation >= DATE '2026-03-01'
  AND date_validation <  DATE '2026-04-01';

-- 3) Derniere date_validation enregistree (pour voir jusqu'ou la sync va)
SELECT MAX(date_validation) AS derniere_validation_globale
FROM tbl_expeditions_moteurs;

-- 4) Y a-t-il des expeditions parent sur avril 2026 dont les enfants n'ont pas de date_validation ?
SELECT COUNT(*) AS exp_avril_avec_enfants_sans_date
FROM tbl_expeditions e
JOIN tbl_expeditions_moteurs em ON em.n_expedition = e.n_expedition
WHERE e.date_chargement >= DATE '2026-04-01'
  AND e.date_chargement <  DATE '2026-05-01'
  AND em.date_validation IS NULL;
