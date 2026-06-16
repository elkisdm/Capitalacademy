-- =============================================================================
-- Capital Academy — Siembra del entorno del Diplomado Ejecutivo en Ventas y
-- Asesoría de Inversión Inmobiliaria · IV Generación (Junio 2026).
--
-- ADR: docs/adr/0008-entorno-diplomado-y-calendario-de-sesiones.md
--
-- Crea: programa + 2 módulos (Teórico/Práctico) + catálogo de docentes
-- (instructors) + columna class_sessions.teacher_id + cohorte G4 + las ~24
-- sesiones del calendario (track general: miércoles online / sábados presencial).
--
-- NO incluye matrículas ni invitaciones (eso corre por script en Fase 3).
-- NO incluye el calendario diferenciado de los martes ni la etiqueta
-- "Capital Inteligente" (Fase 2, feature aparte).
--
-- Idempotente: UUIDs fijos + ON CONFLICT DO NOTHING. Re-correr no duplica.
-- Zona horaria: offset de Santiago explícito. DST 2026 inicia 6-sep (−04 → −03):
-- sesiones ≤ 5-sep usan −04; ≥ 6-sep usan −03 (ceremonia 18-sep).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 0. DDL — catálogo de docentes + teacher por sesión
-- ----------------------------------------------------------------------------
create table if not exists public.instructors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text unique,
  photo_url text,
  bio text,
  profile_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.class_sessions
  add column if not exists teacher_id uuid references public.instructors(id) on delete set null,
  add column if not exists title text;

create index if not exists class_sessions_teacher_idx
  on public.class_sessions(teacher_id) where teacher_id is not null;

alter table public.instructors enable row level security;

-- Catálogo de docentes: lectura para autenticados, escritura para staff.
drop policy if exists instructors_authenticated_select on public.instructors;
create policy instructors_authenticated_select on public.instructors
  for select using (auth.uid() is not null);

drop policy if exists instructors_staff_write on public.instructors;
create policy instructors_staff_write on public.instructors
  for all using (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('ops', 'admin', 'teacher'))
  );

