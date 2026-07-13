-- =====================================================================
-- 2026-06-17 — Verrouillage sécurité de la table d'authentification
-- =====================================================================
-- Problème corrigé :
--   La clé `anon` (publique, livrée dans le bundle navigateur) pouvait
--   SELECT / INSERT / DELETE librement sur public.dms_users
--   => dump des empreintes de mots de passe ET création de comptes
--      super_admin par n'importe qui possédant la clé publique.
--
-- Correctif :
--   1. Fonction dms_login() en SECURITY DEFINER : seule porte d'entrée
--      autorisée pour `anon`. Elle ne renvoie l'utilisateur que si
--      (email, password_hash, actif) correspondent, et met à jour last_login.
--   2. RLS activée sur dms_users + révocation des privilèges de table à
--      anon/authenticated => plus aucun accès direct via la clé publique.
--      Le rôle `postgres` (backend Python, owner, BYPASSRLS) garde l'accès.
--
-- Idempotent : peut être rejoué sans risque.
-- Appliqué en prod le 2026-06-17.
-- =====================================================================

-- 1) Fonction de login (SECURITY DEFINER, contourne la RLS)
CREATE OR REPLACE FUNCTION public.dms_login(p_email text, p_password_hash text)
RETURNS TABLE(id bigint, email text, nom text, role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.dms_users u
     SET last_login = NOW()
   WHERE u.email = trim(p_email)
     AND u.password_hash = p_password_hash
     AND u.actif = true
  RETURNING u.id, u.email, u.nom, u.role;
END;
$$;

-- Seuls les rôles applicatifs peuvent l'exécuter (pas PUBLIC au sens large)
REVOKE ALL ON FUNCTION public.dms_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dms_login(text, text) TO anon, authenticated;

-- 2) Verrouillage de la table
ALTER TABLE public.dms_users ENABLE ROW LEVEL SECURITY;

-- Ceinture + bretelles : on retire aussi les privilèges de table à la clé publique.
-- (la RLS suffit déjà à tout bloquer, mais on ne laisse aucune porte ouverte)
REVOKE ALL ON TABLE public.dms_users FROM anon, authenticated;
