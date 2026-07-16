# Brief — Evaluaciones y notas 1-7 (v1) · Tier 3

> Estado: **revisado — pendiente de ejecución** · Fecha: 2026-07-15 · Origen: reunión con la
> profe (Paola), 15-jul-2026
> Nota: este documento fue contrastado contra la transcripción literal de la reunión por una
> revisión independiente; las correcciones resultantes quedan marcadas inline como
> `> **Corregido/Agregado tras revisión (15-jul):**` para que se distingan del plan original.

## Objetivo declarado

Introducir la **nota chilena 1-7 por alumno** como entidad de primera clase: extender
`evaluations` con tipo (`quiz` | `manual`), crear la tabla de notas `evaluation_grades`
(+ checklist parametrizable), y entregar la **pantalla de notas consolidada del alumno**
y el **panel de calificación del profe** — sin tocar `deliverables`, sin cálculo automático
de nota final, y sin romper certificados ni los quizzes ya rendidos.

## 0. Hallazgos del repo (descubiertos por el planner, no venían en el brief)

### 0.1 Las columnas de la escala 1-7 YA EXISTEN y están muertas
`db/migrations/0001_init_core.sql:30-40`:
- `programs.passing_grade numeric(3,1) default 4.0` — escala 1-7, NUNCA leída por código
- `programs.min_attendance_pct int not null default 85` — habilitante, NUNCA leída por código

Verificado con grep: solo aparecen en `lib/supabase/types.ts` y en los seeds
(`0022_seed_diplomado_g4.sql:58` → `2, 4.0, 85`; `0043_seed_liderazgo.sql:30` → `4, 4.0, 75`).
Cero lecturas en `.ts`/`.tsx`. Columnas dormidas del diseño original.

**Consecuencia:** NO crear columnas nuevas para "nota mínima 1-7" ni "asistencia habilitante".
Reusar estas dos. El único config nuevo que falta es la **exigencia**.

### 0.2 La regla %→nota es la escala chilena estándar con exigencia 60%
~~La profe dio dos datapoints~~ **Camila dio dos datapoints** (ver corrección A5 más abajo):
90% → 6.3 y 80% → 5.5. La fórmula lineal chilena estándar
(mín 1.0, aprobación 4.0 en la exigencia, máx 7.0) los reproduce EXACTAMENTE con exigencia 60%:

```
pct <  E:  nota = 1 + 3 * (pct / E)
pct >= E:  nota = 4 + 3 * ((pct - E) / (100 - E))

E=60 → 90% → 4 + 3*(30/40) = 6.25 → redondeo 1 decimal = 6.3  ✓
E=60 → 80% → 4 + 3*(20/40) = 5.50 → 5.5                        ✓
E=60 → 60% → 4.0 ✓   0% → 1.0 ✓   100% → 7.0 ✓
```

> **Corregido tras revisión (15-jul) — A5:** §0.2 atribuía estos dos datapoints a la profe.
> Es incorrecto: fueron dados por **Camila** (8:35, "Capital Academy"): *"yo lo calculé acá con
> la escala de notas y un 90% es un 6.3, un 80% es 5.5, y así bajando"*. La inferencia de
> exigencia 60% se sostiene (y "así bajando" respalda la linealidad), pero la fuente es el
> **Excel de Camila**, no una definición de la profe. **Añadido: B1 debe validarse contra ese
> Excel antes de sellar el candado de tests del Paso 3.**

**Trampa crítica:** la exigencia NO es `evaluations.passing_grade_pct` (default 70,
`0033_evaluations.sql:29`). Ese campo es el umbral de `passed` booleano del quiz (otro eje).
Con 70 como exigencia, 90% → 6.0 ≠ 6.3 y contradice a la profe. Son dos parámetros distintos.

### 0.3 `program_modules.weight numeric(5,2)` ya existe (puerta a la v2), sin uso en código.

### 0.4 El índice único bloquea el modelo del módulo práctico
`0033_evaluations.sql:55-57`:
```sql
create unique index evaluations_one_active_per_module
  on public.evaluations (module_id) where scope = 'module' and is_active;
```
El módulo práctico ("Metodología comercial") necesita 3 evaluaciones activas
(~~roleplay 25%, roleplay 50%~~ **dos notas, 25% y 50%** — identidad de los componentes sin
confirmar — **+ guión de venta 25%**), todas `scope='module'`. **Rompe el día 1.**

