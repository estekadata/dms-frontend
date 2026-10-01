-- Module d'aide à la commande : liste de moteurs recherchés par client.
-- Quand un moteur disponible correspond à une recherche active, l'outil le
-- propose à la réservation pour le client concerné (page /recherches).
-- À exécuter une fois dans le SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS public.tbl_recherches_clients (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    n_client      INTEGER NOT NULL,
    recherche     TEXT NOT NULL,          -- ce que le client cherche (type / code moteur, saisie libre)
    marque        TEXT,
    notes         TEXT,
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_resolue  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_recherches_clients_active
    ON public.tbl_recherches_clients(active);
CREATE INDEX IF NOT EXISTS idx_recherches_clients_client
    ON public.tbl_recherches_clients(n_client);

-- Cohérent avec le reste du schéma DMS (RLS désactivé, accès via clé anon).
ALTER TABLE public.tbl_recherches_clients DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.tbl_recherches_clients IS
    'Aide à la commande : moteurs recherchés par client (page /recherches)';
