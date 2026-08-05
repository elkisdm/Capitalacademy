-- =============================================================================
-- Capital Academy — Tour guiado del alumno: estado "ya lo vio" en `profiles`.
--
-- Contexto (reunión con la clienta del 2026-07-29): la asistencia y el uso
-- están bajos y hay alumnos que no encuentran las secciones del classroom. El
-- sábado siguiente hubo una demo guiada presencial; el tour existe para
-- escalar esa demo a todos los alumnos, incluidos los que se matriculan
-- después.
--
-- Por qué en `profiles` y no en localStorage: el alumno entra desde el
-- teléfono y desde el computador, y el tour no debe repetirse al cambiar de
-- dispositivo. Además la clienta quiere medir adopción, y una preferencia de
-- navegador no es consultable. Mismo criterio y misma forma que
-- `onboarding_completed_at` (0014).
--
-- `tour_completed_at` marca CUÁNDO CERRÓ el tour, sin importar si llegó al
-- final o lo saltó: es el flag que evita que se dispare solo otra vez.
-- `tour_outcome` guarda CÓMO lo cerró, que es la métrica de adopción real
-- (terminado vs. saltado).
--
-- El tour es re-lanzable desde el Centro de ayuda. Un re-lanzamiento SÍ
-- reescribe ambas columnas: la lectura correcta es "la última vez que lo vio y
-- cómo lo cerró esa vez". Se prefiere sobre conservar la primera vez porque el
-- caso que interesa medir es el inverso —alguien que lo saltó y después volvió
-- a verlo completo cuenta como adoptado, no como saltado.
--
-- NO se backfillea a los alumnos ya matriculados: el objetivo del frente es
-- justamente que los alumnos actuales, que son los que no encuentran las
-- secciones, lo vean la próxima vez que entren. Sí se marca al staff (ops y
-- admin), igual que hizo 0014 con el onboarding: el tour es contenido de
-- alumno y el panel admin no lo necesita.
--
-- RLS: no se tocan políticas. `profiles_update_own` (0007, reescrita en 0079)
-- ya permite que cada persona actualice su propia fila, y la ruta
-- `POST /api/classroom/tour` escribe con el cliente del usuario —nunca con
-- service_role— justamente para quedar debajo de esa política.
--
-- NO aplicada a producción todavía.
--
-- Idempotente: add column if not exists + create index if not exists.
-- =============================================================================

alter table public.profiles
  add column if not exists tour_completed_at timestamptz,
  add column if not exists tour_outcome text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_tour_outcome_chk'
  ) then
    alter table public.profiles
      add constraint profiles_tour_outcome_chk
      check (tour_outcome is null or tour_outcome in ('completed', 'skipped'));
  end if;
end $$;

-- El dashboard del programa pregunta "¿este alumno ya vio el tour?" en cada
-- carga. Índice parcial sobre los pendientes, igual que
-- profiles_onboarding_pending_idx (0014): la fila se busca por id (PK), el
-- índice sirve para el reporte de adopción ("cuántos faltan").
create index if not exists profiles_tour_pending_idx
  on public.profiles (id)
  where tour_completed_at is null;

update public.profiles
  set tour_completed_at = now(),
      tour_outcome = 'skipped'
  where system_role in ('ops', 'admin')
    and tour_completed_at is null;