-- ----------------------------------------------------------------------------
-- 1. Programa
-- ----------------------------------------------------------------------------
insert into public.programs (id, code, name, description, total_modules, passing_grade, min_attendance_pct, is_active)
values (
  'a0000000-0000-0000-0000-000000000002',
  'DIP-VENTAS',
  'Diplomado Ejecutivo en Ventas y Asesoría de Inversión Inmobiliaria',
  'Programa híbrido (online + presencial) que integra análisis financiero, metodología comercial estructurada y aplicación real en cartera activa.',
  2, 4.0, 85, true
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Módulos (alineados al landing: 2 módulos)
-- ----------------------------------------------------------------------------
insert into public.program_modules (id, program_id, position, code, title, slug, description, weight)
values
  ('c0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000002', 1, 'DIP-M1', 'Módulo Teórico',  'modulo-teorico',  'Mercado, educación financiera, lectura de inversión y fundamentos de la asesoría.', 50.0),
  ('c0000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000002', 2, 'DIP-M2', 'Módulo Práctico', 'modulo-practico', 'Metodología comercial, diagnóstico, propuesta, cierre y aplicación en cartera activa.', 50.0)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Catálogo de docentes (instructors)
--    profile_id solo para quien ya es usuario de la plataforma (Elkis = admin).
-- ----------------------------------------------------------------------------
insert into public.instructors (id, full_name, email, profile_id)
values
  ('d0000000-0000-0000-0000-000000000001', 'Paola Vicuña',       null, null),
  ('d0000000-0000-0000-0000-000000000002', 'Milena Zapata',      null, null),
  ('d0000000-0000-0000-0000-000000000003', 'Marjorie Arias',     null, null),
  ('d0000000-0000-0000-0000-000000000004', 'Ivis García',        null, null),
  ('d0000000-0000-0000-0000-000000000005', 'Mariana Samarotto',  null, null),
  ('d0000000-0000-0000-0000-000000000006', 'Leandro Ríos',       null, null),
  ('d0000000-0000-0000-0000-000000000007', 'Elkis Daza',         'edaza@capitalinteligente.cl', '900823a1-e5e3-4721-b6aa-70ba791928b4'),
  ('d0000000-0000-0000-0000-000000000008', 'Francisco Reyes',    null, null),
  ('d0000000-0000-0000-0000-000000000009', 'Raimundo Díaz',      null, null),
  ('d0000000-0000-0000-0000-000000000010', 'Camilo Olivero',     null, null),
  ('d0000000-0000-0000-0000-000000000011', 'Clemente Fontecilla',null, null),
  ('d0000000-0000-0000-0000-000000000012', 'Carlos Cereceda',    null, null),
  ('d0000000-0000-0000-0000-000000000013', 'Katherine Lettich',  null, null),
  ('d0000000-0000-0000-0000-000000000014', 'Mariangel Guerra',   null, null)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. Cohorte IV Generación
-- ----------------------------------------------------------------------------
insert into public.cohorts (id, program_id, code, name, slug, start_date, end_date, status)
values (
  'b0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000002',
  'G4',
  'IV Generación — Junio 2026',
  'diplomado-iv-generacion',
  '2026-06-20', '2026-09-18', 'active'
)
on conflict (id) do nothing;

-- Backfill idempotente de slugs (cubre el caso de haber aplicado una versión
-- previa de esta migración sin slug: el ON CONFLICT DO NOTHING no los habría
-- actualizado). Solo escribe si están en null.
update public.cohorts set slug = 'diplomado-iv-generacion'
  where id = 'b0000000-0000-0000-0000-000000000002' and slug is null;
update public.program_modules set slug = 'modulo-teorico'
  where id = 'c0000000-0000-0000-0000-000000000201' and slug is null;
update public.program_modules set slug = 'modulo-practico'
  where id = 'c0000000-0000-0000-0000-000000000202' and slug is null;

-- ----------------------------------------------------------------------------
-- 5. Sesiones del calendario (track general). modality: live_in_person | live_online
--    Cohorte b...002. teacher_id → instructors. UUIDs fijos e...0001..0024.
-- ----------------------------------------------------------------------------
insert into public.class_sessions (id, cohort_id, title, starts_at, ends_at, modality, teacher_id, status)
values
  -- JUNIO
  ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Apertura, autoridad y conexión',                       '2026-06-20 09:30:00-04', '2026-06-20 13:30:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000001', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Actividad de integración',                             '2026-06-20 14:30:00-04', '2026-06-20 16:30:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000001', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'Educación Financiera',                                 '2026-06-24 19:00:00-04', '2026-06-24 21:00:00-04', 'live_online',    'd0000000-0000-0000-0000-000000000003', 'scheduled'),
  -- JULIO
  ('e0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'Dominio de crédito: buenas prácticas y alertas',       '2026-07-01 19:00:00-04', '2026-07-01 21:00:00-04', 'live_online',    'd0000000-0000-0000-0000-000000000004', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002', 'Diagnóstico, propuesta y criterio asesor',             '2026-07-04 09:30:00-04', '2026-07-04 13:30:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000001', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000002', 'Challenge Day',                                        '2026-07-04 14:30:00-04', '2026-07-04 16:30:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000001', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000002', 'Panorama del mercado inmobiliario en Chile',           '2026-07-08 19:00:00-04', '2026-07-08 21:00:00-04', 'live_online',    'd0000000-0000-0000-0000-000000000005', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000002', 'Evaluación role play',                                 '2026-07-11 09:30:00-04', '2026-07-11 13:30:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000001', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000002', 'Estrategias y perfiles de inversión',                  '2026-07-15 19:00:00-04', '2026-07-15 21:00:00-04', 'live_online',    'd0000000-0000-0000-0000-000000000006', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000002', 'IA aplicada a la industria inmobiliaria',              '2026-07-22 19:00:00-04', '2026-07-22 21:00:00-04', 'live_online',    'd0000000-0000-0000-0000-000000000007', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000002', 'Autoliderazgo e inteligencia emocional para sostener resultados', '2026-07-25 09:30:00-04', '2026-07-25 13:30:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000002', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000012', 'b0000000-0000-0000-0000-000000000002', 'Objeciones del proceso de venta',                      '2026-07-29 19:00:00-04', '2026-07-29 21:00:00-04', 'live_online',    'd0000000-0000-0000-0000-000000000008', 'scheduled'),
  -- AGOSTO
  ('e0000000-0000-0000-0000-000000000013', 'b0000000-0000-0000-0000-000000000002', 'Proyección, oferta de valor y embudo',                 '2026-08-01 09:30:00-04', '2026-08-01 13:30:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000001', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000014', 'b0000000-0000-0000-0000-000000000002', 'Challenge Day',                                        '2026-08-01 14:30:00-04', '2026-08-01 16:30:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000001', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000015', 'b0000000-0000-0000-0000-000000000002', 'Legal inmobiliario: promesas, escrituras y responsabilidades', '2026-08-05 19:00:00-04', '2026-08-05 21:00:00-04', 'live_online',    'd0000000-0000-0000-0000-000000000009', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000016', 'b0000000-0000-0000-0000-000000000002', 'Oportunidad, cierre y continuidad',                    '2026-08-08 09:30:00-04', '2026-08-08 13:30:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000010', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000017', 'b0000000-0000-0000-0000-000000000002', 'Challenge Day',                                        '2026-08-08 14:30:00-04', '2026-08-08 16:30:00-04', 'live_in_person', 'd0000000-0000-0000-0000-000000000010', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000018', 'b0000000-0000-0000-0000-000000000002', 'Seguimiento inteligente: de la conversación a la reserva', '2026-08-12 19:00:00-04', '2026-08-12 21:00:00-04', 'live_online',    'd0000000-0000-0000-0000-000000000011', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000019', 'b0000000-0000-0000-0000-000000000002', 'Aspectos tributarios de la inversión inmobiliaria',    '2026-08-19 19:00:00-04', '2026-08-19 21:00:00-04', 'live_online',    'd0000000-0000-0000-0000-000000000012', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000002', 'Manejo comercial avanzado: la mentalidad del cierre efectivo', '2026-08-26 19:00:00-04', '2026-08-26 21:00:00-04', 'live_online',    'd0000000-0000-0000-0000-000000000013', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000021', 'b0000000-0000-0000-0000-000000000002', 'Evaluación Role Play Final (grupo 1 a 15)',            '2026-08-29 09:30:00-04', '2026-08-29 13:30:00-04', 'live_in_person', null,                                   'scheduled'),
  -- SEPTIEMBRE  (DST inicia 6-sep: sesiones ≥ 6-sep usan −03)
  ('e0000000-0000-0000-0000-000000000022', 'b0000000-0000-0000-0000-000000000002', 'Marca Personal',                                       '2026-09-02 19:00:00-04', '2026-09-02 21:00:00-04', 'live_online',    'd0000000-0000-0000-0000-000000000014', 'scheduled'),
  ('e0000000-0000-0000-0000-000000000023', 'b0000000-0000-0000-0000-000000000002', 'Evaluación Role Play Final (grupo 1 a 15)',            '2026-09-05 09:30:00-04', '2026-09-05 13:30:00-04', 'live_in_person', null,                                   'scheduled'),
  ('e0000000-0000-0000-0000-000000000024', 'b0000000-0000-0000-0000-000000000002', 'Ceremonia de Cierre y entrega de diplomas',            '2026-09-18 19:30:00-03', '2026-09-18 21:00:00-03', 'live_in_person', null,                                   'scheduled')
on conflict (id) do nothing;
