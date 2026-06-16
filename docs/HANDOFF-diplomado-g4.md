# HANDOFF — Diplomado IV Generación (G4) · Capital Academy

> Fecha: 2026-06-16 · Para retomar en sesión fresca. Estado: **código completo y verde (typecheck exit 0, lint limpio); faltan pasos de aplicación/operación.**
> Contexto vivo: ADR `docs/adr/0008-entorno-diplomado-y-calendario-de-sesiones.md`, brief `docs/briefs/fase2-calendario-y-segmentacion-diplomado.md`, memoria `project-diplomado-g4-setup`.

## 0. TL;DR — qué falta para terminar

1. **Reconectar MCP Supabase** (`/mcp`) — `.mcp.json` ya tiene el token nuevo válido, pero el server de la sesión anterior arrancó con el viejo.
2. **Aplicar 2 migraciones** (en orden): `0024_audience_and_segment.sql` → `0026_session_reminders.sql`.
3. **Setear env `CRON_SECRET`** en **Netlify** (el scheduling ya es Netlify-native: `netlify/functions/session-reminders-cron.mjs`, */30).
4. **Invitar a los 8 alumnos**: `node scripts/invite-diplomado-g4.mjs preview` → revisar correo → `send`.
5. **(Opcional) Commit** del trabajo (nada está commiteado aún).

Meta dura: la 1ª clase es **sábado 20-jun-2026 09:30** (presencial). Los pasos 2 y 4 desbloquean el acceso de los alumnos.

## 1. Entorno y credenciales

- Proyecto Supabase: **`igatsyghbadccbrjiurl`** ("Capital Academy"). Next.js **16.2.4** App Router. **Deploy: NETLIFY** (proyecto `capitalacademy`, plugin `@netlify/plugin-nextjs`, push a `work/main`). La carpeta `.vercel` es engañosa — **NO se deploya en Vercel**; no usar features de Vercel (crons de `vercel.json`, etc.). Ver memoria `reference-netlify-build-config`.
- **Acceso a Supabase (estado real, verificado):**
  - **MCP**: `.mcp.json` (gitignored, no trackeado) tiene el token nuevo `sbp_…7889`, validado contra Management API (200). **Requiere `/mcp` reconnect** para que el server lo tome. Con MCP vivo: usar `mcp__supabase__apply_migration` y `mcp__supabase__execute_sql`.
  - **`.env` `SUPABASE_ACCESS_TOKEN`**: mismo token, sirve para Management API (`https://api.supabase.com/v1/projects/igatsyghbadccbrjiurl/database/query`).
  - **`.env` `SUPABASE_SERVICE_ROLE_KEY`**: sirve para **DML vía PostgREST** (lecturas y `update/insert` en tablas con `@supabase/supabase-js`), **NO para DDL**. Así se sembraron los slugs.
  - **Supabase CLI**: autenticada para lecturas (`supabase projects list`), pero `supabase db query --linked` da 401 en "login role" y pide `SUPABASE_DB_PASSWORD` (no disponible). No usar para escribir.
  - Patrón para leer/escribir datos sin MCP: script Node que carga `.env` y usa `createClient(URL, SERVICE_ROLE_KEY)` (ver cualquier `scripts/*.mjs`).

## 2. Estado de la base de datos

**Aplicadas:** `0001`–`0023` (incluye `0022_seed_diplomado_g4.sql` y `0023_class_sessions_rls.sql`).

Entorno sembrado y **verificado**:
- Programa `DIP-VENTAS` (id `a0000000-0000-0000-0000-000000000002`), 2 módulos (`modulo-teorico`, `modulo-practico`).
- Cohorte `G4` "IV Generación — Junio 2026" (id `b0000000-0000-0000-0000-000000000002`, slug `diplomado-iv-generacion`, 2026-06-20→2026-09-18, status active).
- 14 docentes en `public.instructors`. 24 filas en `public.class_sessions` (con `title`, `teacher_id`, horas en TZ Santiago correctas).
- Slugs backfilled vía service_role (la versión de `0022` que se aplicó era anterior al fix; ya corregido en disco y en BD).

**PENDIENTES de aplicar (en orden):**
- `db/migrations/0024_audience_and_segment.sql` — agrega `class_sessions.audience` ('all'|'capital_inteligente') + `enrollments.segment` + **reemplaza la policy `class_sessions_select` de 0023** (por eso va DESPUÉS de 0023).
- `db/migrations/0026_session_reminders.sql` — enum `reminder_status` + tabla `session_reminders` + RLS (staff lee, service_role escribe).
- No existe `0025` (la feature 2b no necesitó migración; el hueco es intencional).

**Tras aplicar:** idealmente regenerar tipos (`supabase gen types typescript --project-id igatsyghbadccbrjiurl > lib/supabase/types.ts`). Hoy `lib/supabase/types.ts` está **extendido a mano** con: tabla `instructors`, `session_reminders`, enum `reminder_status`, columnas `class_sessions.title/teacher_id/audience` y `enrollments.segment`. Regenerar permitirá limpiar los casts `as never`/`as unknown`.

