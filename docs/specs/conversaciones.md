# Conversaciones — foro de comunidad del entorno (estilo Skool)

**Classification**: `feat` · large · **risk med-high** (nuevo modelo de datos + migración + RLS + contenido de usuarios) · known · toca `db/migrations`, `app/(classroom)`, `app/api/classroom`, `lib/conversaciones`, `components/classroom`
**Tier**: 3 — Full
**Fecha**: 2026-07-06
**ADR**: [0010](../adr/0010-conversaciones-foro-por-programa.md) — alcance por programa

---

## Goal

Un espacio de comunidad dentro de cada entorno donde cualquier alumno (o staff) abre una
**conversación** (post con título + cuerpo Markdown) y se genera un **hilo de comentarios**.
Cálido y simple estilo Skool: reacciones ❤️, 1 nivel de replies, orden por actividad reciente.
El feed es **compartido por todo el programa** (todas las generaciones), aislado de otros programas.

## Decisiones tomadas (del usuario, 2026-07-06)

| Decisión | Valor elegido |
|----------|---------------|
| Alcance del feed | **Por programa/entorno** (FK `program_id`) — ver ADR-0010 |
| Modelo de interacción | **Skool-style**: post + comentarios con 1 nivel de reply, ❤️ (sin downvote) |
| Organización v1 | **Feed único** cronológico + columna `category` reservada (sin UI de filtros) |
| Orden | Actividad reciente por defecto; toggle "Recientes / Top" (Top = por reacciones) |
| Editor | `textarea` con Markdown (render con `components/ui/markdown.tsx`); sin WYSIWYG |
| Moderación v1 | Staff: fijar (pin), cerrar (lock), borrar. Autor: editar/borrar lo propio |

## Modelo de datos (`db/migrations/0044_conversaciones.sql`)

> Nota: `0043` ya está tomado por `0043_seed_liderazgo.sql`. La siguiente migración libre es **`0044`**.

- **`conversation_threads`**: `id`, `program_id → programs`, `author_id → profiles`,
  `title`, `body`, `category text default 'general'` *(reservada v2)*, `is_pinned bool`,
  `is_locked bool`, `comment_count int default 0` *(denormalizado)*,
  `last_activity_at timestamptz default now()`, `created_at`, `updated_at`.
- **`conversation_comments`**: `id`, `thread_id → conversation_threads (cascade)`,
  `author_id → profiles`, `parent_id → self (cascade, 1 nivel)`, `body`, `created_at`, `updated_at`.
- **`conversation_reactions`**: `id`, `user_id → profiles`, `thread_id` *(nullable)*,
  `comment_id` *(nullable)*, `created_at`; `check` exactamente uno seteado;
  `unique(user_id, thread_id)` / `unique(user_id, comment_id)`.
- **Helpers `SECURITY DEFINER`**: `has_program_access(program_id)`, `is_program_staff(program_id)`.
- **Triggers**: `tg_set_updated_at` en threads/comments; trigger que actualiza
  `comment_count` + `last_activity_at` al insertar/borrar comentario.
- **RLS**: calcada de `0011_lesson_comments.sql` pero scopeada por `program_id` vía
  `has_program_access()`; insert de comentario bloqueado si el thread `is_locked`;
  update/delete por autor o `is_platform_staff()`.

## Files & routes to touch

**Migración**
- `db/migrations/0044_conversaciones.sql` — new.

**API** (patrón `app/api/classroom/comments/route.ts`: Zod + `createRateLimiter` + `stripHtml`, `runtime="nodejs"`)
- `app/api/classroom/conversaciones/route.ts` — new — `GET` (lista paginada por programa, cursor `last_activity_at`), `POST` (crear thread).
- `app/api/classroom/conversaciones/[threadId]/route.ts` — new — `GET`, `PATCH` (editar / pin / lock), `DELETE`.
- `app/api/classroom/conversaciones/comments/route.ts` — new — `POST` (comentario/reply; valida profundidad y lock), `DELETE`.
- `app/api/classroom/conversaciones/reactions/route.ts` — new — `POST` (toggle ❤️).

**Queries / access**
- `lib/conversaciones/queries.ts` — new — `getProgramThreads`, `getThreadWithComments`, `getReactionsForUser`.
- `lib/conversaciones/access.ts` — new — `getProgramAccess(userId, programId)`.

**Pages** (server components)
- `app/(classroom)/classroom/[cohortSlug]/conversaciones/page.tsx` — new — feed.
- `app/(classroom)/classroom/[cohortSlug]/conversaciones/[threadId]/page.tsx` — new — detalle.

**UI**
- `components/classroom/conversaciones/thread-list.tsx` — new — feed + toggle orden.
- `components/classroom/conversaciones/thread-composer.tsx` — new — crear conversación.
- `components/classroom/conversaciones/thread-detail.tsx` — new — post + árbol de comentarios.
- `components/classroom/conversaciones/reaction-button.tsx` — new — ❤️ toggle optimista.
- `components/classroom/sidebar.tsx` — modify — `NavItem` "Conversaciones" en sección `learn` + icono en `ICON_PATHS`.

**Verified against code**: sí (`0011`, `app/api/classroom/comments/route.ts`, `lib/classroom/access.ts`, `components/classroom/sidebar.tsx`).

## Spec (Given/When/Then)

**Scenario: crear conversación**
- GIVEN un alumno con matrícula activa en una cohorte del programa
- WHEN publica una conversación con título y cuerpo
- THEN aparece en el feed del programa ordenada por actividad reciente

**Scenario: responder en el hilo**
- GIVEN una conversación abierta (no locked)
- WHEN un participante escribe un comentario o un reply a un comentario raíz
- THEN el comentario aparece en el hilo; los replies a un reply se aplanan bajo el raíz (1 nivel)

**Scenario: aislamiento entre programas**
- GIVEN un alumno del programa A
- WHEN intenta leer o postear en el feed del programa B (vía API directa)
- THEN la RLS lo niega (no solo la UI)

**Scenario: reacción ❤️**
- GIVEN una conversación o comentario
- WHEN el usuario toca ❤️ y luego lo vuelve a tocar
- THEN el contador sube y baja (toggle) y el estado persiste por usuario

**Scenario: moderación de staff**
- GIVEN staff transversal
- WHEN fija, cierra o borra una conversación
- THEN el pin la sube en el feed; el lock impide nuevos comentarios; el borrado la elimina en cascada

## Out of scope (v1)
- Notificaciones (email/in-app), realtime, categorías activas, búsqueda, menciones `@`,
  adjuntos/imágenes, reportar contenido, panel de moderación en `(admin)`.

## Rollback
Migración aditiva (3 tablas + 2 funciones nuevas, cero cambios a tablas existentes).
Rollback = `drop table … cascade` + `drop function`. Sin riesgo para datos actuales.

## Estado de implementación
- ✅ Orquestación multi-modelo completa (opus planeó · sonnet implementó · haiku documentó · fable verificó). typecheck 0.
- ✅ Migración `0044` **aplicada a producción** (2026-07-06): 3 tablas + RLS (14 policies) + 3 triggers + 2 helpers, registrada en `schema_migrations`. Verificada estructuralmente.
- ⏳ **Pendiente:** deploy del código (commit + push → Netlify) y prueba E2E de aislamiento cross-program con usuarios reales.
