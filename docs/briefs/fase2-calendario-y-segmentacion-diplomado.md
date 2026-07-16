# Brief Fase 2 — Calendario interactivo + segmentación "Capital Inteligente"

> Estado: **superado (2026-07-16)** · Fecha original: 2026-06-16 · Relacionado: [ADR-0008](../adr/0008-entorno-diplomado-y-calendario-de-sesiones.md)
> Nota de cierre: la realidad alcanzó a este brief — el calendario admin se implementó el 10-jul-2026 (commit 8e58770), la segmentación existe vía enrollments.segment + class_sessions.audience (usada en el Ciclo CI), y los recordatorios 24h operan en prod. Se archiva como referencia histórica; no ejecutar.
> Precondición: Fase 0 (migración `0022`) y Fase 1 (sesiones pobladas) aplicadas.

## Clasificación spec-flow

| Sub-feature | Tipo | Tier | Riesgo |
|---|---|---|---|
| 2a · Vista de calendario para el alumno | feature | 2 | medio (lectura) |
| 2b · Editor autónomo de calendario (Paola) | feature | 3 | alto (escritura por no-dev, RLS) |
| 2c · Alertas basadas en el calendario | feature | 2 | medio (envío automático) |
| 2d · Etiqueta "Capital Inteligente" + calendario diferenciado | feature | 3 | alto (segmentación + RLS) |

Recomendación de orden: **2a → 2d → 2b → 2c**. La vista (2a) da valor inmediato y valida
el modelo; la segmentación (2d) condiciona qué ve cada alumno y debe existir antes del editor;
las alertas (2c) van al final porque dependen de que el calendario sea estable.

## Contexto / estado actual (verificado)

- `public.class_sessions` existe (migración `0001`) pero **ninguna ruta la lee/escribe**
  (solo `lib/supabase/types.ts`). RLS habilitado, **sin políticas**. Tras `0022` quedará
  poblada con las ~24 sesiones del track general + `teacher_id` + `title`.
- No existe segmentación de alumnos. Hay `profiles.role` + RBAC por cohorte (ADR-0004).
- El calendario de los **martes** (clases extra Capital Inteligente: soporte comercial,
  marketing, CRM, gestión comercial) **aún no lo entrega dirección** → bloquea el contenido
  de 2d, pero NO el modelo (la etiqueta y la vista diferenciada se pueden construir antes).
- Maquinaria reutilizable: panel admin `app/(admin)/admin/*`, `lib/classroom/queries.ts`,
  `lib/supabase/{server,admin}.ts`, `lib/email/*` + Resend, `lib/auth/authorize-admin.ts`.

## 2a · Vista de calendario para el alumno

**Objetivo:** que el alumno vea su calendario de clases (fecha, hora, modalidad, docente,
link de la sesión online / sede presencial) dentro de la plataforma.

Archivos/rutas a tocar (estimado):
- `db/migrations/0023_class_sessions_rls.sql` — políticas RLS de `class_sessions`:
  `select` para alumnos matriculados en el cohorte (`enrollment` activa) + staff lee todo.
- `lib/classroom/queries.ts` — `getCohortSchedule(cohortId)` / `getStudentSchedule(userId)`.
- `app/(classroom)/.../calendario/page.tsx` (server) + cliente de vista (mes/lista).
- `components/classroom/` — componente de calendario (reutilizar patrón de cards existentes).
- Enlazar `class_sessions.teacher_id → instructors` para mostrar foto/nombre del docente.

Open: ¿columnas extra en `class_sessions`? (`meeting_url` ya existe; falta sede/ubicación
para presenciales → `location text`).

## 2d · Etiqueta "Capital Inteligente" + calendario diferenciado

**Objetivo:** marcar alumnos Capital Inteligente para mostrarles una versión del calendario
con las clases extra de los martes. La marca es **manual por staff** (decisión de reunión:
el correo NO es confiable para identificarlos).

Modelo propuesto (a confirmar en ADR propio):
- Opción recomendada: tabla `enrollment_tags` (o columna `enrollments.segment text`) +
  enum/catálogo de etiquetas. Etiqueta inicial: `capital_inteligente`.
- Las sesiones extra de los martes se cargan como `class_sessions` con un flag de audiencia
  (`audience text default 'all'` → `'all' | 'capital_inteligente'`), filtradas por la etiqueta
  de la matrícula del alumno.
- Admin: en `app/(admin)/admin/cohorts/[cohortId]` o `/admin/users/[userId]`, toggle de etiqueta.

Bloqueo de contenido: el detalle de las 4 clases de los martes lo debe entregar dirección.

## 2b · Editor autónomo de calendario (Paola)

**Objetivo:** que dirección mueva/edite/cree clases desde el panel sin código.

Archivos/rutas a tocar (estimado):
- `app/api/admin/sessions/route.ts` (+ `[sessionId]/route.ts`) — CRUD de `class_sessions`,
  protegido con `authorizeAdmin` (rol `admin`/`ops`/`teacher`).
- UI en `app/(admin)/admin/cohorts/[cohortId]` — gestor de sesiones (crear/editar/reprogramar;
  `rescheduled_from` ya existe en el schema para historial de reprogramación).
- Validación de solapamientos y zona horaria (Santiago, ojo DST 6-sep-2026).

## 2c · Alertas basadas en el calendario

**Objetivo:** recordatorios automáticos antes de cada clase (email / WhatsApp).

Archivos/rutas a tocar (estimado):
- Job programado (cron) que consulta `class_sessions` próximas y dispara recordatorios.
  Evaluar Netlify Scheduled Functions vs. cron externo (revisar `netlify.toml`).
- Reutilizar Resend (`lib/email/*`) y/o el setup de WhatsApp Cloud API ya existente
  (ver memoria `whatsapp-campaign-setup`).
- Tabla `session_reminders` para idempotencia (no reenviar el mismo recordatorio).

## Preguntas abiertas (para dirección / antes de implementar)

1. Detalle de las 4 clases extra de los martes (Capital Inteligente): temas, docentes, horarios.
2. ¿Alertas por email, WhatsApp, o ambos? ¿Con cuánta anticipación (24h / 1h)?
3. ¿El editor de Paola necesita aprobar cambios o son inmediatos?
4. Esquema de evaluación/ponderación por módulo (afecta si 2 módulos bastan o hay que granular).

## Fuera de alcance de Fase 2

- Matrícula/invitación de alumnos (Fase 3, script).
- Video de bienvenida (dirección lo graba después; se integra como `lesson` privada).
