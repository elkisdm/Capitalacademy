# ADR-0011: Notificaciones, menciones y tiempo real en Conversaciones

- **Status:** proposed
- **Date:** 2026-07-06
- **Deciders:** Elkis Daza (ingeniería)
- **Tags:** data-model, classroom, conversaciones, realtime, notificaciones

## Contexto

Iteración 3 de Conversaciones (ver [ADR-0010](0010-conversaciones-foro-por-programa.md)):
hacer que la comunidad "avise" y se sienta viva. Hoy el foro es pull-only: no hay
notificaciones, ni menciones, ni actualización en vivo, y el feed carga 50 hilos fijos.

## Decisión

**Migración `0048`** + código. Cuatro capacidades:

1. **Notificaciones in-app** — tabla `conversation_notifications` (recipient `user_id`,
   `actor_id`, `type` ∈ `reply|mention`, `thread_id`, `comment_id`, `read_at`, `created_at`).
   RLS: el destinatario lee y marca leídas las suyas; los inserts los hace el sistema
   (trigger `security definer` para respuestas; service-role para menciones), no el cliente.
   - **Respuesta**: trigger `after insert` en `conversation_comments` → notifica al autor del
     hilo (si no es él mismo). Atómico con el comentario.
   - **Mención**: la ruta POST de comentario resuelve los `@usuario` seleccionados y crea
     notificaciones `mention` por service-role.
   - **Campana** en el sidebar (re-habilita el control que se quitó en la auditoría, ahora
     funcional): badge de no-leídas, lista, marcar leídas.

2. **@menciones** — el composer de comentario tiene un typeahead de miembros del programa
   (endpoint `members`); al elegir uno inserta `@Nombre` en el texto y agrega su `id` a un
   array `mentions` que viaja en el POST. Evita el parseo frágil de nombres. El cuerpo guarda
   texto (`@Nombre`), resaltado al render.

3. **Tiempo real** — Supabase Realtime sobre `conversation_notifications` (badge en vivo) y
   `conversation_comments` (comentarios nuevos del hilo abierto sin recargar). Las tablas se
   agregan a la publicación `supabase_realtime`; la RLS filtra qué recibe cada quien.

4. **Email** — además del in-app, la ruta POST de comentario envía correo (Resend, ya
   integrado) al autor del hilo y a los mencionados. Fire-and-forget, no bloquea la respuesta.

5. **Infinite scroll** — el feed pagina por `created_at`/offset vía la ruta GET existente +
   IntersectionObserver en el cliente.

## Consecuencias

### Positivas
- La comunidad avisa y se actualiza en vivo → mucho mayor engagement/retención.
- Aislamiento por programa intacto: la RLS de threads/comments/notifications ya lo garantiza.

### Riesgos
- **Realtime**: manejo de suscripciones/desconexión en el cliente; RLS de Realtime debe
  filtrar correctamente (no filtrar notificaciones ajenas). Mitigación: canal por `user_id`.
- **Email**: volumen; empezar solo con reply+mention (no cada reacción). Fire-and-forget con
  captura de error para no romper el POST.
- **Trigger de notificación**: no debe fallar el insert del comentario si algo sale mal
  (mantenerlo simple e idempotente).

## Referencias
- `db/migrations/0048_conversation_notifications.sql`
- [ADR-0010](0010-conversaciones-foro-por-programa.md) — el foro base.
