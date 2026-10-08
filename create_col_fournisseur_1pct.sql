-- Règle "décompte 1 % sur facture" applicable à CERTAINS fournisseurs uniquement
-- (CDC §6.3 : "pour certains fournisseurs uniquement").
-- Colonne propre à Supabase (non remontée par la synchro Access, donc préservée).
-- À exécuter une fois dans le SQL Editor de Supabase.

ALTER TABLE public.tbl_fournisseurs
    ADD COLUMN IF NOT EXISTS decompte_1pct BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.tbl_fournisseurs.decompte_1pct IS
    'Applique le décompte de 1 % sur la facture (certains fournisseurs) — géré depuis la fiche fournisseur';
