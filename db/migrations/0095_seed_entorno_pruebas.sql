-- =============================================================================
-- Capital Academy — Siembra del "Entorno de Pruebas" (sandbox interno).
--
-- Motivación: probar en la G4 tiene efectos reales — los recordatorios de
-- clase y el aviso de "grabación disponible" se envían a TODAS las matrículas
-- activas de la cohorte donde se crea la clase o lección. Este tenant existe
-- para experimentar con la plataforma completa (clases en vivo, lecciones,
-- Mux, correos) con una audiencia 100% interna: todo correo automático que
-- dispare una prueba llega solo a quienes están matriculados acá.
--
-- Crea: programa SANDBOX + 1 módulo + cohorte activa + la matrícula de Elkis
-- (los correos de prueba le llegan a él mismo). Más cuentas internas se
-- matriculan por el admin como en cualquier cohorte.
--
-- El programa no tiene checkout, landing ni entrada en lib/programs/registry.ts
-- (cae a DEFAULT_BRAND): no es alcanzable desde ningún flujo público.
--
-- Idempotente: UUIDs fijos + ON CONFLICT DO NOTHING. Re-correr no duplica.
-- Convención de UUIDs (continúa 0022/0043/0049): a=programa, b=cohorte,
-- c=módulo, rango de entorno 05xx.
--
-- Reversa (si el sandbox estorba): borrar en orden inverso las filas por estos
-- mismos UUIDs; las clases/lecciones creadas encima caen por FK o se borran
-- desde el admin primero.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Programa — interno, sin checkout ni pricing.
-- ----------------------------------------------------------------------------
insert into public.programs (id, code, name, description, total_modules, is_active)
values (
  'a0000000-0000-0000-0000-000000000005',
  'SANDBOX',
  'Entorno de Pruebas',
  'Entorno interno para probar la plataforma sin afectar a alumnos reales. Todo correo automático que dispare una prueba llega solo a las cuentas internas matriculadas en su cohorte.',
  1,
  true
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Módulo único — contenedor para crear lecciones de prueba desde el admin.
-- ----------------------------------------------------------------------------
insert into public.program_modules (id, program_id, position, code, title, slug, description, weight)
values (
  'c0000000-0000-0000-0000-000000000501',
  'a0000000-0000-0000-0000-000000000005',
  1,
  'SBX-M1',
  'Módulo de pruebas',
  'modulo-de-pruebas',
  'Lecciones y material de prueba. Nada de lo que vive acá es contenido real.',
  100.0
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Cohorte — activa y de larga vida, para que la ventana de fechas nunca
--    sea el motivo de un falso negativo en una prueba.
-- ----------------------------------------------------------------------------
insert into public.cohorts (id, program_id, code, name, slug, start_date, end_date, status)
values (
  'b0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000005',
  'SBX',
  'Sandbox — Pruebas internas',
  'sandbox',
  '2026-08-12',
  '2027-12-31',
  'active'
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. Matrícula de Elkis (perfil admin existente): destinatario de los correos
--    que generen las pruebas. status 'active' directo — no pasa por invitación.
-- ----------------------------------------------------------------------------
insert into public.enrollments (cohort_id, student_id, status)
values (
  'b0000000-0000-0000-0000-000000000005',
  '900823a1-e5e3-4721-b6aa-70ba791928b4', -- edaza@capitalinteligente.cl
  'active'
)
on conflict (cohort_id, student_id) do nothing;