> **Corregido tras revisión (15-jul) — A4:** el plan original rotulaba las dos primeras notas
> como "roleplay 25%" y "roleplay 50%". Eso es una invención: lo que dijo Paola (5:44) es
> *"va a haber una nota de metodología comercial... esa se va a componer de dos notas, una nota
> al 25, otra al 50, y el guión de venta al 25"* — **nunca dijo que las dos primeras fueran
> ambas roleplay**. En 12:49 menciona *"Esto es roleplay y el de mentalidad"*, lo que sugiere
> que los dos componentes podrían ser roleplay y mentalidad, pero no está confirmado.
> **No hardcodear nombres de componentes en UI ni en seeds** — usar labels genéricos o
> editables ("Nota 1 (25%)", "Nota 2 (50%)") hasta que la profe confirme la identidad.

### 0.5 El guard de activación bloquea evaluaciones manuales
`app/api/admin/evaluations/[evaluationId]/route.ts:94-105` rechaza activar una evaluación
sin preguntas. Un roleplay (`kind='manual'`) nunca tendrá preguntas → jamás se podría activar.
Mismo problema client-side en `components/admin/quiz/evaluation-panel.tsx:89-93`.

### 0.6 `lib/supabase/types.ts` es generado y tipa AMBOS clientes
Si agregas tablas y no actualizas `types.ts`, `.from("evaluation_grades")` no compila
y `next build` falla. Gotcha #1 del frente.

### 0.7 `authorizeAdmin()` NO deja calificar al profe
`lib/auth/authorize-admin.ts:29` exige `system_role in ('ops','admin')`. La profe real vive
en `cohort_roles` (rol `teacher`). Patrón vigente a espejar: `requireSessionStaff(sessionId)`.

### 0.8 Helpers de RLS disponibles
- `is_platform_staff()` — `0007_rbac_cohort_roles.sql:68`
- `is_cohort_staff(uuid)` — `0007_rbac_cohort_roles.sql:123`
- `is_program_staff(uuid)` — `0044_conversaciones.sql:17`
- `has_program_access(uuid)` — `0057_teacher_panel.sql:13`
- Patrón de helper scoped a entidad: `0065_lesson_comments_hardening.sql:24-37`

### 0.9 Otros
- `class_sessions.module_id` existe (`0001:113`, nullable)
- `DELETE /api/admin/evaluations/[id]` ya bloquea si hay intentos (`route.ts:141-151`)
- `enrollments` unique `(cohort_id, student_id)` → `enrollment_id` es el ancla natural
- Tests: vitest, `pnpm test`. UI sin shadcn/Radix.

## 1. Decisiones de modelo

### Ya decidido (cerrado)
| Decisión | Justificación |
|---|---|
| **`evaluations` se EXTIENDE. NO nace tabla nueva de evaluación.** | Ya es el contenedor genérico con 4 scopes, RLS, CRUD admin y UI completa. La "entidad Evaluaciones nueva" del brief ES esta tabla, que hoy solo sabe ser quiz. Falta el **tipo** y las **notas**. |
| **Nace `evaluation_grades` (nota por alumno), anclada en `enrollment_id`.** | Las notas son por alumno Y por cohorte; `evaluations` es program-scoped. `enrollment_id` resuelve ambos. Patrón vigente de `quiz_attempts.enrollment_id`. |
| **`deliverables` queda INTACTO.** | Decisión de negocio de la profe. |
| **Escala 1-7: función TS única, sin función SQL, sin tabla de escala.** | Fórmula de 4 líneas. Vive en `lib/grades/scale.ts`, testeada. |
| **La nota se ALMACENA (no se deriva).** | Registro académico = snapshot inmutable. Las notas manuales no tienen `pct` del cual derivar. |
| **Asistencia = carril separado.** Reusa `programs.min_attendance_pct`. Nunca entra en `evaluation_grades`. | Decisión de negocio explícita. |
| **Checklist: tabla de definición + snapshot jsonb en la nota.** | `evaluation_criteria` parametrizable; marcado snapshoteado en `evaluation_grades.criteria_marks jsonb` para que editar el checklist después NO reescriba el historial. |

