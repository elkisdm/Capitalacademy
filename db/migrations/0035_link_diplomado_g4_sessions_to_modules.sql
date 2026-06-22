-- =============================================================================
-- Capital Academy — Migración 0035: vincular las 24 sesiones del Diplomado IV
-- a sus módulos (Teórico / Práctico).
--
-- El seed 0022 insertó las sesiones del calendario con module_id NULL, así que
-- los módulos del classroom mostraban "0 lecciones" aunque el calendario tuviera
-- las 24 clases. Este backfill las asocia según los 4 cursos integrados del doc
-- canónico (docs/marketing/diplomado-4ta-gen-datos.md):
--   · Cursos I + III (mercado, finanzas, crédito, legal, IA, tributario, marca)
--     → Módulo Teórico  (c0000000-...-201)
--   · Cursos II + IV + experienciales (metodología comercial, cierre, role play,
--     challenge day, autoliderazgo, ceremonia) → Módulo Práctico (c0000000-...-202)
--
-- Se vincula por ID fijo de sesión (e0000000-...-0001..0024 del seed 0022), no por
-- título: "Challenge Day" y "Evaluación Role Play Final" se repiten.
--
-- Idempotente: UPDATE por id; correr de nuevo no cambia nada.
-- =============================================================================

-- Módulo Teórico (8): Educación Financiera, Dominio de crédito, Panorama mercado,
-- Estrategias y perfiles, IA aplicada, Legal, Tributario, Marca Personal.
update public.class_sessions
set module_id = 'c0000000-0000-0000-0000-000000000201'
where id in (
  'e0000000-0000-0000-0000-000000000003',
  'e0000000-0000-0000-0000-000000000004',
  'e0000000-0000-0000-0000-000000000007',
  'e0000000-0000-0000-0000-000000000009',
  'e0000000-0000-0000-0000-000000000010',
  'e0000000-0000-0000-0000-000000000015',
  'e0000000-0000-0000-0000-000000000019',
  'e0000000-0000-0000-0000-000000000022'
);

-- Módulo Práctico (16): apertura, integración, diagnóstico, challenge day (×3),
-- role play (×3 incl. finales), autoliderazgo, objeciones, proyección/embudo,
-- oportunidad/cierre, seguimiento, manejo comercial, ceremonia.
update public.class_sessions
set module_id = 'c0000000-0000-0000-0000-000000000202'
where id in (
  'e0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000005',
  'e0000000-0000-0000-0000-000000000006',
  'e0000000-0000-0000-0000-000000000008',
  'e0000000-0000-0000-0000-000000000011',
  'e0000000-0000-0000-0000-000000000012',
  'e0000000-0000-0000-0000-000000000013',
  'e0000000-0000-0000-0000-000000000014',
  'e0000000-0000-0000-0000-000000000016',
  'e0000000-0000-0000-0000-000000000017',
  'e0000000-0000-0000-0000-000000000018',
  'e0000000-0000-0000-0000-000000000020',
  'e0000000-0000-0000-0000-000000000021',
  'e0000000-0000-0000-0000-000000000023',
  'e0000000-0000-0000-0000-000000000024'
);
