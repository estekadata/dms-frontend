-- Suivi de la date de préparation par moteur et par boîte (CDC 6.4 / 6.5).
-- Colonnes propres à Supabase (non remontées par la synchro Access, préservées).
-- À exécuter une fois dans le SQL Editor de Supabase.

ALTER TABLE public.tbl_moteurs
    ADD COLUMN IF NOT EXISTS date_preparation TIMESTAMPTZ;
ALTER TABLE public.tbl_boites
    ADD COLUMN IF NOT EXISTS date_preparation TIMESTAMPTZ;

COMMENT ON COLUMN public.tbl_moteurs.date_preparation IS
    'Date de préparation du moteur (bon de préparation, CDC 6.5)';
COMMENT ON COLUMN public.tbl_boites.date_preparation IS
    'Date de préparation de la boîte (bon de préparation, CDC 6.5)';
