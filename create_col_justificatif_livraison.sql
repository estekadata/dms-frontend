-- Suivi du justificatif de livraison / d'export par expédition (CDC 6.5).
-- Colonnes propres à Supabase (non remontées par la synchro Access, préservées).
-- À exécuter une fois dans le SQL Editor de Supabase.

ALTER TABLE public.tbl_expeditions
    ADD COLUMN IF NOT EXISTS justificatif_recu  BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS justificatif_date  TIMESTAMPTZ;

COMMENT ON COLUMN public.tbl_expeditions.justificatif_recu IS
    'Justificatif de livraison / d''export reçu (CDC 6.5)';
COMMENT ON COLUMN public.tbl_expeditions.justificatif_date IS
    'Date de réception du justificatif de livraison';