> **Corregido tras revisión (15-jul) — A9:** la atribución de "`deliverables` queda INTACTO —
> decisión de negocio de la profe" es correcta (verificado: Elkis propuso fusionar en 27:37,
> Paola objetó en 28:52 — *"me quitas la oportunidad de tener un espacio... yo no voy a evaluar
> este guión de venta"* — y Elkis cedió en 29:32: *"Ya, tiene sentido"*). Pero ella cerró con
> *"lo podemos dejar como al inicio. Dejémoslo **todavía** como ahí"* (29:33) → es
> **provisional, no doctrina**. El ADR-0016 (Paso 10) no debe sellarlo como decisión permanente.

### Decisiones de negocio PENDIENTES (defaults recomendados)
| # | Pregunta | Default recomendado |
|---|---|---|
| **B1** | ¿Exigencia 60% para todos los programas? | **Sí, 60%.** Columna `programs.grade_exigencia_pct` default 60. *(Validar contra el Excel de Camila antes del candado de tests del Paso 3 — ver corrección A5.)* |
| **B2** | `min_attendance_pct` seeded en 85 (Diplomado) y 75 (Liderazgo), pero la profe dijo 80. ¿Se corrige? | ~~**NO tocar el dato.** Política académica con alumnos matriculados. Mostrar el valor real y que la profe lo cambie.~~ → **Corregido: default pasa a 80** (ver A1 abajo), con confirmación explícita de la profe, o no mostrar umbral hasta confirmarlo. **Nunca mostrar "mínimo 85%" a los alumnos.** |
| **B3** | ¿La nota se publica al instante o hay borrador? | **Borrador + publicar.** Columna `published_at` nullable; el alumno solo ve `published_at is not null`. Las notas de quiz se auto-publican. |
| **B4** | Con varios intentos de quiz, ¿qué nota vale? | **El mejor intento completado.** La app ya dice "Mejor nota" (`evaluation-runner.tsx:165`). |
| **B5** | Nombre del tipo (el brief dice "quiz \| otro"). | **`'quiz' \| 'manual'`** en BD; UI rotula "Quiz" / "Nota manual". |

