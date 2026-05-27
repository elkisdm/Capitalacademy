-- =============================================================================
-- Capital Academy — Seed data para desarrollo del módulo Classroom
-- Ejecutar DESPUÉS de 0001_init_core.sql y 0006_classroom.sql
-- NOTA: los IDs de auth.users deben coincidir con usuarios reales de Supabase.
--       Este seed crea perfiles y datos académicos de prueba.
-- =============================================================================

-- Programa de prueba
INSERT INTO public.programs (id, code, name, description, total_modules, passing_grade, min_attendance_pct)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'DEV',
  'Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria',
  'Programa insignia de Capital Academy. Formación ejecutiva para asesores, brokers y ejecutivos de sala de venta.',
  5,
  4.0,
  85
) ON CONFLICT (code) DO NOTHING;

-- Cohorte activa
INSERT INTO public.cohorts (id, program_id, code, name, start_date, end_date, status)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'DEV-4G',
  'Diplomado 4ª Generación — Junio 2026',
  '2026-06-15',
  '2026-12-15',
  'active'
) ON CONFLICT (program_id, code) DO NOTHING;

-- Módulo 1: Fundamentos
INSERT INTO public.program_modules (id, program_id, position, code, title, description, weight)
VALUES (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  1,
  'M01',
  'Fundamentos del Mercado Inmobiliario',
  'Contexto macroeconómico, ciclos del mercado, y panorama regulatorio.',
  20.00
) ON CONFLICT (program_id, code) DO NOTHING;

-- Módulo 2: Técnicas de venta
INSERT INTO public.program_modules (id, program_id, position, code, title, description, weight)
VALUES (
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000001',
  2,
  'M02',
  'Técnicas de Venta Consultiva',
  'Metodologías de venta, manejo de objeciones, y cierre efectivo.',
  25.00
) ON CONFLICT (program_id, code) DO NOTHING;

-- Módulo 3: Asesoría legal y tributaria
INSERT INTO public.program_modules (id, program_id, position, code, title, description, weight)
VALUES (
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000001',
  3,
  'M03',
  'Marco Legal y Tributario',
  'Aspectos legales de la compraventa, normativa tributaria aplicada.',
  20.00
) ON CONFLICT (program_id, code) DO NOTHING;

-- Módulo 4: Marketing y captación
INSERT INTO public.program_modules (id, program_id, position, code, title, description, weight)
VALUES (
  '00000000-0000-0000-0000-000000000104',
  '00000000-0000-0000-0000-000000000001',
  4,
  'M04',
  'Marketing Digital y Captación',
  'Estrategias de marketing digital, redes sociales, y generación de leads.',
  20.00
) ON CONFLICT (program_id, code) DO NOTHING;

-- Módulo 5: Proyecto final
INSERT INTO public.program_modules (id, program_id, position, code, title, description, weight)
VALUES (
  '00000000-0000-0000-0000-000000000105',
  '00000000-0000-0000-0000-000000000001',
  5,
  'M05',
  'Proyecto Integrador',
  'Aplicación práctica de todo lo aprendido en un caso real.',
  15.00
) ON CONFLICT (program_id, code) DO NOTHING;

-- Lecciones del Módulo 1
INSERT INTO public.lessons (id, module_id, position, title, description, kind, duration_minutes) VALUES
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000101', 1, 'Introducción al mercado inmobiliario chileno', 'Panorama actual, principales actores y tendencias.', 'recorded', 45),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000101', 2, 'Ciclos del mercado y variables macroeconómicas', 'Cómo interpretar indicadores económicos aplicados al sector.', 'recorded', 50),
  ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000101', 3, 'Marco regulatorio: DFL2, IVA, y subsidios', 'Normativa que todo asesor debe conocer.', 'recorded', 55),
  ('00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000000101', 4, 'Tipos de propiedades y segmentación', 'Departamentos, casas, comercial, industrial — segmentos y sus particularidades.', 'recorded', 40),
  ('00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000000101', 5, 'El rol del asesor inmobiliario profesional', 'Ética, responsabilidades y diferenciación en el mercado.', 'recorded', 35)
ON CONFLICT DO NOTHING;

