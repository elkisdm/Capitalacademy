# ADR-0013: Panel del profesor y acceso staff-preview por cohort_roles

- **Status:** proposed
- **Date:** 2026-07-10
- **Deciders:** Eduardo (producto/dev)
- **Tags:** rbac, classroom, panel-docente

## Contexto

El rol "docente" con capacidad de login **no existe** como `profiles.system_role`
(el enum de `0007` es solo `user | ops | admin`); el docente vive en
`cohort_roles.role = 'teacher'` (o `'assistant'`), por cohorte. Hoy un docente puro
(sin matrícula, `system_role='user'`) está totalmente bloqueado:

- El layout `(admin)` lo redirige a `/classroom` (solo `ops`/`admin`).
- `requireStaff()` en las APIs de asistencia/recursos solo deja pasar `ops`/`admin`;
  la rama `'teacher'` es código muerto porque nunca existe ese `system_role`.
- `getClassroomAccess` lo rechaza (ni matrícula ni `system_role` admin/ops).
- `has_program_access` (RLS de Conversaciones, ADR-0010) no lo incluye: un docente
  sin matrícula no lee ni postea en el feed de su propio programa.

Se necesita un panel dedicado donde el docente pueda ver sus clases, marcar
asistencia y subir material, sin exponerle administración global ni la de otros
entornos.

## Decisión

1. **Panel dedicado en `/docente`** (route group `app/(docente)/`, layout propio sin
   `ClassroomSidebar`): evita filtrar la navegación de admin (Usuarios, Cobros,
   Lecciones, Quizzes, Progreso) o la de alumno. Gate: platform staff (ops/admin) O
   cualquier fila en `cohort_roles` con rol `teacher`/`assistant`.
2. **Gate por-sesión `requireSessionStaff(sessionId)`** reemplaza `requireStaff()` en
   las APIs de asistencia (`/api/admin/sessions/[sessionId]/attendance`) y de
   recursos (`/api/admin/session-resources*`). Autoriza a platform staff O a
   teacher/assistant de la cohorte **específica** de esa sesión — acotado, no global.
3. **`getClassroomAccess`** se amplía: además de matrícula y `system_role`
   admin/ops, un `cohort_roles` teacher/assistant de esa cohorte obtiene acceso
   staff-preview (`{ enrollment: null, isStaff: true }`). Esto habilita al docente a
   entrar a Conversaciones y al resto del classroom de SU cohorte en modo
   previsualización, coherente con el modelo staff-preview de ADR-0004.
4. **`has_program_access`** (migración `0057`) se redefine para incluir
   `is_program_staff(program_id)` (que ya cubre platform staff + cohort
   teacher/assistant desde `0044`), además del alumno matriculado. Así el docente
   lee y participa en el feed de Conversaciones de su programa sin necesitar
   matrícula.

## Opciones consideradas

### Opción A — Panel dedicado + gates ampliados (elegida)
- **Pros:** cero exposición de administración global; el docente ve exactamente lo
  suyo (sus cohortes, sus sesiones); reusa componentes existentes
  (`SessionAttendancePanel`, `SessionResourcesPanel` extraído) sin duplicar lógica.
- **Contras:** agrega una tercera superficie de autorización (`requireSessionStaff`)
  junto a `requireStaff`/`authorizeAdmin`.

### Opción B — Agregar `'teacher'` a `profiles.system_role`
- **Pros:** reusaría `requireStaff` tal cual (la rama `'teacher'` ya existe, muerta).
- **Contras:** `system_role` es global de plataforma, no por cohorte; un docente de
  la cohorte A vería el panel admin completo y (sin filtros adicionales) datos de
  otras cohortes. Requeriría reconstruir el aislamiento por cohorte encima de un rol
  que no lo modela. Se descarta: el modelo correcto ya existe en `cohort_roles`.

## Consecuencias

### Positivas
- Docente puro puede operar (asistencia, material, conversaciones) sin necesitar
  `system_role` especial ni matrícula.
- Autorización más ajustada que antes: `requireSessionStaff` verifica la cohorte
  exacta de la sesión, no "es staff en general".

### Negativas / límites explícitos
- El docente **no ve** administración global: usuarios, cobros, entornos, CRUD de
  sesiones (crear/editar/borrar sigue en `requireStaff`, solo ops/admin).
- `getClassroomAccess` ampliado da al docente acceso staff-preview a **todo** el
  classroom de su cohorte (lecciones/videos), no solo a asistencia/recursos/
  conversaciones. Es más amplio que "solo el panel", pero coherente con el modelo
  staff-preview existente.
- Sin aplicar la migración `0057` a prod, Conversaciones queda vacío para el
  docente (RLS lo filtra) aunque la página cargue; asistencia y recursos SÍ
  funcionan de inmediato porque no dependen de esa migración.
- Descubrimiento: un docente puro que cae en `/classroom` ve "sin matrícula activa";
  el único punto de entrada al panel es el link "Panel docente" del sidebar. Un
  redirect automático post-login queda fuera de este ciclo (follow-up).

### Riesgos
- Redefinir `has_program_access` afecta las policies de Conversaciones (threads,
  comments, reactions, bookmarks, notifications) porque es su único punto de uso
  (`0044`). Es el efecto buscado.

## Seguimiento (2026-07-21)

`getTeacherCohorts` (`lib/docente/queries.ts`) ahora es la unión de (a)
`cohort_roles` teacher/assistant (esta ADR, otorga escritura) y (b) instructor
asignado vía `instructors.profile_id` → `class_sessions.teacher_id` (solo
visibilidad, sin escritura — los guards `requireSessionStaff`/
`requireEvaluationStaff` siguen mirando solo `cohort_roles`). Motivo: un
platform staff con ficha en `instructors` pero sin `cohort_roles` entraba al
panel (gate de este ADR) y lo veía vacío. Convertir `instructors` en fuente de
permisos de escritura queda fuera de alcance — requiere su propio ADR.

## Referencias

- `db/migrations/0007_rbac_cohort_roles.sql` (`cohort_roles`, `is_cohort_staff`,
  `has_cohort_access`).
- `db/migrations/0044_conversaciones.sql` (`has_program_access`, `is_program_staff`).
- `db/migrations/0057_teacher_panel.sql` (esta migración).
- ADR-0004 (RBAC / staff-preview), ADR-0010 (Conversaciones por programa).
