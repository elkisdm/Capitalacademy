# Evaluaciones por clase: quizzes ligados a lección/módulo + tipos de pregunta

**Classification**: `feat` · large · **high risk** · unknown→resuelto · toca `db/migrations`, `lib/classroom`, `app/api/classroom/quiz`, `app/api/admin/quiz*`, `components/admin/quiz`, `components/classroom/quiz-*`
**Tier**: 3 — Full
**Fecha**: 2026-06-22
**Origen**: petición del usuario + hallazgo "modelo de evaluaciones por módulo" de la megaauditoría v2 (`docs/audit/2026-06-19-…-v2.md`, recomendación 3 y RN-017/E10).

---

## Estado de implementación (2026-06-22)

- ✅ **Fase 1** — migración `0033` (validada local, 7 aserciones + idempotencia) · `scoreAnswer` + selectores por evaluación · tipos.
- ✅ **Fase 2** — CRUD `evaluations` · API de preguntas por tipo · editor dinámico (4 tipos, N opciones) · `LessonQuizPanel` en el editor de lección · fix de `generate-quiz`.
- ✅ **Fase 3** — endpoints formativos del alumno (anti-bypass, sin cert) · `EvaluationRunner` + render de los 4 tipos · bloque en la página de lección.
- ✅ **Fase 4** — el quiz final lee config de `evaluations(scope='final')` · admin quiz-config y generate-quiz escriben ahí · anti-bypass del final verde.
- **Verificación**: typecheck 0 · lint 0 errores · **199/199 tests** · `next build` OK.
- ⚠️ **PENDIENTE — aplicar `0033` a prod**: verificado vía MCP que el remote NO tiene `evaluations`/`question_type` aún. El feature falla en runtime hasta aplicar la migración. NO aplicada (regla del proyecto). Follow-up: generación IA por lección/módulo (hoy solo el pool final).

## Goal

Hoy existe **un solo quiz por programa** (el quiz FINAL que gatea el certificado), con **un solo tipo de pregunta** (opción única A/B/C/D fija). Queremos:

