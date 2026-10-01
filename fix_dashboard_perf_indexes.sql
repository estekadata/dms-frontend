-- Perf Dashboard : la RPC get_dashboard_kpis dépassait le statement_timeout
-- (erreur 57014) à cause de jointures non indexées sur 128k moteurs / 121k
-- expéditions. Ces index rendent les jointures quasi instantanées.
-- À exécuter une fois dans le SQL Editor de Supabase (CREATE INDEX = sûr, non bloquant en lecture).

-- Jointure tbl_moteurs → tbl_receptions (mot_recus_mois, prix_achat_moy)
CREATE INDEX IF NOT EXISTS idx_moteurs_num_reception
    ON public.tbl_moteurs(num_reception);

-- Jointure tbl_expeditions_moteurs → tbl_moteurs (marge, prix) + filtres de date
CREATE INDEX IF NOT EXISTS idx_exp_moteurs_n_moteur
    ON public.tbl_expeditions_moteurs(n_moteur);
CREATE INDEX IF NOT EXISTS idx_exp_moteurs_date_validation
    ON public.tbl_expeditions_moteurs(date_validation);

-- Filtres de date sur les réceptions (receptions_mois, mot_recus_mois)
CREATE INDEX IF NOT EXISTS idx_receptions_date_achat
    ON public.tbl_receptions(date_achat);

-- Recalcule les statistiques du planificateur après création des index
ANALYZE public.tbl_moteurs;
ANALYZE public.tbl_expeditions_moteurs;
ANALYZE public.tbl_receptions;
