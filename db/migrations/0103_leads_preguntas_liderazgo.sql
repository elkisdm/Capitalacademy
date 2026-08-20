-- 0103 — Las respuestas de calificación del formulario de Liderazgo.
--
-- El formulario de Google del programa ("Formulario de registro— Programa de
-- liderazgo") pregunta tres cosas que la landing no capturaba: si la persona
-- lidera un equipo hoy, cuántas personas tiene a cargo y qué desafíos enfrenta.
-- Existen para segmentar y priorizar el contacto, no para leerlas de a una.
--
-- Van como COLUMNAS TIPADAS y no como un `jsonb` de respuestas porque nadie
-- lee estos leads desde la aplicación: no hay panel de leads ni correo de
-- aviso, se miran directo en el editor de tablas de Supabase. Ahí tres columnas
-- se leen y se filtran; un jsonb sería un muro de texto por fila.
--
-- Nombradas por lo que capturan y no por el programa: si mañana otra landing
-- pregunta lo mismo, reusa la columna en vez de agregar una gemela.
--
-- `desafios` es un arreglo porque en el formulario es una pregunta de CASILLAS:
-- se eligen varias. Guardarlo como texto separado por comas obligaría a parsear
-- para contar cuál pesa más, que es justo para lo que se preguntó.
-- La opción "Otro" del formulario entra como un valor más del arreglo.
--
-- ADITIVO · idempotente · todo nullable: los leads que ya existen y los de las
-- otras landings (diplomado, ruta, indeciso) no responden estas preguntas.

alter table public.leads
  add column if not exists lidera_equipo text,
  add column if not exists personas_a_cargo text,
  add column if not exists desafios text[];

comment on column public.leads.lidera_equipo is
  'Formulario de Liderazgo: si lidera un equipo actualmente. Null en el resto de las landings.';
comment on column public.leads.personas_a_cargo is
  'Formulario de Liderazgo: rango de personas a cargo. Null si no respondió (la pregunta es opcional).';
comment on column public.leads.desafios is
  'Formulario de Liderazgo: desafíos elegidos (casillas, varios). Incluye el texto de "Otro" si lo usó.';
