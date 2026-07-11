-- =============================================================================
-- Capital Academy — Corrige fuga cross-tenant del roster de instructores.
--
-- Hallazgo (megaauditoría v1): la policy `instructors_authenticated_select`
-- (creada en 0022_seed_diplomado_g4.sql:44-46) usa `auth.uid() is not null`,
-- es decir CUALQUIER usuario autenticado puede leer full_name/email/bio/
-- profile_id de instructores de TODOS los programas vía anon key — no solo
-- del programa en el que está matriculado. La app solo consume
-- id/full_name/photo_url (ver lib/classroom/queries.ts), pero la tabla base
-- expone columnas adicionales (email, bio) sin ese scoping.
--
-- Fix: reemplaza la policy por una scoped por programa. Un instructor solo es
-- visible para quien tiene `has_program_access()` (0044/0057: platform staff,
-- alumno matriculado active/completed, o docente/asistente de la cohorte) en
-- algún programa donde ese instructor dicta sesiones (class_sessions.teacher_id
-- -> cohorts.program_id), más staff transversal explícito.
--
-- Aplicar con: pnpm supabase migration up (o el flujo de migraciones del
-- proyecto) y regenerar types después (`pnpm supabase gen types` / script
-- equivalente) — esta migración NO se aplica automáticamente por este cambio.
-- =============================================================================

drop policy if exists instructors_authenticated_select on public.instructors;

create policy instructors_program_scoped_select on public.instructors
  for select using (
    public.is_platform_staff()
    or exists (
      select 1 from public.class_sessions cs
      join public.cohorts c on c.id = cs.cohort_id
      where cs.teacher_id = instructors.id
        and public.has_program_access(c.program_id)
    )
  );