1. **Asociar quizzes a clases** (lección o módulo), no solo al programa. *(prioridad #1)*
2. **Ampliar los tipos de pregunta y respuesta**: opción única con N opciones variables, opción múltiple (varias correctas), verdadero/falso, respuesta corta.
3. **Mejorar la experiencia** de carga (admin) y de rendición (alumno).

El quiz final actual **no se rompe**: se preserva como una evaluación de alcance `final` que sigue gateando el certificado. Los nuevos quizzes por clase son **formativos** (no bloquean el avance).

---

## Decisiones tomadas (del usuario, 2026-06-22)

| Decisión | Valor elegido |
|----------|---------------|
| Nivel de asociación | **Flexible**: una evaluación puede ligarse a una lección **o** a un módulo |
| Relación con el quiz final | **Coexisten**: el final migra a `scope='final'` y sigue gateando el certificado |
| Gating | **Formativo**: el quiz por clase NO bloquea el avance |
| Tipos de pregunta | opción única (N variable) · opción múltiple · verdadero/falso · respuesta corta |

### Asunción del arquitecto (corrígeme si no estás de acuerdo)

- **Unificamos** el modelo en una tabla `evaluations` y migramos el `quiz_config` actual a una fila `scope='final'`. La alternativa era mantener `quiz_configs` (final) y una tabla nueva solo para los por-clase, pero eso deja **dos sistemas de config paralelos** — deuda que la auditoría ya recomendó evitar (`type='final'`). El flujo final endurecido (0030: anti-bypass) se preserva intacto, solo cambia de dónde lee su config.
- **Respuesta corta** se puntúa por **coincidencia normalizada** (trim + lowercase + sin tildes contra una lista de respuestas aceptadas). NO corrección manual en esta v0 (eso sería otra épica de "tareas/entregas").
- El quiz por clase **no emite certificado** ni cuenta para el final. Es retroalimentación pedagógica.

---

## Modelo de datos (migración `0033_evaluations.sql`)

### Nueva tabla `evaluations` (contenedor del quiz)

```
evaluations
  id              uuid pk
  program_id      uuid not null  → programs(id)        -- scoping de tenant SIEMPRE
  scope           text not null check (scope in ('final','module','lesson'))
  module_id       uuid null      → program_modules(id) -- set si scope='module'
  lesson_id       uuid null      → lessons(id)         -- set si scope='lesson'
  title           text not null
  description     text null
  passing_grade_pct   int not null default 70
  questions_per_attempt int null          -- null = todas las preguntas del pool
  max_attempts        int not null default 3   -- final mantiene 1 (RN-025)
  time_limit_minutes  int null
  min_completion_pct  int null          -- solo relevante para scope='final'
  is_active           boolean not null default false
  created_at / updated_at
  -- CHECK: scope='module' ⇒ module_id not null; scope='lesson' ⇒ lesson_id not null;
  --        scope='final'  ⇒ module_id is null and lesson_id is null
  -- UNIQUE parcial: un solo 'final' por program; un solo quiz activo por lesson/module
```

### Evolución de `quiz_questions` (compartida por todas las evaluaciones)

```
+ evaluation_id   uuid null → evaluations(id) on delete cascade   -- nueva FK dueña
+ question_type   text not null default 'single_choice'
                  check in ('single_choice','multiple_choice','true_false','short_answer')
+ correct_answer  jsonb null   -- nuevo formato unificado de la respuesta correcta
                  -- single_choice/true_false: "A"  | multiple_choice: ["A","C"]
                  -- short_answer: ["respuesta aceptada 1","sinónimo 2"]
  options         jsonb        -- ya existe; ahora N claves variables (2–6) o {} en short_answer
  correct_option  text         -- DEPRECADO: se mantiene para compat, se backfillea a correct_answer
  program_id, lesson_id        -- se mantienen (lesson_id ya existía)
```

### Migración de datos (idempotente, dentro de `0033`)

1. Crear `evaluations`.
2. Insertar una fila `scope='final'` por cada `quiz_configs` existente, copiando `passing_grade_pct`, `questions_per_attempt`, `max_attempts`, `time_limit_minutes`, `min_completion_pct`, `is_active`. Guardar el mapeo `program_id → evaluation_id`.
3. `update quiz_questions set evaluation_id = <final eval del program>, question_type='single_choice', correct_answer = to_jsonb(correct_option)` para todas las preguntas existentes (hoy todas son del pool del programa = el final).
4. Mantener `quiz_configs` por ahora (no se borra; el código deja de leerlo en Fase 4). Documentar el deprecado.

### RLS

- `evaluations`: `staff_all` (is_platform_staff) + `student_select` por enrollment activo del programa (igual patrón que `quiz_configs`).
- `quiz_questions`: ya es staff-only; el alumno accede vía API con admin client (igual que el final). Sin cambio de policy.
- Atención: el endpoint del alumno NUNCA devuelve `correct_answer`/`correct_option` (igual que hoy con `selectRandomQuestions`).

---

## Arquitectura del runtime

`lib/classroom/quiz-runtime.ts` se generaliza de **"por programId"** a **"por evaluationId"**:

- `selectQuestions(admin, evaluationId, limit?)` — preguntas del pool de esa evaluación (no del programa).
- `getPresentedQuestions(admin, evaluationId, ids)` — rehidrata sin respuestas.
- **Puntuación por tipo** (`scoreAnswer(question, given)`):
  - `single_choice` / `true_false`: exacto.
  - `multiple_choice`: set igual (exacto) — parcial queda fuera de v0 (configurable después).
  - `short_answer`: normaliza (trim+lower+sin tildes) y compara contra `correct_answer[]`.
- `quiz_attempts` gana `evaluation_id` (nullable para los finales viejos; los nuevos lo setean). El anti-bypass de 0030 (set persistido en `/start`, puntúa server-side) se replica para los por-clase.

---

## Files & routes to touch  (verified against code: yes)

### Fase 1 — Fundación (modelo + tipos de pregunta)  ⟵ la migración riesgosa
- `db/migrations/0033_evaluations.sql` — **new** — tabla `evaluations`, columnas nuevas en `quiz_questions`, `evaluation_id` en `quiz_attempts`, RLS, migración de datos del final.
- `lib/supabase/types.ts` — modify — tipos generados/manuales de las tablas nuevas.
- `components/admin/quiz/types.ts` — modify — `QuizQuestion` con `question_type`/`correct_answer`; nuevo tipo `Evaluation`.
- `lib/classroom/quiz-runtime.ts` — modify — generalizar a `evaluationId` + `scoreAnswer` por tipo.

### Fase 2 — Autoría (admin)
- `app/api/admin/evaluations/route.ts` · `[evaluationId]/route.ts` — **new** — CRUD de evaluaciones (crear ligada a lesson/module, editar, activar, borrar).
- `app/api/admin/quiz-questions/route.ts` · (POST/PATCH) — modify — aceptar `evaluationId`, `questionType`, `options` (N), `correctAnswer` (jsonb); validar por tipo con zod.
- `app/api/admin/generate-quiz/route.ts` — modify — generar preguntas IA apuntando a una lección/módulo (usa su transcripción/resumen) y crear la evaluación.
- `components/admin/quiz/add-question-form.tsx` — modify — selector de tipo + inputs dinámicos (N opciones, multi-correcta, V/F, respuesta corta).
- `components/admin/quiz/question-card.tsx` · `preguntas-tab.tsx` · `index.tsx` — modify — render por tipo; selector de evaluación (final/módulo/lección).
- `app/(admin)/admin/lessons/[lessonId]/…` y editor de módulos — modify — entrada "Agregar quiz a esta clase" desde el editor de lección/módulo (conecta la UI hoy huérfana al contexto de la clase).

### Fase 3 — Rendición (alumno, formativo)
- `app/api/classroom/evaluation/route.ts` (GET estado) · `start/route.ts` · `submit/route.ts` — **new** — versión por-evaluación del flujo del alumno (reusa el endurecimiento anti-bypass; sin certificado; sin gate de completitud para los por-clase).
- `components/classroom/quiz-runner.tsx` — modify/generalizar — recibe `evaluationId` en vez de (o además de) `programId`; modo formativo (sin redirect a certificado).
- `components/classroom/quiz-in-progress.tsx` · `quiz-result-*.tsx` — modify — render de los 4 tipos de pregunta; resultado formativo (sin CTA de certificado).
- `app/(classroom)/classroom/[cohortSlug]/[moduleSlug]/[lessonSlug]/page.tsx` — modify — bloque "Evaluación de esta clase" al final de la lección si hay evaluación activa.
- `app/(classroom)/classroom/[cohortSlug]/[moduleSlug]/page.tsx` — modify — quiz de módulo si existe.

### Fase 4 — Limpieza + experiencia
- `app/api/classroom/quiz/{route,start,submit}.ts` + `lib/classroom/quiz-runtime.ts` — modify — el flujo final lee su config desde `evaluations(scope='final')` (deja de usar `quiz_configs`). Tests de regresión del anti-bypass deben seguir verdes.
- `app/api/admin/quiz-config/route.ts` — modify — escribe sobre `evaluations(scope='final')`.
- `components/classroom/sidebar.tsx` — modify — el link del alumno apunta a su evaluación, no a `/admin/quizzes`.
- `docs/codemap.md` — modify — filas nuevas (sección Quiz & Certificación).

### Out of scope (esta v0)
- Gating de avance por aprobación (queda formativo). RN-017 completo es otra épica.
- Corrección manual de respuesta corta / entrega de tareas.
- Puntuación parcial en opción múltiple.
- Notificaciones de evaluación (E7).
- Banco de preguntas compartido entre evaluaciones / reutilización cross-lección.

---

## Spec (Given/When/Then)

**Scenario: Admin crea un quiz para una lección**
- GIVEN soy staff y estoy en el editor de una lección
- WHEN creo una evaluación `scope='lesson'` y agrego preguntas de tipo verdadero/falso y opción múltiple
- THEN la evaluación queda ligada a esa `lesson_id`, activable, y visible para el alumno de esa cohorte al final de la clase

**Scenario: Alumno rinde un quiz formativo**
- GIVEN una lección con evaluación activa y matrícula activa
- WHEN respondo y envío
- THEN veo mi nota y la revisión de respuestas, **sin bloquear** mi avance ni emitir certificado, y puedo reintentar hasta `max_attempts`

**Scenario: El quiz final sigue funcionando**
- GIVEN el quiz final migrado a `scope='final'`
- WHEN un alumno cumple `min_completion_pct` y aprueba
- THEN se emite el certificado igual que antes, y el anti-bypass de 0030 sigue activo (set de preguntas persistido en `/start`, puntúa server-side filtrando por la evaluación)

**Scenario: Tipos de pregunta puntúan correcto**
- GIVEN preguntas de los 4 tipos
- WHEN el alumno responde
- THEN single/true_false exacto; multiple_choice exige el set exacto; short_answer compara normalizado contra las respuestas aceptadas

---

## Tasks (secuenciadas)

**Fase 1 — Fundación**
1. Escribir `0033_evaluations.sql` (tabla + columnas + RLS + migración de datos). Probar local contra una copia.
2. Generalizar `quiz-runtime.ts` a `evaluationId` + `scoreAnswer` por tipo, con tests unitarios de puntuación de los 4 tipos.
3. Actualizar `types.ts` (supabase + admin/quiz).

**Fase 2 — Autoría admin**
4. CRUD `evaluations` (API + validación zod por scope).
5. `add-question-form` dinámico por tipo + N opciones variables.
6. `quiz-questions` API: aceptar tipos nuevos.
7. Entrada desde el editor de lección/módulo.
8. `generate-quiz` apuntando a lección/módulo.

**Fase 3 — Rendición alumno**
9. Endpoints `evaluation/{route,start,submit}` (formativo, anti-bypass).
10. `quiz-runner` generalizado + render por tipo.
11. Bloque de evaluación en la página de lección/módulo.

**Fase 4 — Limpieza**
12. Final lee config desde `evaluations(scope='final')`; regresión anti-bypass verde.
13. Sidebar + codemap + CHANGELOG.

---

## Riesgos y rollback

- **Riesgo principal**: regresión del flujo final (certificación) durante la unificación. **Mitigación**: Fase 1 solo AGREGA estructura y migra datos sin tocar el código del final; el final sigue leyendo `quiz_configs` hasta la Fase 4, donde se cambia con los tests de anti-bypass como red. La migración es data-preserving e idempotente.
- **Rollback**: `0033` es aditiva (no borra `quiz_configs` ni columnas viejas); revertir = dejar de usar `evaluations` y volver a leer `quiz_configs`. Sin pérdida de datos.
- **Prod**: NADA se aplica a producción sin prueba local previa y aprobación explícita (regla del proyecto).
