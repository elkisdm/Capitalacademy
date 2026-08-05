# ADR-0028: Perfil público del profesor

- **Status:** proposed
- **Date:** 2026-08-05
- **Deciders:** Elkis (producto/ingeniería), Paola Vicuña (dirección académica, solicitante)
- **Tags:** classroom, data-model, rls, admin

## Contexto

En la reunión del 29-jul-2026 la clienta pidió que **los alumnos puedan ver la
descripción/bio y las redes sociales del docente**. Hoy el nombre del profesor
aparece como texto plano en cuatro lugares del aula (calendario, ficha de clase
en vivo, cabecera del módulo y cabecera de la lección) y no lleva a ninguna
parte. La bio existe en la base desde la migración 0022, pero **ningún alumno la
ve nunca** y **nadie puede editarla sin escribir SQL a mano**.

Hay tres restricciones duras que condicionan el diseño:

1. **Un alumno no puede leer el `profiles` de otra persona.** La policy
   `profiles_select` (`db/migrations/0045_rls_hardening.sql:20-24`) es
   `id = auth.uid() or is_platform_staff()`. Cualquier diseño que cuelgue la bio
   o las redes de `profiles` es invisible para su propia audiencia.
2. **`instructors` sí es legible por el alumno, con scope por programa.** La
   policy `instructors_program_scoped_select`
   (`db/migrations/0059_instructors_scope.sql:25-34`) deja leer un instructor si
   quien consulta es platform staff, o si el instructor dicta al menos una
   `class_sessions` en un programa donde el consultante tiene
   `has_program_access()`. Es exactamente el scope que queremos: el alumno ve a
   sus profesores, no al catálogo completo.
3. **No existe ningún CRUD de `instructors`.** El único punto de contacto en
   admin es el `<select>` de asignación de docente por sesión
   (`app/(admin)/admin/cohorts/[cohortId]/sesiones/sessions-manager-client.tsx`).
   El alta y la edición se hacían por SQL.

### La dualidad: hay DOS fuentes de "profesor"

Este es el punto más delicado del frente y conviene dejarlo escrito, porque no
es obvio leyendo el código:

| Fuente | FK | Dónde se pinta hoy | ¿Legible por el alumno? |
| --- | --- | --- | --- |
| `class_sessions.teacher_id` | → `public.instructors` | Calendario, tarjetas de clase del módulo, ficha de clase en vivo | Sí, vía `instructors_program_scoped_select` |
| `program_modules.teacher_id` | → `public.profiles` | Card "Profesor" del módulo, chip de instructor de la lección | **No**: solo se ve porque `lib/classroom/queries.ts` lo trae con un embed `profiles!program_modules_teacher_id_fkey(full_name)` |

El embed del módulo funciona hoy porque PostgREST resuelve el join en el
servidor y la policy de `profiles` se evalúa sobre la fila embebida —
devolviendo `null` cuando el alumno no puede verla. Es decir: **la card
"Profesor" del módulo ya es frágil** y depende de una relación que la RLS puede
apagar en cualquier momento. No es un problema que este frente cause, pero sí
uno que este frente no debe empeorar.

## Decisión

**1. La fuente de verdad del perfil docente es `public.instructors`.** Las
columnas nuevas (`headline`, `linkedin_url`, `instagram_url`, `website_url`) se
agregan ahí en `db/migrations/0086_instructors_perfil_publico.sql`, junto a la
`bio` y la `photo_url` que ya existían. No se toca `profiles`: sería el lugar
"natural" en un modelo genérico, pero es el único lugar donde el dato queda
ilegible para quien lo pidió.

**2. "Público" significa "visible para el alumno autenticado", no expuesto a
internet.** La RLS exige `has_program_access()`, así que la pantalla vive dentro
del grupo `(classroom)`, en
`/classroom/[cohortSlug]/docente/[instructorId]`, detrás del mismo
`getClassroomAccess` que el resto del aula. Una página realmente abierta a
internet es una feature distinta (ver "Opciones consideradas / Opción C"): no se
construye en este frente.

**3. Las URLs se validan en tres capas.** Terminan en el `href` de un `<a>` que
ve el alumno, así que un `javascript:` cargado por error es XSS al clic:
- **BD:** CHECK `^https://…` por columna (migración 0086). Es la capa que sigue
  en pie cuando alguien escribe por SQL a mano — que es como se administraba
  esta tabla hasta hoy.
- **Escritura:** zod en `PATCH /api/admin/instructors/[instructorId]`, con
  normalización previa (`linkedin.com/in/x` → `https://linkedin.com/in/x`).
- **Render:** `buildSocialLinks()` en `lib/instructors/social.ts` descarta
  cualquier URL que no sea `https://` antes de emitir el enlace.

**4. La card "Profesor" del módulo se enlaza por puente `profile_id`, sin
migrar nada.** Se resuelve `program_modules.teacher_id` (un `profiles.id`) a una
fila de `instructors` con `instructors.profile_id = <ese id>`. Si la resolución
devuelve un instructor, el nombre se vuelve enlace al perfil; si no, se pinta
igual que hoy, en texto plano. Sin migración de datos, sin cambiar la FK, sin
romper nada, y la degradación es silenciosa y digna.

Se descartó explícitamente la alternativa de **unificar las dos fuentes**
(migrar `program_modules.teacher_id` para que apunte a `instructors`): es un
cambio de modelo de datos con backfill, tocaría el CRUD de módulos y el panel
docente, y no es lo que la clienta pidió. Queda anotado como deuda: *si algún
día se toca `program_modules.teacher_id`, el destino correcto es `instructors`,
no `profiles`.*