-- Lecciones del Módulo 2
INSERT INTO public.lessons (id, module_id, position, title, description, kind, duration_minutes) VALUES
  ('00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000000102', 1, 'Venta consultiva vs. venta transaccional', 'Por qué el modelo consultivo genera más valor a largo plazo.', 'recorded', 45),
  ('00000000-0000-0000-0000-000000001012', '00000000-0000-0000-0000-000000000102', 2, 'Identificación de necesidades del cliente', 'Técnicas de escucha activa y preguntas poderosas.', 'recorded', 50),
  ('00000000-0000-0000-0000-000000001013', '00000000-0000-0000-0000-000000000102', 3, 'Manejo de objeciones', 'Las 12 objeciones más comunes y cómo abordarlas.', 'recorded', 55),
  ('00000000-0000-0000-0000-000000001014', '00000000-0000-0000-0000-000000000102', 4, 'Técnicas de cierre', 'Cierre por alternativa, por urgencia, por resumen, y más.', 'recorded', 45)
ON CONFLICT DO NOTHING;

-- Lecciones del Módulo 3 (bloqueadas — se desbloquean en agosto)
INSERT INTO public.lessons (id, module_id, position, title, description, kind, duration_minutes, unlock_at) VALUES
  ('00000000-0000-0000-0000-000000001021', '00000000-0000-0000-0000-000000000103', 1, 'Compraventa inmobiliaria paso a paso', 'El proceso legal completo desde la promesa hasta la escritura.', 'recorded', 50, '2026-08-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000001022', '00000000-0000-0000-0000-000000000103', 2, 'Tributación inmobiliaria para asesores', 'IVA, impuesto a la renta, contribuciones. Lo que debes saber.', 'recorded', 55, '2026-08-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000001023', '00000000-0000-0000-0000-000000000103', 3, 'Contratos y cláusulas críticas', 'Revisión de cláusulas que protegen al cliente y al asesor.', 'recorded', 45, '2026-08-15T00:00:00Z')
ON CONFLICT DO NOTHING;

-- Lecciones del Módulo 4 (bloqueadas — septiembre)
INSERT INTO public.lessons (id, module_id, position, title, description, kind, duration_minutes, unlock_at) VALUES
  ('00000000-0000-0000-0000-000000001031', '00000000-0000-0000-0000-000000000104', 1, 'Branding personal para asesores', 'Construye tu marca personal como profesional inmobiliario.', 'recorded', 40, '2026-09-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000001032', '00000000-0000-0000-0000-000000000104', 2, 'Estrategia de contenido en redes sociales', 'LinkedIn, Instagram y WhatsApp Business para captación.', 'recorded', 50, '2026-09-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000001033', '00000000-0000-0000-0000-000000000104', 3, 'Generación de leads calificados', 'Funnels, landing pages y automatización básica.', 'recorded', 55, '2026-09-15T00:00:00Z')
ON CONFLICT DO NOTHING;

-- Lecciones del Módulo 5 (bloqueadas — noviembre)
INSERT INTO public.lessons (id, module_id, position, title, description, kind, duration_minutes, unlock_at) VALUES
  ('00000000-0000-0000-0000-000000001041', '00000000-0000-0000-0000-000000000105', 1, 'Definición del proyecto integrador', 'Briefing y selección del caso real.', 'live_in_person', 90, '2026-11-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000001042', '00000000-0000-0000-0000-000000000105', 2, 'Presentación final', 'Defensa del proyecto ante panel evaluador.', 'live_in_person', 120, '2026-12-01T00:00:00Z')
ON CONFLICT DO NOTHING;

-- Recursos de ejemplo para Módulo 1, Lección 1
INSERT INTO public.lesson_resources (lesson_id, title, type, url, position) VALUES
  ('00000000-0000-0000-0000-000000001001', 'Presentación — Intro al Mercado Inmobiliario', 'pdf', '/resources/m01-l01-presentacion.pdf', 1),
  ('00000000-0000-0000-0000-000000001001', 'Informe CCHC — Mercado Inmobiliario 2026', 'link', 'https://www.cchc.cl/centro-de-informacion/publicaciones/informe-mach', 2),
  ('00000000-0000-0000-0000-000000001001', 'Plantilla de análisis de mercado', 'template', '/resources/m01-l01-plantilla-analisis.xlsx', 3)
ON CONFLICT DO NOTHING;

-- Recursos de ejemplo para Módulo 2, Lección 3
INSERT INTO public.lesson_resources (lesson_id, title, type, url, position) VALUES
  ('00000000-0000-0000-0000-000000001013', 'Guía de manejo de objeciones', 'pdf', '/resources/m02-l03-objeciones.pdf', 1),
  ('00000000-0000-0000-0000-000000001013', 'Video complementario — Chris Voss', 'link', 'https://www.youtube.com/watch?v=guZa7mQV1l0', 2)
ON CONFLICT DO NOTHING;