> **Corregido tras revisión (15-jul) — A1:** el default original de B2 ("NO tocar el dato...
> política académica con alumnos matriculados") está mal fundado: el propio §0.1 de este
> documento demuestra que `programs.min_attendance_pct` **nunca fue leída por código** → el 85
> es un default dormido del seed, no política vigente. El único número dicho por quien decide
> es **80%** (7:16, Paola: *"La asistencia tiene que ser sobre un 80% para poder aprobar, o sea
> es un requisito habilitante"*). Nuevo default de B2: **80**, con confirmación explícita de la
> profe, o no mostrar umbral hasta confirmarlo. **Nunca mostrar "mínimo 85%" a los alumnos.**
> Ver también el ajuste al Paso 6 más abajo.

> **Agregado tras revisión (15-jul) — A10:** B3 (borrador/publicar con `published_at`) y B4
> (mejor intento) **no aparecen en ninguna parte de la reunión**; en 12:49 Paola describe poner
> la nota directamente (*"después yo misma tengo que ir a ponerle nota ahí mismo"*). Son
> decisiones de producto razonables y el plan ya las declara "pendientes" (recomendación del
> ejecutor) — pero **nadie debe presentárselas a la clienta como "lo que pediste"**, y **B3
> agrega un paso al flujo de la profe que ella no pidió** (borrador → publicar, en vez de nota
> directa).

## 2. Pasos

### Paso 1 — Migración `0070_evaluation_grades.sql` (NO aplicar a prod)
1. `evaluations.kind text not null default 'quiz'` + CHECK `in ('quiz','manual')`
2. `evaluations.weight_pct numeric(5,2)` (v1 solo captura y muestra; el cálculo es v2)
3. Acotar los 3 índices únicos parciales a `and kind = 'quiz'` (fix de §0.4).
   `evaluations_one_final_per_program` NO se toca.
4. `programs.grade_exigencia_pct int not null default 60` CHECK between 1 and 99
5. `evaluation_criteria` (id, evaluation_id, position, label, unique(evaluation_id,position))
6. `evaluation_grades`:
   - `evaluation_id`, `enrollment_id`, unique `(evaluation_id, enrollment_id)`
   - `grade numeric(2,1)` CHECK 1.0–7.0
   - `score_pct numeric(5,2)` nullable (NULL en notas puramente manuales)
   - `source text default 'manual'` CHECK in ('manual','quiz','import')
   - `quiz_attempt_id`, `feedback text` (max 4000)
   - `criteria_marks jsonb default '[]'` CHECK `jsonb_typeof = 'array'`
     forma: `[{"criterion_id": uuid, "label": text, "checked": bool}]`
   - `graded_by`, `graded_at`, `published_at` nullable, timestamps
7. Helpers `is_evaluation_staff(uuid)` / `has_evaluation_access(uuid)`
8. RLS:
   - criterios: select con `has_evaluation_access`; staff all con `is_evaluation_staff`
   - notas alumno: `published_at is not null` AND es su enrollment
   - notas staff: `is_platform_staff()` OR `is_cohort_staff(e.cohort_id)`
     **DESVIACIÓN DELIBERADA**: se usa `is_cohort_staff` (cohorte) y no `is_program_staff`
     (programa) — un docente de G4 no debe leer notas de G5.
   - **NO hay policy de INSERT/UPDATE para el alumno.**

### Paso 2 — `lib/supabase/types.ts` (a mano o CLI)

### Paso 3 — `lib/grades/scale.ts` + tests (CANDADO)
`pctToGrade`, `gradeToPct`, `formatGrade`, `isPassing`, `averageGrade`.
Tests obligatorios: `pctToGrade(90) === 6.3` y `pctToGrade(80) === 5.5`.
**Si fallan, DETENERSE**: la fórmula o la exigencia están mal.

### Paso 4 — API de notas (staff/profe)
- `requireEvaluationStaff(evaluationId)` nuevo en `lib/auth/authorize-admin.ts` (fix §0.7)
- `app/api/admin/evaluations/[evaluationId]/grades/route.ts`
  - GET `?cohortId=` → roster (incluye alumnos SIN nota, grade null)
  - **Chequeo de tenant OBLIGATORIO**: `cohorts.program_id === evaluation.program_id` → 422
  - usar `.in("status", ["active","completed"])`, NO `.eq("status","active")`
  - PUT → upsert nota (zod: grade 1–7, feedback, criteriaMarks, publish)
  - POST `?action=publish` → publica todas
- `app/api/admin/evaluations/[evaluationId]/criteria/route.ts` → CRUD del checklist

### Paso 5 — Notas de quiz: escritura en submit + backfill
- `lib/grades/sync-quiz-grade.ts` — mejor intento completado (B4), idempotente, best-effort
  (si falla NO revienta el submit), auto-publica.
- Inserción 1: `app/api/classroom/evaluation/submit/route.ts` tras el cierre atómico
- Inserción 2: `app/api/classroom/quiz/submit/route.ts` (final) — **romperá tests**, actualizar mocks
- `scripts/backfill-quiz-grades.mts` con `--dry-run`, idempotente
- Rollback: `delete from evaluation_grades where source='quiz';`

> **Corregido tras revisión (15-jul) — A6 (la corrección más importante de este documento):**
> ver el detalle completo en la fila R13 de la sección 3 (Riesgos) y en el Orden de ejecución
> (sección 5). En resumen: **el fix del quiz "dominio de crédito" (R13) es precondición
> bloqueante de este Paso 5**, no un ítem "fuera del plan" independiente. Si el backfill corre
> antes de corregir el quiz, convierte puntajes potencialmente corruptos en notas 1-7 oficiales
> y publicadas.

### Paso 6 — Pantalla de notas del alumno (LO MÁS URGENTE)
- `lib/grades/queries.ts` → `getStudentGrades(cohortId, userId)` con cliente RLS (no admin)
- Agrupación por módulo, no trivial (4 scopes):
  | scope | módulo |
  |---|---|
  | `lesson` | `lessons.module_id` |
  | `module` | directo |
  | `session` | `class_sessions.module_id` (**nullable** → "Otras evaluaciones") |
  | `final` | sin módulo → grupo "Evaluación final" |
- `app/(classroom)/classroom/[cohortSlug]/notas/page.tsx` (copia estructura de `entregables/page.tsx`)
- `components/classroom/grades/grades-view.tsx`
  - **Promedio SIMPLE por módulo, sin ponderar** (v1). Rotular "Promedio de tus evaluaciones
    calificadas" — NUNCA "Nota del módulo" ni "Nota final".

    > **Corregido tras revisión (15-jul) — A7:** este promedio simple es fiel para el módulo
    > teórico (5:44: *"el promedio de esas notas va a reflejar un porcentaje"*), pero **no**
    > para el módulo práctico: Paola describió una composición ponderada 25/50/25 (ver
    > corrección A4), nunca un promedio — un promedio simple ahí da un número distinto al que
    > ella ya comunicó a los alumnos, y el rótulo mitiga poco porque lo van a leer como su nota.
    > **Corrección: suprimir el promedio en módulos que tengan evaluaciones con `weight_pct`
    > presente, y listar solo las notas individuales.** Mantener el promedio solo donde no hay
    > ponderación.

  - Carril de asistencia VISUALMENTE SEPARADO: "Requisito de asistencia: X% (mínimo N%).
    No afecta tus notas." N sale de `programs.min_attendance_pct`, no hardcodeado en 80.

    > **Corregido tras revisión (15-jul) — A1:** si `programs.min_attendance_pct` sigue en 85
    > (Diplomado) o 75 (Liderazgo) al momento de construir esta pantalla, **no mostrar ese valor
    > a los alumnos** — mostrar el requisito solo si el valor fue confirmado/corregido a 80 por
    > la profe, o no mostrar el umbral numérico en absoluto (mostrar solo "cumples / no cumples
    > el requisito de asistencia").

- Sidebar: ítem "Notas" entre Entregables y Conversaciones. Icono `chart` ya existe.
  NO gatearlo — la pantalla debe existir siempre.

### Paso 7 — Admin/profe
- 7a. Desbloquear manuales: guard de activación salta si `kind='manual'` (server + cliente).
  DELETE bloquea también si hay **notas** (409).
- 7b. `kind` y `weight_pct` en POST de creación. Default `'quiz'` → crear un quiz autogenera
  su evaluación sin cambiar llamadores. **`kind` NO editable tras la creación.**
- 7c. Tipos del cliente (`Evaluation.kind`, `weight_pct`, `EvaluationCriterion`, `CriterionMark`, `GradeRow`)
- 7d. Pestaña "Notas" en `evaluation-panel.tsx`; tabs condicionales al kind.
  `components/admin/quiz/evaluation-grades.tsx`: selector de cohorte OBLIGATORIO,
  tabla alumno|nota|comentario|checklist|estado, "Guardar borrador"/"Guardar y publicar",
  "Publicar todas", sub-sección de criterios.
- 7e. Selector de tipo al crear; botón "+ Nota manual" por módulo (varias por módulo).

  > **Corregido tras revisión (15-jul) — A3 (pregunta de diseño ABIERTA, no resuelta aquí):**
  > este paso asume `scope='module'` para el roleplay. Pero el roleplay **es una lección
  > calendarizada** del módulo 2 (Paola la recorre en 19:15–20:50), así que su evaluación
  > encajaría en `scope='lesson'` (ver Paso 7f / corrección A2). Si los 3 componentes del módulo
  > práctico son 2 lecciones (roleplay, y posiblemente "mentalidad") + 1 entregable (guión de
  > venta), entonces `scope='lesson'` podría bastar y el fix del índice único
  > `evaluations_one_active_per_module` (§0.4, Paso 1.3) sería innecesario para este caso
  > puntual. **No se resuelve aquí** — queda como pregunta de diseño abierta para el
  > ejecutor/dirección. El fix del índice (acotarlo a `kind='quiz'`) se mantiene en el plan de
  > todas formas: es barato e inocuo en cualquier escenario porque preserva la semántica
  > actual, independiente de cómo se resuelva el scope.

- 7f. **Vía de creación "desde la lección"** (toggle en la creación/edición de lección):
  al crear o editar una lección, mostrar un toggle "¿Esta lección tiene evaluación?"; si se
  activa, permite crear la evaluación (`kind='manual'` o `'quiz'`, `scope='lesson'`) asociada
  a esa lección desde el mismo formulario, sin pasar por el panel de evaluaciones independiente.

  > **Agregado tras revisión (15-jul) — A2:** el plan original solo cubría dos de las tres
  > vías de creación que Elkis enumeró en el recap (30:26): *"Las evaluaciones se pueden crear
  > desde la lección, o se pueden crear de forma independiente, o se pueden crear
  > automáticamente a partir del quiz."* Faltaba la primera, descrita en 18:39 (*"cuando se
  > crea una nueva lección, habilitar un toggle... ¿esta lección tiene evaluación? Y si se
  > confirma que sí, se puede crear la evaluación ahí mismo"*) y 20:50 (*"independiente del
  > tipo de lección, al crearla se puede marcar la opción de esta lección tiene
  > evaluación"*). Es justo la vía que Paola visualizó para el roleplay (19:15–20:50: *"aquí
  > es donde me tendría que meter yo como profe, a colocar la nota de los alumnos"*).

### Paso 8 — Import de notas desde Excel
- `components/admin/quiz/grades-import-modal.tsx` — COPIAR el esqueleto de
  `csv-import-modal.tsx`, NO refactorizarlo a genérico.
- Parser: `XLSX.read(buffer, {type:"array"})` con `import("xlsx")` dinámico.
  **Gotcha: `XLSX.readFile` roto en ESM en este repo.**
- Columnas: `email` (clave de match), `nota` (acepta `6,3` → `.replace(",",".")`),
  `porcentaje` (alternativa), `comentario`.
- **Match por EMAIL, nunca por RUT** — ADR-0015 eliminó la unicidad global del RUT.
- Estados: valid | not_found | invalid | overwrite (ámbar, des-seleccionado por defecto)
- `app/api/admin/evaluations/[evaluationId]/grades/bulk/route.ts` — resuelve email→enrollment
  DENTRO de la cohorte indicada (nunca global).

### Paso 9 — Rename "Quiz" → "Evaluación" (solo copy)
- `sessions-manager-client.tsx:693` `title="Quiz de la clase"` → `"Evaluación de la clase"`
- `sessions-manager-client.tsx:694` subtitle
- `app/(admin)/admin/lessons/[lessonId]/page.tsx:180` subtitle
- `page.tsx:178` YA dice "Evaluación de la clase" — no tocar
- **NO renombrar la ruta `/admin/quizzes`** (rompe bookmarks). Label del sidebar sí.

### Paso 10 — ADR-0016 `0016-evaluaciones-con-nota-1-7-y-escala-chilena.md`
Debe registrar: contexto, decisión, opciones descartadas (evolucionar deliverables — descartada
por negocio; tabla de escala; nota derivada), consecuencias, relación con ADR-0007
(certificación NO cambia en v1) y ADR-0015 (match por email), desviación de RLS.

> **Agregado tras revisión (15-jul) — A11:** dos matices para el ADR-0016. (a) el checklist lo
> pidió Paola para **la evaluación final** (36:48: *"me tinca mucho poder tener ese checklist
> listo para la evaluación final, porque además va a ir de punto a cabo, de paso 1 a 15"*); este
> plan lo generaliza a toda evaluación — superset inofensivo, pero el ADR debe anotar que la
> generalización es decisión del ejecutor, no un pedido explícito. (b) en 34:44 Paola menciona
> *"los evaluadores fuimos dos o tres personas según cada grupo"* y el modelo tiene un solo
> `graded_by` — irrelevante para v1 (ella consolida), pero **el ADR no debe afirmar "un
> evaluador por nota" como regla de negocio**.

> **Agregado tras revisión (15-jul) — A9 (recordatorio):** el ADR debe registrar el carácter
> provisional de "`deliverables` queda intacto" — ver la nota en la sección 1 ("Ya decidido").

## 3. Riesgos
| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Certificados muestran % y las notas 1-7 (`app/verificar/[code]/page.tsx:383`) | **Aceptado en v1. NO tocar certificados.** Hay bypass conocido + ADR-0007 gatea por `passed`. |
| R2 | `passing_grade_pct` (70) confundido con exigencia (60) | Columna separada. Tests del paso 3 = candado. |
| R3 | Índice único bloquea módulo práctico | Paso 1. Verificar 3 manuales activas en un module_id. |
| R4 | Guard de activación bloquea manuales | Paso 7a, server + cliente. |
| R5 | `types.ts` desactualizado | Paso 2 antes que nada. |
| R6 | Fuga cross-tenant en roster de notas | Chequeo `cohorts.program_id === evaluation.program_id` en CADA endpoint con cohortId. |
| R7 | Backfill pisa notas manuales | El script excluye `source='manual'`. `--dry-run`. |
| R8 | Tests de `quiz/submit` se rompen | Actualizar mocks. |
| R9 | `enrollments.status` invited/suspended no ve notas | Consistente con el sistema. NO relajar. |
| R10 | `class_sessions.module_id` nullable | Grupo "Otras evaluaciones". |
| R11 | Coma decimal Excel chileno (`6,3`) | `.replace(",",".")`. |
| R12 | Notas visibles a medio corregir | `published_at` (B3). |
| R13 | **Quiz "dominio de crédito" con 3 respuestas correctas** | ~~**FUERA DEL PLAN — bug de DATOS.** SQL de diagnóstico provista. Corregir por UI y re-correr backfill. Los `score_pct` históricos NO se recalculan solos → decisión de negocio aparte. **Escalar, no decidir.**~~ → **Corregido: PRECONDICIÓN BLOQUEANTE DEL PASO 5.** El fix del quiz (por UI) debe ejecutarse ANTES del backfill de notas. SQL de diagnóstico se mantiene. Ver nota A6 y el Orden de ejecución (sección 5). |
| R14 | **Riesgo de expectativa**: la profe espera que la nota final ponderada / la que emite el certificado venga en esta entrega | Nadie quedó encargado de comunicarle que la nota final ponderada NO viene en v1. Dueño de esta comunicación: **pendiente de asignar**. |

> **Corregido tras revisión (15-jul) — A6 (la corrección más importante de este documento):**
> el plan original declaraba R13 "FUERA DEL PLAN — escalar, no decidir", lo cual es correcto
> como alcance (no toca la corrección del quiz en sí) **pero no ve el riesgo de secuencia que
> introduce**: el **Paso 5 hace backfill de notas desde los `score_pct` históricos**. Si el
> backfill corre antes de corregir el quiz "dominio de crédito" (3 respuestas marcadas
> correctas por pregunta, 17:15), convierte puntajes potencialmente corruptos en **notas 1-7
> oficiales y publicadas** como registro académico. **R13 pasa de "fuera del plan" a
> precondición explícita y bloqueante del Paso 5** — reflejado también en el Orden de ejecución
> (sección 5). La SQL de diagnóstico se mantiene sin cambios. Nota adicional: en 17:15 Elkis
> dijo *"esto lo tengo que corregir"* — está comprometido verbalmente pero **sin dueño
> formal**.

> **Agregado tras revisión (15-jul) — A12:** en 12:49–13:43 Paola dijo que una evaluación *"va
> a dar como la nota final o la que va a emitir el certificado final"*. La v1 (correctamente,
> ver R1) entrega promedios simples sin ponderar y no toca certificados. El riesgo (R14 arriba)
> es de negocio/expectativa, no técnico: si nadie le explica esto antes de la entrega, puede
> leer la pantalla del Paso 6 como un incumplimiento.

## 4. Qué NO hacer en v1 (scope creep explícito)
1. Cálculo automático de la nota final (v2). `weight_pct` se captura y muestra, no se calcula.
   Promedios SIMPLES por módulo. NUNCA rotular "Nota final".
2. Tocar `deliverables`. Nada de nota/feedback en `deliverable_submissions`.
3. Evaluación por video con IA.
4. Entregables grupales / evaluación grupal.
5. Reestructurar por cursos.
6. Meter la nota 1-7 en certificados (R1).
7. Renombrar la ruta `/admin/quizzes`.
8. Refactorizar `csv-import-modal.tsx` a genérico.
9. Migrar `components/admin/quiz/` de `admin/toast` a `ui/toast`.
10. Cambiar `min_attendance_pct` de 85 a 80 (B2).
11. Arreglar el quiz de dominio de crédito (R13).
12. Recalcular `score_pct` de intentos históricos.

> **Nota de consistencia (15-jul):** el ítem 10 arriba es del plan original, previo a la
> corrección A1. Tras A1, cambiar `min_attendance_pct` a 80 **sí** está dentro del alcance
> recomendado — pero solo con confirmación explícita de la profe, nunca como cambio unilateral.
> Este documento reporta la tensión en vez de resolverla por su cuenta: si la profe no confirma
> 80 antes de ejecutar, aplica el ítem 10 original (no tocar el dato) y usa la opción "no
> mostrar umbral" del Paso 6.
>
> El ítem 11 (arreglar el quiz de dominio de crédito) también queda tensionado por A6: seguir
> **fuera del plan de código** es correcto, pero ya no es un ítem inocuo de "scope creep" — es
> una precondición externa bloqueante del Paso 5 (ver R13). Mantenerlo fuera de este plan de
> código, pero escalarlo como bloqueante antes de ejecutar el Paso 5.

## 5. Orden
1. Migración 0070 (NO aplicar) → revisión manual del SQL
2. types.ts → typecheck
3. scale.ts + tests → **CANDADO 90→6.3, 80→5.5**
4. (humano aplica 0070 en prueba)
5. API de notas + requireEvaluationStaff
5bis. **GATE BLOQUEANTE (A6):** confirmar que el quiz "dominio de crédito" fue corregido (R13)
   antes de continuar al paso 6. Si no hay dueño asignado para corregirlo, **DETENERSE y
   escalar** — no ejecutar el backfill sobre datos potencialmente corruptos.
6. syncQuizGrade + submits + backfill (--dry-run)
7. Pantalla del alumno + sidebar → prueba RLS con 2 alumnos
8. Admin: kind, guards, pestaña Notas, checklist → 3 manuales activas en un módulo
9. Import Excel
10. Rename copy
11. ADR-0016

> **Agregado tras revisión (15-jul) — A8:** la urgencia verbalizada por la profe (32:19, 29:33:
> *"los niños están preguntando dónde está mi nota"*) es que los alumnos vean sus notas **de
> roleplay**, y esas notas viven hoy en el Excel de Camila (4:51: *"la Camila las tiene en un
> Excel en Drive, entonces de qué manera la Camila puede subir a la plataforma"*; 1:16: *"solo
> falta que... cree la sección y así yo las subo"*). En el orden de arriba el import (paso 9 de
> 11) llega tarde: **la pantalla vacía de notas de roleplay (paso 7) no resuelve la urgencia
> por sí sola.** Hay que adelantar el import de Excel, o tener el panel de carga manual
> (Paso 7d) operativo desde el principio, para que la pantalla del Paso 7 no se entregue vacía.

Verificación final: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
NO commit, NO push. Migración a prod solo con aprobación humana.

## 6. Referencia cruzada

> **Agregado tras revisión (15-jul) — A13.**

El frente de quizzes programados y tipificación de lecciones vive en
`docs/briefs/quizzes-programados-y-tipificacion-de-lecciones.md`. Ambos frentes piden la
migración `0070` — hay que coordinar numeración antes de aplicar cualquiera de las dos
(son aditivas y sin colisión de objetos, así que el orden entre ellas no importa, pero el
número sí). Además, el rename "Quiz de la clase" → "Evaluación de la clase" (Paso 9 de
este documento) toca `components/admin/lesson-edit-form.tsx`, el mismo archivo que el
Paso 4 del Cambio 2 del otro brief — coordinar para no pisarse.
