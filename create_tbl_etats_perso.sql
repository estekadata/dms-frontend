-- États personnalisés : Karine construit et sauvegarde ses propres états
-- (choix de colonnes + filtres + tri), rejouables depuis /etats/constructeur.
-- À exécuter une fois dans le SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS public.tbl_etats_perso (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nom           TEXT NOT NULL,
    source        TEXT NOT NULL DEFAULT 'moteurs',   -- source de données de l'état
    config        JSONB NOT NULL DEFAULT '{}'::jsonb, -- { columns, filters, sort }
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_etats_perso_source
    ON public.tbl_etats_perso(source);

-- Cohérent avec le reste du schéma DMS (RLS désactivé, accès via clé anon).
ALTER TABLE public.tbl_etats_perso DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.tbl_etats_perso IS
    'États personnalisés sauvegardés (page /etats/constructeur)';
