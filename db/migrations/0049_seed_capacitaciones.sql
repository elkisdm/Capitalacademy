-- =============================================================================
-- Capital Academy — Siembra del entorno "Ciclo de Capacitación Comercial CI"
-- (capacitación comercial interna, GRATUITA) · I Ciclo · Jul–Ago 2026.
--
-- ADR: docs/adr/0012-entorno-capacitaciones-ci.md
--
-- Crea: programa + 5 módulos (una sesión = un módulo) + 5 docentes nuevos +
-- cohorte G1 + las 5 sesiones del calendario (5 martes presenciales, 10:00–12:00,
-- Auditorio). Datos canónicos del material oficial "Ciclo de Capacitación
-- Comercial CI" (reunión de avances 1-jul-2026; estructura entregada 6-jul-2026).
--
-- Ciclo GRATUITO e interno (dirigido a la fuerza de ventas de Capital Inteligente):
-- sin checkout ni pricing. Las clases presenciales se graban y quedan como material
-- de consulta. Cupo por sesión máx 40 (notas de reunión): NO se modela aquí
-- (`cohorts` no tiene columna de capacidad); el tope se aplica en la inscripción.
--
-- NO incluye matrículas ni invitaciones: corren por script/inscripción cuando se
-- confirme el listado de asistentes (fase aparte, como el Diplomado/Liderazgo).
-- NO incluye evaluaciones/quizzes: el ciclo es formativo, no certifica.
--
-- Idempotente: UUIDs fijos + ON CONFLICT DO NOTHING. Re-correr no duplica.
-- Zona horaria: jul–ago 2026 es pre-DST en Santiago (DST inicia 6-sep) → −04.
--
-- Convención de UUIDs (continúa 0022/0043): a=programa, b=cohorte, c=módulo,
-- e=sesión usan el rango de entorno 04xx; d=instructor sigue la secuencia global
-- (016–020, tras Diego = 015 en 0043).
--
-- Aplicada a prod el 2026-07-06 (migración 20260706204014), tras revisión.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Programa — gratuito, 5 sesiones. total_modules = 5. Sin checkout.
-- ----------------------------------------------------------------------------
insert into public.programs (id, code, name, description, total_modules, is_active)
values (
  'a0000000-0000-0000-0000-000000000004',
  'CAP-CI',
  'Ciclo de Capacitación Comercial CI',
  'Sesiones presenciales para fortalecer el desempeño comercial de la fuerza de ventas de Capital Inteligente. Una línea complementaria de capacitación interna que conecta a los asesores con las áreas, herramientas y procesos que respaldan su gestión diaria. Las clases se graban y quedan disponibles como material de consulta.',
  5,
  true
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Módulos — una sesión = un módulo (5 sesiones del calendario).
--    module_id es requerido por la ruta de repetición/grabación Mux: se siembra
--    desde el inicio (sin backfill tipo 0037).
-- ----------------------------------------------------------------------------
insert into public.program_modules (id, program_id, position, code, title, slug, description, weight)
values
  ('c0000000-0000-0000-0000-000000000401', 'a0000000-0000-0000-0000-000000000004', 1, 'CAP-S1', 'Rentix: administración de propiedades y continuidad de la inversión', 'rentix-administracion-propiedades', 'Uso de Rentix para la administración de propiedades y la continuidad de la inversión del cliente.', 20.0),
  ('c0000000-0000-0000-0000-000000000402', 'a0000000-0000-0000-0000-000000000004', 2, 'CAP-S2', 'Soporte comercial: lectura de resumen de proyecto y uso de Brekto', 'soporte-comercial-brekto',        'Lectura del resumen de proyecto y uso de Brekto como soporte a la gestión comercial.', 20.0),
  ('c0000000-0000-0000-0000-000000000403', 'a0000000-0000-0000-0000-000000000004', 3, 'CAP-S3', 'Manejo comercial: criterio, conducción y gestión en la venta',      'manejo-comercial-venta',          'Criterio comercial, conducción del cliente y gestión efectiva del proceso de venta.', 20.0),
  ('c0000000-0000-0000-0000-000000000404', 'a0000000-0000-0000-0000-000000000004', 4, 'CAP-S4', 'CRM: uso estratégico para la gestión comercial',                   'crm-gestion-comercial',           'Uso estratégico del CRM para ordenar y potenciar la gestión comercial.', 20.0),
  ('c0000000-0000-0000-0000-000000000405', 'a0000000-0000-0000-0000-000000000004', 5, 'CAP-S5', 'UGC y experiencia del cliente: cómo acompañar mejor el proceso comercial', 'ugc-experiencia-cliente',      'Contenido generado por el usuario (UGC) y experiencia del cliente para acompañar mejor el proceso comercial.', 20.0)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Docentes nuevos (expositores internos). Secuencia global 016–020.
--    email/bio null: no entregados en el material; el admin los completa.
-- ----------------------------------------------------------------------------
insert into public.instructors (id, full_name, email, bio, profile_id)
values
  ('d0000000-0000-0000-0000-000000000016', 'Jose Soto',        null, null, null),
  ('d0000000-0000-0000-0000-000000000017', 'Areli Marisio',    null, null, null),
  ('d0000000-0000-0000-0000-000000000018', 'Francisco Mendoza', null, null, null),
  ('d0000000-0000-0000-0000-000000000019', 'Martín Guzmán',    null, null, null),
  ('d0000000-0000-0000-0000-000000000020', 'Ivis García',      null, null, null)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. Cohorte I Ciclo — Jul–Ago 2026. status 'active' (arranca el 7-jul).
--    El cupo (40) se aplica en la inscripción, no acá.
-- ----------------------------------------------------------------------------
insert into public.cohorts (id, program_id, code, name, slug, start_date, end_date, status)
values (
  'b0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000004',
  'G1',
  'I Ciclo — 2026',
  'capacitaciones-i-ciclo',
  '2026-07-07', '2026-08-18',
  'active'
)
on conflict (id) do nothing;

-- Backfill idempotente de slug (por si una versión previa se aplicó sin slug).
update public.cohorts set slug = 'capacitaciones-i-ciclo'
  where id = 'b0000000-0000-0000-0000-000000000004' and slug is null;

-- ----------------------------------------------------------------------------
-- 5. Sesiones del calendario — 5 martes presenciales 10:00–12:00 (−04), Auditorio.
--    modality 'live_in_person'. module_id apunta al módulo homónimo de cada sesión
--    (obligatorio para la repetición/grabación Mux). teacher_id = expositor.
-- ----------------------------------------------------------------------------
insert into public.class_sessions (id, cohort_id, module_id, title, starts_at, ends_at, modality, teacher_id, status)
values
  ('e0000000-0000-0000-0000-000000000401', 'b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000401', 'Rentix: administración de propiedades y continuidad de la inversión', '2026-07-07 10:00:00-04', '2026-07-07 12:00:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000016', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000402', 'b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000402', 'Soporte comercial: lectura de resumen de proyecto y uso de Brekto', '2026-07-21 10:00:00-04', '2026-07-21 12:00:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000017', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000403', 'b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000403', 'Manejo comercial: criterio, conducción y gestión en la venta', '2026-07-28 10:00:00-04', '2026-07-28 12:00:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000018', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000404', 'b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000404', 'CRM: uso estratégico para la gestión comercial', '2026-08-11 10:00:00-04', '2026-08-11 12:00:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000019', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000405', 'b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000405', 'UGC y experiencia del cliente: cómo acompañar mejor el proceso comercial', '2026-08-18 10:00:00-04', '2026-08-18 12:00:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000020', 'scheduled')
on conflict (id) do nothing;
