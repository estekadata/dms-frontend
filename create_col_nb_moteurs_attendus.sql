-- Nombre de moteurs attendus à la réception (CDC 6.3, champ de création).
-- Colonne propre à Supabase (non remontée par la synchro Access, préservée).
-- À exécuter une fois dans le SQL Editor de Supabase.

ALTER TABLE public.tbl_receptions
    ADD COLUMN IF NOT EXISTS nb_moteurs_attendus INTEGER;

COMMENT ON COLUMN public.tbl_receptions.nb_moteurs_attendus IS
    'Nombre de moteurs attendus, saisi à la création de la réception (CDC 6.3)';
