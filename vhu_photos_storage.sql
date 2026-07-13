-- =====================================================================
-- 2026-07-13 — Photo moteur sur les offres VHU
-- =====================================================================
-- Déjà appliqué en prod via la connexion pooler. Ce fichier documente
-- l'infra pour reproductibilité.
--
-- 1) Bucket public pour les photos moteurs des centres VHU.
-- 2) Policies : upload + lecture autorisés à anon/authenticated (l'app
--    utilise la clé anon, comme pour le bucket "imports").
-- 3) La vue v_offres_pending expose la photo pour l'écran admin.
-- =====================================================================

-- 1) Bucket public
insert into storage.buckets (id, name, public)
values ('vhu-photos', 'vhu-photos', true)
on conflict (id) do update set public = true;

-- 2) Policies storage
drop policy if exists "vhu_photos_insert" on storage.objects;
create policy "vhu_photos_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'vhu-photos');

drop policy if exists "vhu_photos_select" on storage.objects;
create policy "vhu_photos_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'vhu-photos');

-- 3) Exposer la photo (et immatriculation/vin) dans la vue des offres en attente
CREATE OR REPLACE VIEW public.v_offres_pending AS
 SELECT o.id, o.breaker_id, b.name AS breaker_name, o.code_moteur, o.marque,
    o.energie, o.type_nom, o.type_modele, o.type_annee, o.prix_demande, o.qty,
    o.note, o.created_at, o.photo_moteur_path, o.immatriculation, o.vin
   FROM breaker_click_offers o
     JOIN breakers b ON b.id = o.breaker_id
  WHERE o.status = 'pending'::text
  ORDER BY b.name, o.created_at DESC;
