# ADR-0017: Tipificación de lecciones por tipo de actividad

- **Status:** accepted
- **Date:** 2026-07-16
- **Deciders:** Eduardo Daza
- **Tags:** classroom, data-model, ux

## Contexto

En la reunión del 15-jul, Paola (profe) señaló que el listado de lecciones no se ve ordenado:
"insisto en las lecciones, encuentro que no se ve muy ordenado" (36:48), describiendo que el
temario mezcla clases, actividades prácticas (roleplay, challenge day), integración y
evaluaciones sin distinción visual. Además reclasificó explícitamente en dos momentos de la
misma reunión: 38:30 ("cuando tú ves actividad de integración, challenge, esas no son clases,
esas son actividades prácticas, que son parte de la metodología comercial") y 39:43, de forma
deliberada y cerrada: "está la modalidad y está qué actividad es, es clase, es actividad
práctica o es evaluación."

Ver brief completo: `docs/briefs/quizzes-programados-y-tipificacion-de-lecciones.md` (Cambio 2),
incluida la corrección B1 que documenta por qué el plan original de 4 tipos
(`class/practice/integration/evaluation`) contradecía la taxonomía final de la propia Paola.

Hallazgo que redujo el alcance: el "campo de texto que explique de qué va la actividad" que
Elkis propuso (40:40) YA EXISTE — `lessons.content` (Markdown, `0039_lesson_text_content.sql`),
ya expuesto en `lesson-edit-form.tsx` y ya renderizado al alumno en `[lessonSlug]/page.tsx`. No
hace falta columna nueva para eso.

## Decisión

1. **Columna nueva `activity_type` (text + CHECK), NO tocar el enum `lesson_kind`.**
   `lesson_kind` (`0001:73`) es MODALIDAD (presencial/online/grabada) y lo comparten
   `lessons.kind` y `class_sessions.modality`. Meter `'practice'`/`'evaluation'` ahí implicaría
   que una `class_session` pudiera tener `modality='evaluation'`, que es incoherente. Modalidad y
   tipo de actividad son ortogonales: una actividad práctica puede ser presencial u online.

2. **`text` + CHECK, no enum nuevo, no tabla de catálogo.** Precedente interno:
   `evaluations.scope` (`0033:23`) y `quiz_questions.question_type` ya usan este patrón. Un valor
   de enum de Postgres no se puede eliminar ni renombrar nunca; un CHECK se reemplaza con
   `drop constraint` + `add constraint` (`0040:32-41` ya demuestra el patrón). Sin requisito de
   tipos configurables por tenant, una tabla de catálogo sería sobre-ingeniería.

3. **Tres valores: `'class' | 'practice' | 'evaluation'`.** El plan original consideró cuatro
   (sumando `'integration'`), pero la propia Paola la descarta como categoría aparte: en 38:30 la
   reclasifica dentro de "actividad práctica", y en 39:43 da la enumeración cerrada de tres. Si se
   agregara un cuarto tipo "Integración", se le devolvería el mismo desorden que pidió eliminar
   (una actividad que ella mismo dijo que es práctica, presentada como categoría aparte).

4. **`not null default 'class'`, sin backfill de datos.** En Postgres 11+ el `ADD COLUMN ... DEFAULT`
   no reescribe la tabla. Todas las lecciones existentes quedan `'class'` (statu quo exacto). A
   propósito NO se backfillea `'evaluation'` a las lecciones con una `evaluations` asociada: una
   clase con quiz sigue siendo una clase. La re-etiquetación de las pocas lecciones que aplican
   (roleplay, challenge day, etc.) es trabajo manual de la profe — requiere criterio pedagógico
   que no se puede inferir de los datos.

5. **La reestructuración por cursos (D10) se pospone explícitamente.** Es un tema de la próxima
   generación (octubre), a planificar desde septiembre — lo propuso Elkis pero el propio Elkis lo
   difirió en la misma reunión (44:17: "no nos vayamos por las ramas, eso es como para otra
   reunión más de base"), y Paola aceptó (44:24). `activity_type` es ortogonal a cómo se agrupen
   las lecciones en el futuro, así que no bloquea ese trabajo ni requiere tablas o campos
   "preparatorios" ahora.

## Opciones consideradas

### Opción A — `text` + CHECK, 3 valores (elegida)
- Pros: sigue el patrón ya establecido en el repo (`evaluations.scope`), reversible sin
  reescritura de tabla, sin backfill de datos, coincide con la taxonomía final y deliberada de
  la profe.
- Contras: ninguna garantía de integridad referencial (no aplica aquí: son valores fijos, no
  referencias a otra tabla).

### Opción B — Enum de Postgres (rechazada)
- Pros: el motor valida el valor sin CHECK adicional.
- Contras: un enum no admite eliminar ni renombrar valores — si el negocio ajusta la taxonomía
  otra vez (como ya pasó una vez en esta misma reunión, de 4 a 3), migrar un enum es más costoso
  que un `drop constraint` + `add constraint`.

### Opción C — Cuatro tipos, incluyendo 'integration' (rechazada, plan original)
- Pros: ninguno real — parecía más fiel a la lista inicial de la profe (19:34).
- Contras: esa lista era su descripción del desorden, no la taxonomía; ella misma reclasifica
  "integración" dentro de "práctica" más adelante en la misma reunión (38:30, 39:43). Mantener
  4 tipos reintroduce el desorden que pidió eliminar.

## Consecuencias

### Positivas
- El listado de lecciones puede distinguir visualmente clase / actividad práctica / evaluación
  sin ambigüedad, resolviendo el pedido central de Paola.
- Cero impacto en producción al desplegar: todas las lecciones existentes quedan `'class'`.
- El campo de contenido reusa `lessons.content` con una etiqueta condicional ("En qué consiste
  la actividad y cómo se evalúa" cuando `activity_type !== 'class'`), sin migración de datos ni
  editor nuevo.

### Negativas
- Ninguna lección existente queda re-etiquetada automáticamente: la profe debe re-etiquetar a
  mano las que correspondan (no hay script de backfill, y no debería haberlo — requiere criterio
  pedagógico).
- El copy y color de los badges (Práctica=ámbar, Evaluación=lima) es propuesta del ejecutor, no
  pedido explícito de la profe — queda pendiente de confirmar con ella (ver N5 del brief).

### Riesgos
- Si en efecto se necesitara una cuarta categoría en el futuro, el CHECK se actualiza con
  `drop constraint` + `add constraint` (mismo patrón que `0040`), sin downtime.
- El renombrado "Tipo" → "Modalidad" en `lesson-edit-form.tsx` es necesario para no tener dos
  selects "Tipo" adyacentes, pero cambia una etiqueta visible en el admin — bajo riesgo, sin
  impacto en datos.

## Referencias

- `db/migrations/0071_lessons_activity_type.sql` — columna y CHECK.
- `db/migrations/0039_lesson_text_content.sql` — `lessons.content`, reusado sin cambios.
- `lib/classroom/types.ts` — `LessonActivityType`, `ACTIVITY_OPTIONS`, `ACTIVITY_TYPE_LABELS`.
- `docs/briefs/quizzes-programados-y-tipificacion-de-lecciones.md` — brief original con la
  transcripción de la reunión y las correcciones de atribución (B1, B5, B7).