**5. CRUD admin mínimo en `/admin/docentes`.** Editar `headline`, `bio` y las
tres redes de un instructor existente. No incluye crear ni borrar instructores:
el alta sigue viniendo del seed/SQL, y borrar un instructor con sesiones
asignadas es una operación de datos que no corresponde a esta pantalla. Sin este
CRUD la feature no es usable por la clienta, que es la razón por la que entra en
el alcance.

## Opciones consideradas

### Opción A — Redes en `profiles`, leídas por el alumno vía una vista o RPC
- Pros: un solo lugar para "los datos de una persona"; `profiles` ya tiene
  `bio`, `job_title` y `linkedin_url` desde el onboarding.
- Contras: requiere abrir un camino de lectura nuevo (vista `security_invoker`,
  RPC `SECURITY DEFINER`, o relajar `profiles_select`) sobre la tabla con **toda
  la PII de los alumnos** — teléfono, RUT, dirección, contacto de emergencia. La
  megaauditoría v1 ya marcó la RLS de PII como bloqueante; volver a tocarla para
  mostrar un LinkedIn es un intercambio pésimo. **Descartada.**

### Opción B — Redes en `instructors` (elegida)
- Pros: la RLS correcta ya existe y está scoped por programa; es el catálogo
  dedicado a docentes; no se toca ninguna tabla con PII de alumnos; el CHECK de
  URL cabe naturalmente.
- Contras: convive con `program_modules.teacher_id → profiles` (la dualidad
  descrita arriba); un docente que solo dicta módulos grabados y ninguna sesión
  en vivo no es visible bajo la policy de 0059, así que su perfil no se enlaza.

### Opción C — Página realmente pública (sin login), tipo `/profesores/[slug]`
- Pros: sirve para marketing y SEO; enlazable desde fuera.
- Contras: **no es lo que se pidió** ("que los alumnos puedan ver…"), exige
  decidir consentimiento del docente, un `slug` estable, y un camino de lectura
  anónimo sobre `instructors` que hoy no existe (la anon key no pasa la policy).
  La landing ya cubre la necesidad de marketing con `lib/landing/team.ts`, un
  array estático curado. **No se construye.** Si la clienta la quiere, es un
  frente aparte y este ADR es su punto de partida.

### Opción D — Unificar las dos fuentes de docente en una migración
- Pros: elimina la dualidad de raíz.
- Contras: backfill de `program_modules.teacher_id`, cambio de FK, impacto en el
  CRUD de módulos y en `lib/docente/queries.ts`. Riesgo alto y fuera de pedido.
  **Aplazada** (ver Decisión §4).

## Consecuencias

### Positivas
- La bio que ya existía en la base desde hace meses por fin llega al alumno.
- Ops puede editar el perfil docente sin abrir un cliente SQL.
- El nombre del profesor deja de ser texto muerto en cuatro pantallas.
- El aislamiento entre entornos se mantiene sin código nuevo: la policy de 0059
  es la que decide, y un alumno del Programa de Liderazgo no puede ver el perfil
  de un docente que solo dicta en el Diplomado.

### Negativas
- Un docente puede terminar con datos en dos lugares (`profiles.bio` desde el
  onboarding y `instructors.bio` desde admin) sin sincronización entre ambos. Se
  acepta a conciencia: son audiencias distintas (perfil personal vs. ficha
  docente) y unificarlos exige la Opción A, ya descartada.
- La dualidad `instructors` / `program_modules.teacher_id` sigue viva, ahora con
  un puente `profile_id` que hay que recordar que existe.

### Riesgos
- **Instructor sin sesiones en vivo:** la policy de 0059 lo hace invisible para
  el alumno. La pantalla responde `notFound()` (no filtra existencia) y los
  enlaces simplemente no se pintan. Es correcto pero puede leerse como bug si
  alguien carga una bio y no la ve aparecer; queda documentado en el CRUD admin.
- **`profile_id` duplicado:** nada impide dos filas de `instructors` con el
  mismo `profile_id` (`lib/docente/queries.ts` ya deduplica por ese caso). El
  puente del módulo toma la primera coincidencia activa de forma determinista
  (orden por `created_at`), no una al azar.
- **Migración no aplicada:** 0086 se entrega como archivo versionado y **no** se
  aplicó a ninguna base. Hasta aplicarla, las columnas nuevas no existen y tanto
  la pantalla como el CRUD fallan al leerlas.

## Referencias

- `db/migrations/0022_seed_diplomado_g4.sql` — creación de `instructors`.
- `db/migrations/0045_rls_hardening.sql` — `profiles_select` restringido a la
  fila propia.
- `db/migrations/0059_instructors_scope.sql` — `instructors_program_scoped_select`.
- `db/migrations/0086_instructors_perfil_publico.sql` — esta decisión.
- [ADR-0004](0004-modelo-permisos-rbac-por-cohorte.md) — RBAC por cohorte.
- [ADR-0008](0008-entorno-diplomado-y-calendario-de-sesiones.md) — origen del
  catálogo `instructors` y de `class_sessions.teacher_id`.
- [ADR-0013](0013-panel-docente-y-acceso-cohort-staff.md) — acceso del docente
  real, que vive en `cohort_roles` y no en `instructors`.
