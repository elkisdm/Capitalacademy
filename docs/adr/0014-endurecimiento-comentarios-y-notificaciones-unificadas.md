# ADR-0014: Endurecimiento de comentarios y notificaciones unificadas

- **Status:** proposed
- **Date:** 2026-07-11
- **Deciders:** Eduardo (producto/dev)
- **Tags:** data-model, classroom, conversaciones, rls, notificaciones

## Contexto

Una auditoría técnica sobre los dos sistemas de comentarios del classroom —
`lesson_comments` ([ADR-0002](0002-arquitectura-modulo-classroom.md)) y el foro
Conversaciones (`conversation_*`, [ADR-0010](0010-conversaciones-foro-por-programa.md),
[ADR-0011](0011-conversaciones-notificaciones-realtime.md)) — encontró agujeros de RLS y
brechas de UX/funcionalidad que ya estaban afectando producción:

- El `WITH CHECK` de `conversation_threads_author_update` no revalidaba `program_id`: un
  autor podía mover su propio hilo a otro programa (fuga cross-tenant) o auto-fijarlo/
  bloquearlo (`is_pinned`/`is_locked`) sin ser staff.
- `conversation_reactions` no tenía policy `UPDATE`: cambiar de emoji hacía un `update`
  que la RLS filtraba a 0 filas — la reacción quedaba visualmente cambiada en el cliente
  pero no persistía tras recargar.
- El `staff_all` de comentarios del foro usaba `is_platform_staff` (solo admin/ops
  transversal): un docente puro de `cohort_roles` no podía leer ni responder en el foro
  de su propio programa ([ADR-0013](0013-panel-docente-y-acceso-cohort-staff.md) ya
  identificó el mismo patrón de exclusión del docente puro en otras superficies).
- `lesson_comments` (`0011`) no tenía policy para docentes en absoluto: un profesor sin
  matrícula quedaba bloqueado también para comentar en la lección de su propio programa.
- Los enlaces de campana y de correo se armaban con un `cohortSlug`/`limit(1)` arbitrario:
  un alumno con matrícula en otro programa, o un hilo de una cohorte distinta a la que el
  viewer tenía activa, producían 404.
- Ambos sistemas hacían `delete()` físico (sin soft delete): borrar un comentario con
  respuestas dejaba huérfanas las respuestas o rompía el árbol en el cliente.
- Los errores de red/RLS al publicar/borrar/editar se tragaban en silencio (catch vacío):
  el usuario no se enteraba de que su comentario no se guardó.
- Mencionar al autor del hilo generaba notificación y correo duplicados (`reply` + `mention`).

Estos hallazgos exigían tocar RLS, triggers, notificaciones y UI de dos sistemas a la
vez sin romper el flujo existente del foro (en particular el contador `comment_count`/
`last_activity_at`, que ya depende de un trigger de mantención).

## Decisión

Endurecer ambos sistemas de comentarios con el mismo conjunto de patrones, y generalizar
la infraestructura de notificaciones del foro para que cubra también comentarios de
lección, en vez de construir un canal de notificación paralelo.

1. **Soft delete en ambos sistemas.** `lesson_comments` y `conversation_comments`/
   `conversation_threads` ganan `deleted_at`/`edited_at`. Borrar pasa a ser un
   `update({deleted_at, content/body: ""})` en vez de `delete()`: las respuestas
   sobreviven al borrado del padre (se renderiza un placeholder "Comentario eliminado").
   La RLS de `DELETE` deja de aplicar — el autor/staff necesita permiso de `UPDATE`.

2. **Freeze de columnas de sistema vía triggers.** `tg_conversation_thread_freeze` y
   `tg_conversation_comment_freeze` (más sus equivalentes de `lesson_comments`) bloquean
   en `BEFORE UPDATE` que un autor cambie `program_id`/`lesson_id`/`author_id`/
   `created_at`, y que `is_pinned`/`is_locked` cambien sin ser staff del programa. El
   trigger de mantención del contador (`tg_conversation_comment_activity`) setea un flag
   de transacción (`app.thread_counter_maint`) para que el freeze distinga su propio
   `UPDATE` interno de una manipulación por REST del usuario — sin este flag, el freeze
   rompería el contador del foro.

3. **Generalización de `conversation_notifications` para comentarios de lección.** En vez
   de un sistema de notificación paralelo para `lesson_comments`, la tabla de
   ADR-0011 gana columnas nullable `lesson_id`/`lesson_comment_id` y dos tipos nuevos:
   `lesson_reply` (alguien respondió mi comentario de lección) y `lesson_comment_new`
   (aviso a los docentes/asistentes del programa ante un comentario raíz nuevo). La
   campana, el Realtime y el correo existentes se reusan sin cambios de infraestructura.

