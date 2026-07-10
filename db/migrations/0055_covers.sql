-- =============================================================================
-- Capital Academy — Migración 0055: portadas de módulos y lecciones.
--
-- `lessons.thumbnail_url` ya existe, pero es la miniatura que genera Mux y que
-- el webhook (app/api/webhooks/mux/route.ts:247/313) SOBREESCRIBE cada vez que
-- se procesa un video nuevo. No sirve para una portada elegida a mano por el
-- admin: se perdería en el siguiente upload. Por eso esta migración agrega una
-- columna NUEVA e independiente `cover_image_url` (en `program_modules` y en
-- `lessons`) que solo el endpoint admin de portadas escribe.
--
-- Bucket PÚBLICO `covers` (mismo patrón que `avatars`, migración 0016):
-- branding no sensible, público simplifica next/image (sin signed URLs que
-- expiran). Solo imágenes, límite 2 MB. La escritura es exclusivamente vía
-- service-role (endpoint admin); no hay policy de insert/update para
-- `authenticated`, a diferencia de `avatars`.
--
-- Idempotente.
-- =============================================================================

-- 1. Columna de portada manual, separada de thumbnail_url (Mux).
alter table public.program_modules add column if not exists cover_image_url text;
alter table public.lessons add column if not exists cover_image_url text;

-- 2. Bucket público para las portadas (solo imágenes, 2 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'covers',
  'covers',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- 3. Lectura pública (las portadas se muestran en el classroom del alumno).
drop policy if exists "Public covers read access" on storage.objects;
create policy "Public covers read access"
  on storage.objects for select
  to public
  using (bucket_id = 'covers');
