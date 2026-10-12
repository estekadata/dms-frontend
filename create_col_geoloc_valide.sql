-- Validation explicite de l'emplacement (CDC 6.1 : "l'emplacement doit être
-- validé ou invalidé explicitement dans le logiciel").
-- Colonnes propres à Supabase (non remontées par la synchro Access, préservées).
-- À exécuter une fois dans le SQL Editor de Supabase.

ALTER TABLE public.tbl_moteurs
    ADD COLUMN IF NOT EXISTS geoloc_valide BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS geoloc_date   TIMESTAMPTZ;

COMMENT ON COLUMN public.tbl_moteurs.geoloc_valide IS
    'Emplacement (geloc_mot) validé explicitement dans le logiciel (CDC 6.1)';
COMMENT ON COLUMN public.tbl_moteurs.geoloc_date IS
    'Date de dernière validation/modification d''emplacement dans le logiciel';
