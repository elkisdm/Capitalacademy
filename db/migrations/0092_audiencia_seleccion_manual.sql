-- 0092 — Selección manual de destinatarios en un comunicado.
--
-- Hasta ahora la audiencia de un comunicado se describía SOLO por filtros
-- (entorno + cohorte + estado de matrícula + segmento) y el envío alcanzaba a
-- todo el que calzara. No había forma de escribirle a doce personas concretas:
-- o le hablabas a la cohorte entera, o armabas un script aparte.
--
-- Esta columna guarda la lista concreta de personas elegidas. Es un AÑADIDO al
-- filtro, nunca un reemplazo: al enviar se resuelve la audiencia como siempre y
-- después se intersecta con esta lista. Esa decisión es la que sostiene el resto:
--
--   * Quien se retiró de la cohorte entre el borrador y el envío NO recibe el
--     correo aunque su id siga en la lista — el filtro lo saca primero.
--   * Quien se matriculó DESPUÉS de guardar tampoco lo recibe, porque no está
--     en la lista. Es lo que uno espera al marcar nombres a mano: se envía a
--     quienes marcaste, no a "los que calcen mañana".
--
-- null = sin selección manual, o sea toda la audiencia del filtro. Es el
-- comportamiento que ya existe y el de todas las campañas hasta hoy, así que la
-- columna nace nullable y sin backfill.

alter table public.email_campaigns
  add column if not exists audience_student_ids uuid[];

-- Un array vacío no significa "todos" ni "nadie": significa que alguien guardó
-- una selección sin nadie marcado, y ese borrador solo puede terminar en un
-- envío fallido por audiencia vacía. Se rechaza en el borde en vez de dejarlo
-- llegar hasta el envío. Para "todos" el valor correcto es null.
alter table public.email_campaigns
  drop constraint if exists email_campaigns_audience_ids_chk;

alter table public.email_campaigns
  add constraint email_campaigns_audience_ids_chk
  check (audience_student_ids is null or cardinality(audience_student_ids) > 0);

comment on column public.email_campaigns.audience_student_ids is
  'Selección manual de destinatarios (profiles.id). null = toda la audiencia del filtro. Se INTERSECTA con el filtro al enviar, nunca lo reemplaza.';
