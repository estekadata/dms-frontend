-- Catalogue des prix d'achat proposés par code moteur.
-- Utilisé par la page /prix (mise à jour manuelle + import Excel).
-- À exécuter une fois dans le SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS public.tbl_prix_moteurs (
    code_moteur   TEXT PRIMARY KEY,
    prix_propose  NUMERIC(12, 2),
    marque        TEXT,
    date_maj      TIMESTAMPTZ DEFAULT NOW(),
    utilisateur   TEXT
);

CREATE INDEX IF NOT EXISTS idx_tbl_prix_moteurs_marque
    ON public.tbl_prix_moteurs(marque);

-- Cohérent avec le reste du schéma DMS (RLS désactivé).
ALTER TABLE public.tbl_prix_moteurs DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.tbl_prix_moteurs IS
    'Catalogue des prix d''achat proposés par code moteur — alimenté par la page /prix';
