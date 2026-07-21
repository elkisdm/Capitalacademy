# ADR-0018: Evaluaciones y notas 1-7 (v1)

- **Status:** accepted
- **Date:** 2026-07-16
- **Deciders:** Eduardo Daza, Paola Vicuña (profe)
- **Tags:** data-model, classroom, evaluaciones

> Nota de numeración: el brief original (docs/briefs/evaluaciones-y-notas-1-7.md)
> proponía `0016` para la migración y este ADR. Ambos números ya estaban tomados
> por el frente de "quizzes programados y tipificación de lecciones" (migración
> 0070/0071, ADR-0016/0017), ejecutado en paralelo sobre la misma rama. Este
> frente usa migración `0072` y `ADR-0018` — ambos aditivos y sin colisión de
> objetos con el otro frente.

## Contexto

La profe necesita registrar la nota chilena 1-7 por alumno para las evaluaciones
del programa (quizzes y evaluaciones manuales tipo roleplay), y que el alumno la
vea consolidada. Hoy `evaluations` solo sabe ser quiz (autocorregido); no existe
ningún lugar para calificar a mano, ni una escala de notas, ni una pantalla de
notas para el alumno.

Hallazgos clave del repo (ver brief, sección 0, para el detalle completo):

- `programs.passing_grade` y `programs.min_attendance_pct` (escala 1-7 y
  asistencia habilitante) YA EXISTEN en el schema desde `0001_init_core.sql`
  pero NUNCA fueron leídas por código — son columnas dormidas del diseño
  original. Se reusan en vez de crear columnas nuevas.
- `evaluations.passing_grade_pct` (default 70) es el umbral de `passed`
  booleano del quiz — un eje DISTINTO de la exigencia de la escala 1-7 (los dos
  datapoints de Camila, 90%→6.3 y 80%→5.5, solo se reproducen con exigencia 60%,
  no con 70%).
- El índice único `evaluations_one_active_per_module` (y sus pares de lección/
  sesión) bloquearía el módulo práctico, que necesita varias evaluaciones
  MANUALES activas a la vez sobre el mismo módulo (ej. dos notas + guión de
  venta).
- El guard de activación (`app/api/admin/evaluations/[evaluationId]/route.ts` y
  su espejo cliente) rechaza activar una evaluación sin preguntas — rompe las
  evaluaciones manuales, que nunca tienen preguntas.
- `authorizeAdmin()` exige `system_role in ('ops','admin')`; el profe real vive
  en `cohort_roles` (rol `teacher`) y no puede calificar con ese gate.

## Decisión

1. **`evaluations` se EXTIENDE, no nace una tabla nueva de "evaluación".**
   Gana `kind` (`'quiz' | 'manual'`, no editable tras la creación) y
   `weight_pct` (se captura y muestra en v1; el cálculo de nota final
   ponderada es v2).
2. **Nace `evaluation_grades`** (nota 1-7 por alumno), anclada en
   `enrollment_id` (no en `evaluations`, que es program-scoped): la nota es
   por alumno Y por cohorte. Se ALMACENA, no se deriva — es un registro
   académico, snapshot inmutable en el momento de calificar.
3. **Nace `evaluation_criteria`** (checklist parametrizable por evaluación) +
   `evaluation_grades.criteria_marks` (snapshot jsonb del marcado al momento
   de calificar — editar el checklist después no reescribe el historial).
4. **Escala 1-7: función TS pura (`lib/grades/scale.ts`), sin función SQL ni
   tabla de escala.** Fórmula lineal chilena estándar (mín 1.0, aprobación 4.0
   en la exigencia, máx 7.0), parametrizada por `programs.grade_exigencia_pct`
   (nueva columna, default 60 — DISTINTA de `passing_grade_pct`).
5. **`deliverables` queda intacto.** Ninguna nota ni feedback se agrega a
   `deliverable_submissions`. **Esta decisión es PROVISIONAL, no doctrina**:
   en la reunión de origen Paola cerró el punto con "dejémoslo todavía como
   ahí" — no es un cierre permanente, solo el estado actual.
6. **Índices únicos "una activa por lección/módulo/sesión" acotados a
   `kind='quiz'`.** Preserva la semántica actual para quizzes (a lo sumo uno
   activo) y libera el modelo para evaluaciones manuales (varias activas a la
   vez sobre el mismo target).
7. **Guard de activación salta para `kind='manual'`** (server y cliente): una
   evaluación manual nunca tiene preguntas, así que nunca debía exigirlas.
8. **`requireEvaluationStaff(evaluationId, cohortId?)`** nuevo en
   `lib/auth/authorize-admin.ts`: gate para el profe real (`cohort_roles`),
   scoped a evaluación + cohorte (con chequeo de tenant), en vez de abrir las
   APIs de notas a `authorizeAdmin`. Las policies RLS de `quiz_attempts` /
   `quiz_questions` NO se tocan (siguen sin policy de teacher) — el panel de
   calificación del profe usa `createAdminClient()` en el servidor, acotado
   en código por `cohort_roles`, el mismo patrón que ya usa `/docente`.
9. **RLS de `evaluation_grades`: lectura de staff vía `is_cohort_staff`, NO
   `is_program_staff`.** DESVIACIÓN DELIBERADA respecto al patrón más común
   del repo (varias policies usan `is_program_staff`): un docente de una
   cohorte no debe leer las notas de otra cohorte del mismo programa.
10. **Borrador + publicar** (`evaluation_grades.published_at`, nullable): el
    alumno solo ve `published_at is not null`. Las notas de quiz y de import
    se auto-publican (resuelven la urgencia de la profe sin un paso extra); las
    manuales pasan por borrador → publicar en el panel del profe.
