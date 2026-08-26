-- =============================================================================
-- Capital Academy — Etiqueta de cuenta interna (staff / test) en profiles.
--
-- ADR: docs/adr/0037-cuentas-internas-y-alerta-recurrente.md
-- Spec: docs/specs/cuentas-internas-y-alerta-recurrente.md
--
-- Problema: no existe forma de distinguir un alumno REAL de una cuenta del
-- equipo o de QA. Hoy esa basura entra en las métricas de cada cohorte y en
-- los correos masivos: Workshop 10/280 matrículas, Diplomado G4 3/24,
-- Ciclo CI 1/243. La cuenta `Administrador` incluso figura con inasistencias.
--
-- Por qué una columna nueva y no una heurística: ninguna señal existente
-- alcanza. `system_role` solo marca admin/ops — dos personas del equipo usan
-- cuentas Gmail con system_role='user' (elkisdm@, vicunapaola1@). El dominio
-- tampoco sirve: muchas alumnas REALES son @capitalinteligente.cl (segmento
-- capital_inteligente, migración 0024). Tiene que ser explícito.
--
-- Por qué en profiles y no en enrollments: la condición es de la persona, no
-- de una matrícula puntual, y hoy no hay ningún caso de staff-en-una-cohorte
-- y alumno-real-en-otra. Si aparece, se agrega un override en enrollments sin
-- migrar nada de esto.
--
-- IMPORTANTE — la etiqueta NO quita acceso. Una cuenta 'staff' sigue entrando
-- al aula, al quiz y a la sala; solo desaparece de correos y de reportes. Los
-- consumidores de enrollments que resuelven permisos NO la miran.
--
-- Valores:
--   'real'  (default) — alumno de verdad. Cuenta en todo.
--   'staff' — persona del equipo con cuenta en la plataforma.
--   'test'  — cuenta de QA / prueba. Borrable.
--
-- Idempotente: add column if not exists + updates por email.
-- =============================================================================

alter table public.profiles
  add column if not exists account_type text not null default 'real';

alter table public.profiles
  drop constraint if exists profiles_account_type_check;
alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('real', 'staff', 'test'));

comment on column public.profiles.account_type is
  'Naturaleza de la cuenta (ADR-0037). real=alumno de verdad; staff=persona del equipo; test=cuenta de QA. Las no-real quedan FUERA de comunicaciones y métricas, pero CONSERVAN todo su acceso. Lector: lib/profiles/account-type.ts.';

-- Índice parcial: las consultas filtran por "es real" y las no-real son un
-- puñado. El índice solo indexa las excepciones.
create index if not exists profiles_account_type_idx
  on public.profiles(account_type)
  where account_type <> 'real';

-- ----------------------------------------------------------------------------
-- Backfill 1: cuentas del equipo (confirmadas con Elkis el 2026-08-26).
-- Se enumeran por email a propósito: un patrón por dominio marcaría alumnas
-- reales de Capital Inteligente.
-- Paola Vicuña y Elkis tienen DOS cuentas cada uno; ambas se marcan.
-- ----------------------------------------------------------------------------
update public.profiles set account_type = 'staff'
where email in (
  'admin@capitalacademy.cl',          -- cuenta de sistema
  'edaza@capitalinteligente.cl',      -- Elkis Daza
  'elkisdm@gmail.com',                -- Elkis (cuenta personal)
  'academia@capitalinteligente.cl',   -- Camila González (ops)
  'camilagonzalezm10@gmail.com',      -- Camila González Márquez
  'mpgonzalezf@capitalinteligente.cl',-- María Paz González
  'pvicuna@capitalinteligente.cl',    -- Paola Vicuña (ops)
  'vicunapaola1@gmail.com'            -- Paola Vicuña (cuenta personal)
);

-- ----------------------------------------------------------------------------
-- Backfill 2 + borrado: cuentas de QA.
--
-- Se enumeran una por una en vez de usar LIKE '%@test.local': un patrón puede
-- barrer una cuenta real que nadie revisó. Estas 11 se inventariaron el
-- 2026-08-26 y están VACÍAS de datos académicos (0 asistencias, 0 entregas,
-- 0 notas, 0 comentarios); lo único que cuelga son 9 cohort_roles,
-- 6 enrollments y 3 invitation_log, todo de las mismas pruebas.
--
-- Se marcan ANTES de borrar para que, si el borrado se revierte o falla a
-- mitad, las que sobrevivan queden igualmente fuera de métricas y correos.
--
-- OJO: esto NO borra auth.users — public.profiles no tiene FK hacia ahí.
-- Las 11 cuentas de login se borran con scripts/borrar-cuentas-qa.mjs.
-- Sin ese segundo paso quedan cuentas capaces de autenticarse sin perfil.
-- ----------------------------------------------------------------------------
create temporary table if not exists _qa_accounts (email text primary key);
insert into _qa_accounts (email) values
  ('ana.validate.qa@test.local'),
  ('carlos.validate.qa@test.local'),
  ('diego.validate.qa@test.local'),
  ('maria.import.qa@test.local'),
  ('pedro.import.qa@test.local'),
  ('sofia.import.qa@test.local'),
  ('onboarding.test@ejemplo.cl'),
  ('qa.audit3.unique@test.local'),
  ('qa.audit4.unique@test.local'),
  ('qa.auditor.unique@test.local'),
  ('reg.test.two.qa@test.local')
on conflict (email) do nothing;

update public.profiles set account_type = 'test'
where email in (select email from _qa_accounts);

-- Dependencias primero, explícitas: no se confía en el ON DELETE de cada FK.
delete from public.cohort_roles
  where user_id in (select id from public.profiles where email in (select email from _qa_accounts))
     or granted_by in (select id from public.profiles where email in (select email from _qa_accounts));

delete from public.invitation_log
  where user_id in (select id from public.profiles where email in (select email from _qa_accounts))
     or sent_by in (select id from public.profiles where email in (select email from _qa_accounts));

delete from public.enrollments
  where student_id in (select id from public.profiles where email in (select email from _qa_accounts));

delete from public.profiles
  where email in (select email from _qa_accounts);

drop table if exists _qa_accounts;
