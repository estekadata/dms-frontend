-- =============================================================
-- Workflow d'acceptation/livraison des offres VHU
-- A jouer dans Supabase SQL Editor en une seule fois.
-- Idempotent : peut etre rejoue sans risque.
-- =============================================================

-- 1) Etendre breaker_click_offers avec le statut + traceabilite
ALTER TABLE breaker_click_offers
  ADD COLUMN IF NOT EXISTS status      TEXT      NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS n_reception INTEGER   REFERENCES tbl_receptions(n_reception),
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_offers_status         ON breaker_click_offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_breaker_status ON breaker_click_offers(breaker_id, status);

-- 2) Lien breaker -> fournisseur (auto-cree a la 1re acceptation)
ALTER TABLE breakers
  ADD COLUMN IF NOT EXISTS n_fournisseur INTEGER REFERENCES tbl_fournisseurs(n_fournisseur);

-- =============================================================
-- 3) RPC admin_accept_offers
--    - cree un fournisseur (si pas deja mappe sur le breaker)
--    - cree une reception brouillon
--    - bascule les offres en 'accepted' avec n_reception
--    - garde-fou : toutes les offres doivent appartenir au meme breaker
-- =============================================================
DROP FUNCTION IF EXISTS admin_accept_offers(integer[]);
CREATE OR REPLACE FUNCTION admin_accept_offers(p_offer_ids INTEGER[])
RETURNS INTEGER AS $$
DECLARE
  v_breaker_id    INTEGER;
  v_breaker_name  TEXT;
  v_n_fournisseur INTEGER;
  v_n_reception   INTEGER;
  v_count_breakers INTEGER;
BEGIN
  SELECT COUNT(DISTINCT breaker_id) INTO v_count_breakers
  FROM breaker_click_offers
  WHERE id = ANY(p_offer_ids) AND status = 'pending';

  IF v_count_breakers = 0 THEN
    RAISE EXCEPTION 'Aucune offre pending dans la selection';
  END IF;
  IF v_count_breakers > 1 THEN
    RAISE EXCEPTION 'Selection contient plusieurs breakers — accepter par breaker uniquement';
  END IF;

  SELECT DISTINCT breaker_id INTO v_breaker_id
  FROM breaker_click_offers
  WHERE id = ANY(p_offer_ids) AND status = 'pending';

  SELECT name, n_fournisseur INTO v_breaker_name, v_n_fournisseur
  FROM breakers WHERE id = v_breaker_id;

  -- Auto-create fournisseur si pas encore mappe
  IF v_n_fournisseur IS NULL THEN
    INSERT INTO tbl_fournisseurs (n_fournisseur, nom_fournisseur, autres_infos)
    VALUES (
      COALESCE((SELECT MAX(n_fournisseur) FROM tbl_fournisseurs), 0) + 1,
      v_breaker_name,
      'Centre VHU (auto-cree depuis offres)'
    )
    RETURNING n_fournisseur INTO v_n_fournisseur;

    UPDATE breakers SET n_fournisseur = v_n_fournisseur WHERE id = v_breaker_id;
  END IF;

  -- Cree la reception brouillon
  INSERT INTO tbl_receptions (n_reception, n_fournisseur, date_achat)
  VALUES (
    COALESCE((SELECT MAX(n_reception) FROM tbl_receptions), 0) + 1,
    v_n_fournisseur,
    NOW()
  )
  RETURNING n_reception INTO v_n_reception;

  -- Update offres
  UPDATE breaker_click_offers
  SET status      = 'accepted',
      n_reception = v_n_reception,
      accepted_at = NOW()
  WHERE id = ANY(p_offer_ids) AND status = 'pending';

  RETURN v_n_reception;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- 4) RPC admin_reject_offers
-- =============================================================
DROP FUNCTION IF EXISTS admin_reject_offers(integer[]);
CREATE OR REPLACE FUNCTION admin_reject_offers(p_offer_ids INTEGER[])
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE breaker_click_offers
  SET status = 'rejected', rejected_at = NOW()
  WHERE id = ANY(p_offer_ids) AND status = 'pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- 5) RPC vhu_deliver_offer
--    - cree qty lignes dans tbl_moteurs (stock effectif)
--    - bascule l'offre en 'delivered'
--    - garde-fou : seul le breaker proprietaire peut livrer ses offres
-- =============================================================
DROP FUNCTION IF EXISTS vhu_deliver_offer(integer, integer);
CREATE OR REPLACE FUNCTION vhu_deliver_offer(p_offer_id INTEGER, p_breaker_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_offer        breaker_click_offers%ROWTYPE;
  v_n_type       INTEGER;
  v_next_n_mot   INTEGER;
  v_qty          INTEGER;
  v_i            INTEGER;
BEGIN
  SELECT * INTO v_offer
  FROM breaker_click_offers
  WHERE id = p_offer_id
    AND breaker_id = p_breaker_id
    AND status = 'accepted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offre introuvable, deja livree, ou pas encore acceptee';
  END IF;

  -- Match best-effort code_moteur -> n_type_moteur
  SELECT n_type_moteur INTO v_n_type
  FROM tbl_types_moteurs
  WHERE nom_type_moteur = v_offer.code_moteur
  LIMIT 1;

  v_qty := COALESCE(v_offer.qty, 1);
  v_next_n_mot := COALESCE((SELECT MAX(n_moteur) FROM tbl_moteurs), 0) + 1;

  FOR v_i IN 1..v_qty LOOP
    INSERT INTO tbl_moteurs (
      n_moteur, num_reception, n_type_moteur, code_moteur,
      prix_achat_moteur, date_modif, archiver
    )
    VALUES (
      v_next_n_mot, v_offer.n_reception, v_n_type, v_offer.code_moteur,
      v_offer.prix_demande, NOW(), false
    );
    v_next_n_mot := v_next_n_mot + 1;
  END LOOP;

  UPDATE breaker_click_offers
  SET status = 'delivered', delivered_at = NOW()
  WHERE id = p_offer_id;

  RETURN v_qty;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- 6) Vue pratique pour l'admin : offres pending enrichies du nom du breaker
-- =============================================================
CREATE OR REPLACE VIEW v_offres_pending AS
SELECT o.id,
       o.breaker_id,
       b.name           AS breaker_name,
       o.code_moteur,
       o.marque,
       o.energie,
       o.type_nom,
       o.type_modele,
       o.type_annee,
       o.prix_demande,
       o.qty,
       o.note,
       o.created_at
FROM breaker_click_offers o
JOIN breakers b ON b.id = o.breaker_id
WHERE o.status = 'pending'
ORDER BY b.name, o.created_at DESC;

-- =============================================================
-- 7) Permissions PostgREST (anon + authenticated peuvent appeler les RPC)
-- =============================================================
GRANT EXECUTE ON FUNCTION admin_accept_offers(integer[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_reject_offers(integer[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION vhu_deliver_offer(integer, integer) TO anon, authenticated;
GRANT SELECT ON v_offres_pending TO anon, authenticated;
