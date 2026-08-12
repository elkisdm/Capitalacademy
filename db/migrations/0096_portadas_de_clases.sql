-- =============================================================================
-- Capital Academy — Migración 0096: portada de las clases en vivo.
--
-- Las lecciones y los módulos ya tienen portada manual desde 0055
-- (`cover_image_url` + bucket público `covers`). Las clases en vivo, que son la
-- otra mitad del calendario del alumno, seguían sin imagen: en la pantalla de
-- la clase y en la lista del calendario aparecían solo como texto.
--
-- Esta migración agrega la MISMA columna a `class_sessions`, para que el mismo
-- endpoint admin de portadas (app/api/admin/covers/route.ts) la escriba con un
-- target nuevo ("session"). No se reusa `recording_url` ni la miniatura de Mux
-- de la repetición: esa miniatura solo existe cuando ya se subió la grabación,
-- y la portada tiene que servir ANTES de la clase.
--
-- No hay bucket ni policies que crear: `covers` ya existe y es público desde
-- 0055, y la escritura sigue siendo exclusivamente por service-role.
--
-- No toca las policies de `class_sessions`: la columna nueva hereda el mismo
-- scope de lectura que el resto de la fila (el alumno de la cohorte).
--
-- Idempotente (`add column if not exists`).
--
-- Aplicar con el flujo de migraciones del proyecto y regenerar los tipos
-- después (`supabase gen types`).
-- =============================================================================

alter table public.class_sessions add column if not exists cover_image_url text;

comment on column public.class_sessions.cover_image_url is
  'Portada manual de la clase (bucket público covers, subida por el endpoint admin). Null = sin portada.';
