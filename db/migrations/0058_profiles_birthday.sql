-- =============================================================================
-- Capital Academy — Agrega la columna faltante profiles.birthday
--
-- Hallazgo: /classroom/profile ya intentaba guardar el campo "Cumpleaños"
-- (student-profile-client.tsx) y /api/onboarding/complete-profile ya lo
-- aceptaba en su schema, pero la columna `birthday` nunca se creó en
-- `profiles`. Guardar el cumpleaños devuelve 500 "Error al actualizar
-- perfil" porque PostgREST rechaza la actualización de una columna
-- inexistente.
--
-- Idempotente: `add column if not exists` no rompe nada si la columna ya
-- existiera por otra vía.
-- =============================================================================

alter table public.profiles add column if not exists birthday date;
