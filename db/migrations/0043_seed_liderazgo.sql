-- =============================================================================
-- Capital Academy — Siembra del entorno del Programa de Liderazgo
-- (Sistema de Liderazgo Comercial Inmobiliario) · I Generación · Julio 2026.
--
-- ADR: docs/adr/0009-entorno-liderazgo.md
--
-- Crea: programa + 4 módulos (una jornada = un módulo) + docente nuevo
-- (Diego de La Prida) + cohorte G1 + las 4 sesiones del calendario
-- (4 viernes presenciales, 15:00–19:00). Paola Vicuña y Milena Zapata YA
-- existen en instructors (seed 0022): se reutilizan, no se duplican.
--
-- NO incluye matrículas ni invitaciones: corren por script una vez Capital
-- Academy entregue el listado de alumnos (fase aparte, como el Diplomado).
-- NO incluye evaluaciones/quizzes: se crean por el admin (config 24h / 1 intento
-- se define por evaluación, no por seed).
--
-- Idempotente: UUIDs fijos + ON CONFLICT DO NOTHING. Re-correr no duplica.
-- Zona horaria: julio 2026 es pre-DST en Santiago (DST inicia 6-sep) → −04.
--
-- Convención de UUIDs (continúa 0022): a=programa, b=cohorte, c=módulo,
-- d=instructor, e=sesión. Liderazgo usa el rango 03xx.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Programa
--    Nombre alineado al checkout/registry existente (LIDERAZGO_SUBJECT) para no
--    romper el enlace pago→matrícula. El brochure usa el título de marketing
--    "Sistema de Liderazgo Comercial Inmobiliario" (ver description).
-- ----------------------------------------------------------------------------
insert into public.programs (id, code, name, description, total_modules, passing_grade, min_attendance_pct, is_active)
values (
  'a0000000-0000-0000-0000-000000000003',
  'LID-COMERCIAL',
  'Programa de Liderazgo y Gestión de Equipos Comerciales',
  'Sistema de Liderazgo Comercial Inmobiliario: programa ejecutivo presencial para líderes comerciales inmobiliarios que necesitan ordenar su gestión, desarrollar equipos y sostener resultados con sistema. 4 jornadas aplicadas.',
  4, 4.0, 75, true
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Módulos — una jornada = un módulo (malla aplicada en 4 jornadas)
-- ----------------------------------------------------------------------------
insert into public.program_modules (id, program_id, position, code, title, slug, description, weight)
values
  ('c0000000-0000-0000-0000-000000000301', 'a0000000-0000-0000-0000-000000000003', 1, 'LID-J1', 'Atraer, integrar y activar talento comercial', 'jornada-1-atraer-talento',      'Perfil del asesor ideal, propuesta de valor para atraer talento, entrevista, criterios de selección y onboarding de las primeras semanas.', 25.0),
  ('c0000000-0000-0000-0000-000000000302', 'a0000000-0000-0000-0000-000000000003', 2, 'LID-J2', 'Gestionar desempeño y ordenar resultados',     'jornada-2-gestionar-desempeno', 'Metas de resultado y proceso, KPIs comerciales, seguimiento individual y grupal, planes de desarrollo comercial para el equipo.',           25.0),
  ('c0000000-0000-0000-0000-000000000303', 'a0000000-0000-0000-0000-000000000003', 3, 'LID-J3', 'Liderazgo personal, presión y sostenibilidad', 'jornada-3-liderazgo-personal',  'Autoliderazgo, foco comercial, gestión del tiempo y del estrés, inteligencia emocional, presión y delegación. Motivación y feedback efectivo.', 25.0),
  ('c0000000-0000-0000-0000-000000000304', 'a0000000-0000-0000-0000-000000000003', 4, 'LID-J4', 'Eje Aplicado — Proyecto de implementación',    'jornada-4-proyecto-implementacion', 'Taller práctico: presentación del diseño de un sistema propio de liderazgo y gestión comercial aplicable al equipo real, con feedback de los 3 docentes.', 25.0)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Docente nuevo (Diego de La Prida). Paola (d…0001) y Milena (d…0002) ya
--    existen desde el seed 0022 — no se reinsertan.
-- ----------------------------------------------------------------------------
insert into public.instructors (id, full_name, email, bio, profile_id)
values
  ('d0000000-0000-0000-0000-000000000015', 'Diego de La Prida', null,
   'Ejecutivo del sector inmobiliario, especializado en liderazgo comercial, desarrollo de negocios y estrategia de crecimiento. Business Owner & GM Real Estate en TOCTOC.', null)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. Cohorte I Generación — Julio 2026
-- ----------------------------------------------------------------------------
insert into public.cohorts (id, program_id, code, name, slug, start_date, end_date, status)
values (
  'b0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000003',
  'G1',
  'I Generación — Julio 2026',
  'liderazgo-i-generacion',
  '2026-07-10', '2026-07-31', 'active'
)
on conflict (id) do nothing;

-- Backfill idempotente de slugs (por si una versión previa se aplicó sin slug).
update public.cohorts set slug = 'liderazgo-i-generacion'
  where id = 'b0000000-0000-0000-0000-000000000003' and slug is null;

-- ----------------------------------------------------------------------------
-- 5. Sesiones del calendario — 4 viernes presenciales 15:00–19:00 (−04).
--    module_id apunta al módulo homónimo de cada jornada (obligatorio para la
--    repetición/grabación Mux). J4 sin docente único: feedback de los 3.
-- ----------------------------------------------------------------------------
insert into public.class_sessions (id, cohort_id, module_id, title, starts_at, ends_at, modality, teacher_id, status)
values
  ('e0000000-0000-0000-0000-000000000301', 'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000301', 'Atraer, integrar y activar talento comercial', '2026-07-10 15:00:00-04', '2026-07-10 19:00:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000002', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000302', 'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000302', 'Gestionar desempeño y ordenar resultados',     '2026-07-17 15:00:00-04', '2026-07-17 19:00:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000015', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000303', 'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000303', 'Liderazgo personal, presión y sostenibilidad', '2026-07-24 15:00:00-04', '2026-07-24 19:00:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000001', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000304', 'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000304', 'Eje Aplicado — Proyecto de implementación',    '2026-07-31 15:00:00-04', '2026-07-31 19:00:00-04', 'live_in_person', null,                                   'scheduled')
on conflict (id) do nothing;
