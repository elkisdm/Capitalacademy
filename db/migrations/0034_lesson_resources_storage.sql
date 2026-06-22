-- =============================================================================
-- Capital Academy — Migración 0034: subida de archivos como recurso de lección.
--
-- Hasta ahora `lesson_resources` solo referenciaba recursos por URL (link
-- externo). Las columnas `storage_path` y `file_size_bytes` existían desde 0006
-- pero nunca se usaron. Esta migración habilita la subida real de archivos:
--
--   1. Bucket privado `lesson-resources` (límite 50 MB, cualquier MIME).
--      Privado igual que `certificates` (ver 0029): el contenido del classroom
--      está gateado por matrícula, un bucket público filtraría material a
--      cualquiera con el link. Las descargas se entregan vía signed URLs
--      generadas server-side (createAdminClient), nunca por URL pública fija.
--   2. `url` pasa a NULLABLE: un recurso subido vive en `storage_path`, no en
--      `url`. Un CHECK garantiza que siempre haya uno u otro.
--
-- No se crean policies de lectura sobre storage.objects: igual que certificados,
-- todo acceso pasa por service-role (bypassa RLS) que firma URLs con expiración.
-- La subida va por signed upload URL (token), que tampoco depende de RLS.
--
-- Idempotente: on conflict do nothing, drop constraint if exists antes de add.
-- =============================================================================

-- 1. Bucket privado con límite de 50 MB (52428800 bytes). allowed_mime_types
--    NULL = se acepta cualquier tipo (documentos y multimedia). El límite de
--    tamaño también se valida en la API y en el cliente (defensa en profundidad).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lesson-resources', 'lesson-resources', false, 52428800, null)
on conflict (id) do update
  set public = false,
      file_size_limit = 52428800,
      allowed_mime_types = null;

-- 2. url deja de ser obligatoria (los recursos subidos usan storage_path).
alter table public.lesson_resources alter column url drop not null;

-- 3. Garantiza que cada recurso tenga al menos un origen: link (url) o
--    archivo subido (storage_path).
alter table public.lesson_resources
  drop constraint if exists lesson_resources_url_or_path_chk;
alter table public.lesson_resources
  add constraint lesson_resources_url_or_path_chk
  check (url is not null or storage_path is not null);