4. **Rutas neutras `/classroom/go/thread/[threadId]` y `/classroom/go/lesson/[lessonId]`.**
   Resuelven `program_id` → una cohorte donde el viewer tiene acceso (matrícula
   active/completed, teacher/assistant, o admin/ops) → `redirect()` a la URL real, o
   `notFound()` si no hay acceso. Un solo mecanismo resuelve el 404 cross-cohorte del
   correo y el cross-programa de la campana, para foro y lección por igual.

5. **`edited_at` explícito**, no reutilizar `updated_at`: `updated_at` ya se toca por
   mantención de sistema (pin/lock, soft delete), así que no distingue una edición real
   de contenido. Desviación consciente de la exploración inicial (que asumía que
   `updated_at` alcanzaba).

6. **RLS docente en `lesson_comments`.** Nuevas policies `lesson_comments_staff_update`/
   `_staff_delete` vía `is_lesson_staff(lesson_id)` (helper que resuelve `cohort_roles`
   teacher/assistant del programa de la lección), cerrando el mismo agujero que
   ADR-0013 documentó para otras superficies del panel docente.

## Opciones consideradas

### Opción A — Los cambios de esta ADR (elegida)
- **Pros:** reusa la infraestructura de notificaciones existente (campana + Realtime +
  correo) en vez de duplicarla; el soft delete es el mismo patrón en los dos sistemas;
  una sola ruta neutra resuelve todos los 404 cross-tenant/cross-cohorte.
- **Contras:** el flag de mantención (`app.thread_counter_maint`) es un acoplamiento
  implícito entre dos triggers que hay que documentar bien para no romperlo a futuro.

### Opción B — Canal de notificación separado para comentarios de lección
- **Pros:** aislamiento total entre foro y lección; sin riesgo de colisión de tipos.
- **Contras:** duplica campana, Realtime, cooldown de correo y UI; el follow-up de
  "like del instructor" (ver Consecuencias) tendría que elegir a cuál de los dos
  engancharse. Descartada por costo de mantenimiento.

## Consecuencias

### Positivas
- Un docente puro (`cohort_roles`, sin matrícula) puede leer, comentar y moderar tanto
  en el foro como en las lecciones de su propio programa.
- Cambiar de reacción persiste tras recargar; un `insert` duplicado por doble-tap
  concurrente (`23505`) se trata como éxito idempotente, no como error 500.
- Un comentario/hilo puede editarse y muestra "(editado)"; borrar preserva las
  respuestas.
- Los enlaces de campana y correo dejan de dar 404 en programas con más de una cohorte.
- Los errores de publicar/borrar/editar se muestran en vez de fallar en silencio.

### Negativas
- Dos sistemas de comentarios (`lesson_comments`, `conversation_*`) siguen siendo tablas
  separadas con RLS y triggers duplicados en espíritu (freeze, soft delete, validación
  de parent) — se aceptó no unificarlas en un solo modelo por ahora.
- `conversation_notifications` acumula dos dominios (foro y lección) en las mismas
  columnas nullable; un cambio futuro al modelo de notificaciones toca ambos.

### Riesgos
- **Freeze vs. contador del foro**: si el flag `app.thread_counter_maint` se pierde en
  una migración futura, el freeze bloquearía el `UPDATE` de mantención y rompería
  silenciosamente el conteo de comentarios del foro. Mitigación: verificación manual
  obligatoria (comentar un hilo como alumno normal debe subir `comment_count`).
  RLS existente del foro (`has_program_access`, `0057`) no se tocó salvo lo indicado acá.
- **Contrato del cliente cambia** de hard delete a soft delete: cualquier integración
  que asumiera que un comentario borrado desaparece de la fila necesita manejar
  `deleted: true` / `content: null`.
- **Reacciones a comentarios de lección quedan fuera de esta pasada** — `conversation_reactions`
  está atada por FK a `conversation_threads/comments`; reusarla para `lesson_comments`
  requeriría tabla + RLS + API + UI propias. Sigue como follow-up (junto con el "like
  del instructor con notificación").

## Referencias

- [ADR-0002](0002-arquitectura-modulo-classroom.md) — arquitectura del módulo classroom
  (`lesson_comments` original).
- [ADR-0010](0010-conversaciones-foro-por-programa.md) — foro por programa (tenant).
- [ADR-0011](0011-conversaciones-notificaciones-realtime.md) — notificaciones/Realtime
  base que esta ADR generaliza.
- [ADR-0013](0013-panel-docente-y-acceso-cohort-staff.md) — panel del profesor y acceso
  staff-preview por `cohort_roles` (mismo patrón de exclusión del docente puro).
- `db/migrations/0065_lesson_comments_hardening.sql`,
  `db/migrations/0066_conversaciones_hardening.sql`,
  `db/migrations/0067_comment_notifications.sql`.
