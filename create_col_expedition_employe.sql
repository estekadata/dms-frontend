-- Employé / vendeur ayant réalisé l'expédition, pour permettre les
-- statistiques de ventes par employé (CDC : "stats par employé").
-- Même convention que tbl_moteurs.utilisateur (prénom en texte libre).
-- Colonne propre à Supabase (non remontée par la synchro Access, donc préservée).
-- À exécuter une fois dans le SQL Editor de Supabase.

ALTER TABLE public.tbl_expeditions
    ADD COLUMN IF NOT EXISTS employe TEXT;

CREATE INDEX IF NOT EXISTS idx_expeditions_employe
    ON public.tbl_expeditions(employe);

COMMENT ON COLUMN public.tbl_expeditions.employe IS
    'Vendeur/employé ayant réalisé l''expédition (prénom, même convention que tbl_moteurs.utilisateur) — géré depuis la fiche expédition';
