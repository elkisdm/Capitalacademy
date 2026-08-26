-- =============================================================================
-- Capital Academy — Convocatoria parcial: una clase a la que solo va parte de
-- la cohorte.
--
-- Problema: hasta ahora toda `class_sessions` convoca a la cohorte completa. El
-- examen final de Role Play del Diplomado se rinde en DOS sábados (29-ago y
-- 5-sep) con la mitad del curso cada uno, y el sistema no tenía cómo saberlo:
-- el recordatorio de 72 h del 26-ago salió a los 25 de la cohorte para un examen
-- que solo rinden 10. Es el problema que levantó la reunión del 26-ago
-- ("los avisos de roleplay estaban llegando a alumnos que no debían presentarse
-- en la fecha comunicada").
--
-- Decisión: misma forma que `email_campaigns.audience_student_ids` (migración
-- 0092), para que el sistema tenga UNA sola idea de lo que es "una lista de
-- personas elegidas a mano":
--
--   null = convoca a toda la cohorte. Es el comportamiento actual y el de todas
--          las sesiones existentes, así que la columna nace nullable y sin
--          backfill.
--   lista = convoca SOLO a esas personas.
--
-- Es un AÑADIDO al filtro que ya existe (matrícula activa + `audience`/segmento),
-- nunca un reemplazo: al resolver destinatarios se aplica el filtro de siempre y
-- después se intersecta con esta lista. De ahí sale que quien se retiró entre
-- que se guardó la lista y el envío NO reciba nada aunque su id siga acá.
--
-- Alcance de la convocatoria: además de los correos, decide la ASISTENCIA. Un
-- alumno que no está convocado no puede acumular una inasistencia por no ir
-- (`lib/asistencia/window.ts::sessionAppliesToEnrollment`). Sin eso, los 9 que
-- rinden el 5-sep se comerían una falta por no aparecer el 29.
--
-- Idempotente: add column if not exists.
-- =============================================================================

alter table public.class_sessions
  add column if not exists attendee_student_ids uuid[];

-- Un array vacío no significa "todos" ni "nadie": significa que alguien guardó
-- una convocatoria sin nadie marcado. Se rechaza en el borde; para "todos" el
-- valor correcto es null. Mismo criterio que 0092.
alter table public.class_sessions
  drop constraint if exists class_sessions_attendees_chk;

alter table public.class_sessions
  add constraint class_sessions_attendees_chk
  check (attendee_student_ids is null or cardinality(attendee_student_ids) > 0);

comment on column public.class_sessions.attendee_student_ids is
  'Convocatoria parcial (profiles.id). null = toda la cohorte. Se INTERSECTA con el filtro de audiencia, nunca lo reemplaza. Decide correos Y asistencia: quien no está convocado no acumula inasistencia. Lectores: lib/classroom/session-recipients.ts, lib/asistencia/window.ts.';