## 3. Features implementadas (código en disco, typecheck/lint OK)

| Feature | Archivos clave |
|---|---|
| **2a** Vista calendario alumno | `app/(classroom)/classroom/[cohortSlug]/calendario/{page,loading}.tsx`, `getCohortSchedule` en `lib/classroom/queries.ts`, tipos en `lib/classroom/types.ts`, item "Calendario" en `components/classroom/sidebar.tsx`, RLS `0023` (aplicada) |
| **2b** Editor calendario (staff) | `app/api/admin/sessions/route.ts` + `[sessionId]/route.ts`, `app/(admin)/admin/cohorts/[cohortId]/sesiones/{page,sessions-manager-client}.tsx`. Acceso: acción "Gestionar calendario" en `cohort-detail-client.tsx`. Ruta: `/admin/cohorts/<id>/sesiones` |
| **2c** Alertas | `lib/email/session-reminder.ts`, `app/api/cron/session-reminders/route.ts` (auth `CRON_SECRET`, reserva-antes-de-enviar idempotente vía unique), **`netlify/functions/session-reminders-cron.mjs`** (Netlify Scheduled Function */30 que pega al route), migración `0026` |
| **2d** Segmentación Capital Inteligente | `app/api/admin/enrollment-segment/route.ts`, `components/admin/segment-toggle.tsx`, edits en `cohort-detail-client.tsx`, migración `0024` |
| **Fase 3** Invitación | `scripts/invite-diplomado-g4.mjs` (modos preview/send, idempotente, lee el xlsx), copy presencial en `lib/email/invitation.ts` |

## 4. Pasos para completar (orden recomendado)

1. `/mcp` → reconectar `supabase`. Verificar: `mcp__supabase__execute_sql` con `select 1`.
2. Aplicar `0024` y luego `0026` (con MCP: `mcp__supabase__apply_migration`; o pegar en dashboard SQL si MCP falla).
3. Verificar (query): que existan columnas `class_sessions.audience`, `enrollments.segment`, tabla `session_reminders`, y que la policy `class_sessions_select` incluya el filtro de audience.
4. Cron de alertas en **Netlify** (NO Vercel): setear `CRON_SECRET` en Netlify y crear una **Netlify Scheduled Function** que pegue a `/api/cron/session-reminders` con el header `Authorization: Bearer $CRON_SECRET` (ver §5.1). El `vercel.json` actual NO dispara en Netlify; borrarlo.
5. `node scripts/invite-diplomado-g4.mjs preview` (manda 1 correo de muestra a edaza@). Revisar copy/branding. Luego `node scripts/invite-diplomado-g4.mjs send`.
6. (Para previsualizar el calendario del alumno antes de invitar: la página exige matrícula activa → auto-matricular a Elkis en G4, o esperar al `send`.)
7. Decidir estrategia de commit (ver §6).

## 5. Follow-ups conocidos (NO bloquean el lanzamiento)

1. **2c no filtra destinatarios por `audience`**: una clase `capital_inteligente` le llega a TODOS los matriculados. Arreglar en `app/api/cron/session-reminders/route.ts` (cruzar recipients con `enrollments.segment` cuando `session.audience='capital_inteligente'`) antes de usar alertas con clases diferenciadas.
2. **Sidebar muestra "Workshop" hardcodeado** (`components/classroom/sidebar.tsx`) a alumnos del diplomado. Hacer el label dependiente del programa.
3. **Casts `as never`/`as unknown`** en rutas 2b y `lib/classroom/queries.ts` — limpiar tras regenerar tipos.
4. **Contenido de las clases de los martes (Capital Inteligente)** — pendiente de dirección (Paola). El mecanismo (audience + segment + RLS) ya está; falta cargar esas sesiones con `audience='capital_inteligente'` y marcar a los 4 alumnos internos con `segment='capital_inteligente'` (el script Fase 3 deja el hook; el toggle admin 2d permite marcarlos a mano).

## 6. Git / commit

Nada commiteado aún. Sugerencia de commits (conventional, sin co-author): por feature →
`feat(classroom): calendario de sesiones del alumno`, `feat(admin): editor de calendario de cohorte`, `feat(classroom): recordatorios automáticos de clase`, `feat(admin): segmentación Capital Inteligente`, `feat(diplomado): script de invitación G4 + seed (migraciones 0022-0026)`.
Recordar: pushear con cuenta `edaza-create` (ver memoria `reference-git-push-deploy-account`); no auto-push sin pedirlo.

## 7. Comandos de verificación

```bash
pnpm typecheck   # debe dar exit 0
pnpm exec eslint <archivos tocados>
# estado de datos (sin MCP, vía service_role):
node -e 'require("@supabase/supabase-js"); /* cargar .env y consultar programs/cohorts/class_sessions */'
```
