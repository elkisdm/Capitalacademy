-- =============================================================================
-- Capital Academy — Migración 0038: subida de archivos en recursos de sesión.
--
-- `session_resources` (recursos de las clases del calendario) era solo-URL
-- (migración 0027). Para programas híbridos como el Diplomado —cuyo contenido
-- son las clases del calendario, no lecciones grabadas— el equipo necesita
-- adjuntar ARCHIVOS (PDFs, presentaciones, etc.) a cada clase.
--
-- Espeja lo hecho en lesson_resources (0034): mismo bucket privado
-- `lesson-resources` (reusado para todo recurso de classroom), `url` nullable y
-- CHECK de que exista link o archivo. Las descargas van por signed URL
-- server-side (resolveResourceUrls), igual que las lecciones.
--
-- Idempotente: add column if not exists, drop/add constraint.
-- =============================================================================

alter table public.session_resources
  add column if not exists storage_path text,
  add column if not exists file_size_bytes bigint;

alter table public.session_resources
  alter column url drop not null;

alter table public.session_resources
  drop constraint if exists session_resources_url_or_path_chk;
alter table public.session_resources
  add constraint session_resources_url_or_path_chk
  check (url is not null or storage_path is not null);