11. **El checklist se generalizó a TODA evaluación**, no solo a la evaluación
    final. Paola lo pidió explícitamente para la evaluación final ("me tinca
    mucho poder tener ese checklist listo para la evaluación final"); la
    generalización a módulo/lección/sesión es **decisión del ejecutor** (un
    superset inofensivo), no un pedido explícito de la profe.
12. **Un solo `graded_by` por nota.** Paola mencionó que en la práctica
    "los evaluadores fuimos dos o tres personas según cada grupo" — este ADR
    NO afirma "un evaluador por nota" como regla de negocio; para v1 ella
    consolida las notas en una sola persona al momento de cargarlas.

## Opciones consideradas

### Opción A — Extender `evaluations` + tabla nueva de notas (elegida)
- Pros: reusa el contenedor genérico ya construido (RLS, CRUD admin, 4 scopes,
  ventana de programación); cambio aditivo, sin migrar datos existentes.
- Contras: `evaluations` acumula responsabilidades (quiz Y nota manual); se
  mitiga con `kind` y tabs condicionales en la UI.

### Opción B — Evolucionar `deliverables` para cubrir también notas manuales
- Pros: reusaría un modelo ya existente de entregas.
- Contras: descartada por negocio — Paola objetó explícitamente fusionar
  entregables con evaluación ("me quitas la oportunidad de tener un espacio...
  yo no voy a evaluar este guión de venta").

### Opción C — Nota derivada (calculada on-the-fly desde `quiz_attempts` /
  algún registro externo), sin tabla de notas
- Pros: sin duplicar datos, siempre "fresca".
- Contras: las notas manuales no tienen `pct` del cual derivar; un registro
  académico debe ser un snapshot inmutable (si se recalifica el checklist o
  cambia la exigencia del programa, una nota ya publicada no debe cambiar
  retroactivamente).

### Opción D — Tabla de escala en BD (parametrizable vía UI)
- Pros: permitiría exigencias no lineales o curvas custom sin tocar código.
- Contras: sobre-ingeniería para una fórmula de 4 líneas sin ningún caso de
  uso que la necesite hoy.

## Consecuencias

### Positivas
- El profe puede calificar (roleplay, guión de venta, etc.) sin pasar por
  `authorizeAdmin`, con el mismo nivel de aislamiento por cohorte que ya rige
  el resto del panel `/docente`.
- El alumno tiene una pantalla de notas real (`/classroom/[cohortSlug]/notas`),
  siempre visible, con el carril de asistencia visualmente separado.
- El backfill de notas de quiz es idempotente y no pisa notas manuales
  (`source='manual'` es intocable por `syncQuizGrade` y por el script).
- El import de Excel resuelve la urgencia verbalizada por la profe (los
  alumnos preguntando por su nota de roleplay, que hoy vive en un Excel de
  Camila) sin esperar a que ella la cargue fila por fila.

### Negativas
- `evaluations` es ahora un contenedor con dos "modos" (quiz / manual); la UI
  (`EvaluationPanel`) debe ramificar sus pestañas según `kind`, lo que añade
  complejidad condicional a un componente ya compartido por 3+ superficies.
- El promedio simple por módulo se suprime cuando hay `weight_pct` cargado
  (corrección A7 del brief) — la UI del alumno para el módulo práctico
  muestra notas individuales sin promedio, lo cual es intencional pero menos
  "limpio" visualmente que un número único.
  (Superseded por ADR-0024: el promedio ponderado sí se calcula.)
- Certificados y `passed` booleano del quiz siguen sin relación con la nota
  1-7 (ver ADR-0007) — riesgo de expectativa: si nadie le explica esto a la
  profe antes de la entrega, puede leer la pantalla de notas como una nota
  final ponderada que certifica, cosa que v1 NO hace.

### Riesgos
- **R1 (aceptado):** el certificado sigue mostrando % y `passed`, no la nota
  1-7. No se toca en v1.
- **R6:** fuga cross-tenant en el roster de notas — mitigado con el chequeo
  `cohorts.program_id === evaluation.program_id` dentro de
  `requireEvaluationStaff` y en el endpoint de import.
- **R13 (precondición externa, fuera de este ADR):** el quiz "dominio de
  crédito" con presunta duplicidad de respuestas correctas fue **verificado
  como NO corrupto** al momento de ejecutar este frente (15 intentos,
  80-100%, confiables) — el backfill se corrió sobre esos datos sin bloqueo.
- **Riesgo de expectativa (no técnico):** nadie quedó formalmente a cargo de
  comunicarle a la profe que la nota final ponderada / certificante NO viene
  en v1.

## Referencias

- `docs/briefs/evaluaciones-y-notas-1-7.md` — brief completo, con las
  correcciones de la revisión del 15-jul marcadas inline.
- [ADR-0007: Certificación y quizzes](0007-certificacion-y-quizzes.md) — la
  certificación NO cambia en v1 (R1).
- [ADR-0015: RUT no único](0015-rut-no-unico-multiples-cuentas-por-persona.md) —
  el import de Excel matchea por email, nunca por RUT.
- [ADR-0016: Ventana de programación de evaluaciones](0016-ventana-de-programacion-de-evaluaciones.md)
  y [ADR-0017: Tipificación de lecciones](0017-tipificacion-de-lecciones-por-actividad.md) —
  frente paralelo sobre la misma rama; coordinación de numeración de
  migraciones (0070/0071 vs 0072) documentada en la sección 6 del brief.
- `db/migrations/0072_evaluation_grades.sql` — migración de este frente.
- `lib/grades/scale.ts` — función de escala, con los tests candado
  (`pctToGrade(90) === 6.3`, `pctToGrade(80) === 5.5`).
