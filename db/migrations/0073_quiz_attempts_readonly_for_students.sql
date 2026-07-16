-- =============================================================================
-- Capital Academy — quiz_attempts: solo lectura para el alumno (fraude de
-- certificación · megaauditoría 2026-07-16, hallazgo C1)
--
-- BUG: `quiz_attempts_student_own` (0015_quiz_and_certificates.sql:129) era
-- `FOR ALL USING (enrollment_id in (...propias enrollments...))` SIN `WITH CHECK`.
-- En Postgres, una policy FOR ALL sin WITH CHECK reusa la expresión USING como
-- check de INSERT/UPDATE: el único requisito para escribir era que el
-- enrollment_id fuera propio. Como `authenticated` además tiene INSERT/UPDATE/
-- DELETE por las default privileges de Supabase y no hay trigger que lo frene,
-- un alumno podía hablarle directo a PostgREST y:
--   (a) insertar {passed:true, score_pct:100, completed_at:now()} y luego llamar
--       a POST /api/classroom/certificate/retry → diploma real, firmado y
--       verificable, sin rendir el examen;
--   (b) BORRAR sus intentos reprobados para resetear el contador de
--       `max_attempts` de /quiz/start:114 → intentos infinitos (viola RN-025).
--
-- FIX (dos capas independientes):
--   1. La policy del alumno pasa a FOR SELECT. El SELECT es necesario: lo usan
--      certificate/retry/route.ts:87 y certificado/page.tsx:61,121 con cliente
--      RLS-bound.
--   2. REVOKE de la escritura a authenticated/anon. Ningún flujo legítimo
--      escribe esta tabla con cliente RLS-bound: /quiz/{start,submit} y
--      /evaluation/{start,submit} usan service_role (createAdminClient), igual
--      que todas las rutas admin. service_role conserva sus grants y bypassa RLS.
--
-- Por qué REVOKE y NO un trigger (contraste con 0052_prevent_role_self_escalation,
-- que eligió trigger a propósito): allí `authenticated` SÍ necesitaba UPDATE
-- legítimo sobre profiles y un REVOKE lo habría roto. Aquí NINGUNA escritura
-- legítima llega como authenticated → el REVOKE es la herramienta correcta.
--
-- Patrón de referencia: `enrollments` ya hace esto bien (SELECT propio para el
-- alumno, INSERT/UPDATE/DELETE solo staff, policies por comando).
-- =============================================================================

-- ── 1. Policy del alumno: solo lectura ───────────────────────────────────────
drop policy if exists quiz_attempts_student_own on public.quiz_attempts;

create policy quiz_attempts_student_own on public.quiz_attempts
  for select using (
    enrollment_id in (
      select id from public.enrollments where student_id = auth.uid()
    )
  );

-- ── 2. Sin grants de escritura para los roles del navegador ──────────────────
-- (Los grants no vienen de una migración: son las DEFAULT PRIVILEGES de Supabase
--  aplicadas al CREATE TABLE de 0015. Revocarlos aquí es durable.)
revoke insert, update, delete, truncate on public.quiz_attempts from authenticated, anon;
