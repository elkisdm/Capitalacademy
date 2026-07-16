# Brief — Quizzes programados y tipificación de lecciones · Tier 2

> Estado: **revisado — pendiente de ejecución** · Fecha: 2026-07-15 · Origen: reunión con la
> profe (Paola), 15-jul-2026
> Nota: este documento fue contrastado contra la transcripción literal de la reunión por una
> revisión independiente; las correcciones resultantes quedan marcadas inline como
> `> **Corregido/Agregado tras revisión (15-jul):**` para que se distingan del plan original.

Dos cambios INDEPENDIENTES. Única dependencia compartida: numeración de migraciones.

## Contexto común
- Next.js 16.2.4 App Router + React 19 + Tailwind v4 (`@theme inline`, sin `tailwind.config`).
  Design system propio prefijo `ca-` en `components/ui/`. **Sin shadcn, sin Radix, sin dark mode.**
- Verificación: `pnpm typecheck` → `pnpm test` (vitest) → **`pnpm build` obligatorio**.
- `lib/supabase/types.ts` es generado pero **mantenido a mano** (no hay script en package.json).
  Toda columna nueva va a mano en `Row`/`Insert`/`Update`, o `pnpm typecheck` falla.
  - `evaluations` Row desde `:906` (`is_active` `:910`, `scope: string` `:918`)
  - `lessons` Row desde `:1403` (`content` `:1404`, `kind` `:1409`, `unlock_at` `:1422`)
- **Numeración**: última = `0069`. El plan de Evaluaciones también pide `0070`.
  Correr `ls db/migrations/ | tail -3` y tomar el primer libre. Números orientativos.
  Ambas migraciones aditivas y sin colisión de objetos → orden irrelevante.
- **Zona horaria**: `components/ui/date-picker.tsx` emite strings naive `"YYYY-MM-DDTHH:mm"`.
  La conversión la hace cada consumidor con la TZ del navegador. Patrón vigente a copiar
  (`lesson-edit-form.tsx:33-39`, `deliverables-manager.tsx:38-47`): `isoToLocalInput` /
  `fromLocalInput`. Asume navegador en Santiago. NO introducir esquema TZ distinto.

---

# CAMBIO 1 — Programar apertura/cierre de quizzes por fecha-hora

**Pedido** (según el brief; ver corrección B2 abajo para las citas literales y la atribución
exacta): "poner fecha de apertura y fecha de término, que se automatice; que yo ponga que se
active el miércoles a las 9:30 y se desactive a la hora que yo indique. Así te sientas, subes
todos los quizzes y los dejas programados."

> **Corregido tras revisión (15-jul) — B2:** esta cita entrecomillada no es literal; es una
> composición. El pedido real es de **Camila** (operación, 24:12): *"si puede es como poner
> como fecha de apertura y fecha de término como que se automatice como yo por ejemplo que
> ponga que se active el miércoles a las nueve y media... y que se desactive sólo a la hora
> que yo ponga."* Elkis respondió *"Sí, todo se puede, claro que sí."* Y **Paola lo endosó**
> con sus propias palabras (24:55): *"Y así te sentai y como que subís todos los cuices pero
> los dejai programados para que se activen y desactiven según el horario que tú indiques."*
> Camila además conectó con el precedente de entregables (24:52: *"Claro, eso mismo es como en
> los cuices"*), que es exactamente el patrón que este plan copia (ver "Patrón a copiar" abajo).
> **Esto refuerza el requisito** — lo pidió la operación Y lo ratificó la clienta.

## Estado actual verificado
- `evaluations.is_active boolean not null default false` (`0033:34`). **NO existe
  `opens_at`/`closes_at`** — grep confirmado; esos campos solo existen en `0053_entregables.sql`.
- Toggle manual: `components/admin/quiz/evaluation-panel.tsx:99`, botón `:215`, badge `:184-185`,
  y `evaluaciones-tab.tsx:298-299`. Ruta: `app/(admin)/admin/quizzes/page.tsx`.
- **Índices únicos parciales dependen de `is_active`** (`0033:51-57`, `0040:44-45`).
- **Patrón a copiar**: `deliverables` tiene `opens_at`/`due_at` NOT NULL, CHECK `due_at > opens_at`
  (`0053:56`), y **aplica la ventana en RLS** (`:122` insert, `:134` delete).
- Gate de acceso: `lib/classroom/evaluation-access.ts` (usa `.in(["active","completed"])` en `:56`).
- Antecedente: `lessons.unlock_at` (`0001:82`) evaluado on-read en
  `app/(classroom)/classroom/[cohortSlug]/page.tsx:111-116`.
- Crons Netlify (los de Vercel NO corren): `session-reminders-cron.mjs` `*/30 * * * *`.
  `app/api/cron/deliverable-openings/route.ts` **solo notifica**, no activa.

## Decisiones de arquitectura

### D1. On-read, SIN cron. ✅ Decidido
Patrón vigente: deliverables y `lessons.unlock_at` lo hacen on-read; el cron de entregables solo
NOTIFICA. Un cron introduciría hasta 30 min de desfase (inaceptable para "9:30"), estado derivado
desincronizable, y dependencia de infra para una comparación de fechas. **Rechazado.**

### D2. `is_active` sigue siendo master switch; las fechas son ventana adicional y opcional. ✅
**La trampa**: los 3 índices únicos parciales usan `where ... and is_active`. Si la actividad se
derivara de las fechas, no habría forma de expresarlos: **un índice parcial en Postgres NO puede
usar `now()`** — no es IMMUTABLE, `CREATE INDEX` lo rechaza. No existe "índice único de lo que
está abierto ahora".

**Solución**: `is_active` = "publicada / no borrador". Los índices NO se tocan.
Disponibilidad = `is_active AND (opens_at IS NULL OR now() >= opens_at) AND (closes_at IS NULL OR now() <= closes_at)`.
Ventana OPCIONAL: NULL/NULL = comportamiento actual exacto. **Cero cambio al desplegar.**
Toggle manual sobrevive. Caso de la reunión ("dejar dos quizzes abiertos hasta el lunes") =
`is_active=true` + `closes_at=lunes`.

**Consecuencia aceptada**: no se pueden tener DOS quizzes programados sobre la MISMA lección en
ventanas distintas (ambos requerirían `is_active=true` → viola el índice). Ver N1.

### D3. `opens_at`/`closes_at` NULLABLE, no NOT NULL. ✅
Se aparta del precedente de `deliverables` (que las tiene NOT NULL) a propósito: una evaluación
sí tiene sentido sin ventana (el quiz final no se programa). Nullable evita backfill.

### D4. Ventana uniforme para todos los scopes (`final`, `module`, `lesson`, `session`). ✅
Más simple que exceptuar `final`. En la práctica el final queda NULL/NULL.

### D5. `submit` NO aplica `closes_at`. ✅ **Gotcha crítico**
Si un alumno inicia un intento a las 10:29 y la ventana cierra a las 10:30, aplicar `closes_at`
en `submit` le **quema el intento sin nota**. Regla: un intento ya iniciado siempre se puede
entregar. `closes_at` gatea **iniciar** (y ver), no **entregar**. El límite por intento ya lo
cubre `time_limit_minutes`.

> **Corregido tras revisión (15-jul) — B6:** el sistema de 4 badges de estado
> (Borrador/Programada/Activa/Cerrada, paso 8 más abajo), el hint UX de "Cerrada", los colores
> concretos de N5 y **D5** no fueron pedidos por nadie en la reunión — son ingeniería propia
> razonable del planner (el plan ya lo marca parcialmente; se refuerza aquí). Caso especial:
> **D5 contradice una lectura literal de "se desactiva a la hora que yo ponga"** (Camila,
> 24:12) → hay que mencionárselo explícitamente a Camila antes de darlo por bueno, porque un
> intento iniciado justo antes del cierre seguiría siendo aceptado después de la hora de cierre.

## Pasos
1. **Migración `0070_evaluations_schedule_window.sql`**: `opens_at`/`closes_at` timestamptz,
   CHECK `evaluations_window_chk` (tolera NULLs), índice `evaluations_window_idx where is_active`,
   y recrear `evaluations_student_select` copiando la de `0033:~170-185` + 2 líneas de ventana.
   Las policies `evaluations_staff_all` y `evaluations_staff_cohort_select` NO se tocan
   (el staff debe seguir viendo lo programado y lo cerrado).
   Verificación: correr 2× (idempotencia), todas NULL, `count(*) where is_active` igual, CHECK muerde.
2. **`lib/classroom/evaluation-window.ts`** — helper PURO (sin `server-only`):
   `isEvaluationOpen`, `getEvaluationState` → `"draft" | "scheduled" | "open" | "closed"`.
   Filtrado en JS con el helper, NO con `.or()` de PostgREST (más legible, N pequeño, nadie más
   en el repo usa `.or()` así, y un helper único garantiza la misma regla en las 4 llamadas).
   Tests en `lib/classroom/__tests__/evaluation-window.test.ts` (bordes exactos incluidos).
3. **`lib/classroom/evaluation-access.ts`** — el gate que de verdad manda (usa service-role →
   **bypassea RLS**). Añadir `opens_at, closes_at` al select `:37-41`; reemplazar el chequeo `:44`
   por `getEvaluationState`: draft/scheduled → 404; **closed → 403 "Esta evaluación ya cerró"**.
   Param opcional `opts?: { ignoreClosesAt?: boolean }` para D5.
4. **Resto de lecturas del alumno** (4 sitios): `[lessonSlug]/page.tsx:156-162` (`maybeSingle()`
   sigue válido), `lib/classroom/queries.ts:28-33`, `app/(classroom)/layout.tsx:112-119` y `:164-169`.
   El comentario en `layout.tsx:109` dice "Misma condición que /api/classroom/quiz" — mantener
   la invariante: pasos 4 y 5 van juntos.
5. **Quiz final** (3 sitios): `quiz/route.ts:48-54` estricto, `quiz/start/route.ts:61` estricto,
   `quiz/submit/route.ts:67` **sin closes_at** (D5).
   ⚠️ **Gotcha de tests**: `start/__tests__/route.test.ts:53` y `submit/__tests__/route.test.ts:66`
   mockean `state.config` **sin `opens_at`/`closes_at`** → serán `undefined`, no `null`.
   El helper debe usar `!ev.opens_at` (no `!== null`) **y** agregar `opens_at: null, closes_at: null`
   a los fixtures. Ambas cosas.
6. **API admin**: `opensAt`/`closesAt` en `patchSchema` (`[evaluationId]/route.ts:48-60`) y
   `createSchema` (`route.ts:66-83`). **Validación cruzada obligatoria**: un PATCH que manda solo
   `closesAt` debe compararse contra el `opens_at` persistido → 422. El `catch` de `:117-126` solo
   mapea `23505`, así que un `23514` del CHECK daría 500 genérico. Mapear `23514` → 422 también.
   El guard de activación sin preguntas (`:93-106`) **se mantiene**.
7. **UI admin**: dos `DatePicker` (`withTime`) en `evaluation-settings.tsx`. **Reusar** el
   componente que arregló el commit `9639895`, no hacer uno nuevo. Copiar `isoToLocalInput` /
   `fromLocalInput`. **NO refactorizar** la duplicación preexistente (deuda fuera de alcance).
   Validar `closesAt > opensAt` en `buildPayload()`.
   Verificación TZ: poner 9:30 y confirmar que vuelve 9:30, no 12:30 ni 6:30.
8. **Estado visual: de 2 badges a 4** — draft/neutral "Borrador", scheduled/amber "Programada",
   open/lime "Activa", closed/neutral "Cerrada". Extraer
   `components/admin/quiz/evaluation-state-badge.tsx` compartido (única abstracción autorizada:
   doble uso real). **Gotcha UX**: si `closes_at` está en el pasado y la profe pulsa "Activar",
   el badge dirá "Cerrada" y parecerá que el botón no hizo nada → hint
   "Cerró el {fecha}. Borra o cambia la fecha de cierre para reabrirla."
9. **Reporte admin: dejar como está** (decisión explícita). `lib/admin/student-panel-queries.ts:181-185`
   filtra `.eq("is_active", true)` para el panel del profesor. **NO aplicar la ventana**: es un
   reporte de evaluaciones publicadas, no un gate. Si se aplicara, una evaluación cerrada
   desaparecería del reporte y con ella el registro de quién la aprobó. Dejar comentario.
   Igual criterio para `certificado/page.tsx:53-58` y `certificate/retry/route.ts:74`.
10. **ADR-0016** `0016-ventana-de-programacion-de-evaluaciones.md`. ⚠️ Verificar el número:
    hay DOS ADR con prefijo `0013` — `ls | tail -1` engaña. El último real es `0015`.
    Deriva de ADR-0007. Documenta D1–D5 y la limitación N1.
11. **CHANGELOG** → Added.

## Decisiones de NEGOCIO pendientes (Cambio 1)
- ~~**N1 (la importante).** ¿Necesita programar DOS quizzes distintos sobre la misma
  lección/sesión en ventanas diferentes? Con D2 **no se puede**. El pedido literal sugiere un
  quiz por instancia → D2 alcanza. Si fuera sí: `EXCLUDE USING gist` con `tstzrange` +
  `btree_gist`, bastante más complejo. **Recomendación: D2 ahora (YAGNI), confirmar con la
  profe.**~~ → **Corregido: D2/N1 quedan CONFIRMADOS por la transcripción, ya no son pregunta
  abierta** (ver corrección B3 abajo). El `EXCLUDE USING gist` sería sobre-ingeniería — no
  reabrir esta pregunta.
- **N2.** Al cerrar, ¿el alumno sigue viendo "Cerrado — tu nota fue X" o desaparece? Este plan lo
  **hace desaparecer** (RLS lo oculta), que es lo que hoy hace "Desactivar". Los intentos y notas
  siguen en `quiz_attempts`. Si quieren la vista "cerrado con nota": trabajo adicional. **Preguntar.**
- **N3.** El quiz final devuelve `{status:"unconfigured"}` ("Próximamente") fuera de ventana.
  ¿Vale `status: "scheduled" | "closed"` con copy propio? **Recomendación: no en esta iteración.**

> **Corregido tras revisión (15-jul) — B3:** el plan dejó N1 como pregunta abierta ("¿necesita
> dos quizzes sobre la misma lección en ventanas distintas?"). La transcripción lo resuelve:
> **no.** Los "dos quizzes hasta el lunes" (3:57) son de **clases distintas** — el de la clase
> de ayer ("segunda parte", 3:28) y otro anterior que vencía el jueves; parte 1 y parte 2 son
> sesiones separadas (cf. 46:21: *"estas del martes 14 de la parte 2"*). Además Paola es
> explícita: 5:44 (*"cada clase online de los miércoles tiene un quiz que acompaña a esa
> clase"*) y 31:12 (*"cada clase tenga esta instancia de evaluación a través de [quiz]... eso sí
> o sí va a ir y se va a mantener por siempre"*). **Un quiz por clase.** D2/N1 quedan
> confirmados, no pendientes.

> **Agregado tras revisión (15-jul) — B4:** N2 tiene una dependencia con el otro brief. Paola
> exige que las notas queden visibles en una vista consolidada (32:19: *"que los alumnos puedan
> acceder a ver sus notas... tanto de los [quizzes]... que ojalá todo eso estuviera concentrado
> en una sola parte"*). Que el quiz cerrado desaparezca **no es regresión** (hoy "Desactivar" ya
> lo oculta) **siempre que** la pantalla de notas de `docs/briefs/evaluaciones-y-notas-1-7.md`
> (Paso 6 de ese brief) entregue esa vista consolidada. Coordinar con ese frente antes de dar N2
> por resuelto.

---

# CAMBIO 2 — Tipificar lecciones por tipo de actividad

**Pedido literal** (según el brief): "Instancias: algunas son clases, otras son actividades
prácticas como roleplay o challenge day, otras son integración, otras son evaluación. Me hace
ruido, no se ve ordenado." Además: "una actividad no tiene repetición" → en vez del bloque de
video, un campo de texto que explique de qué va y cómo se evalúa.

> **Corregido tras revisión (15-jul) — B2:** dos matices de atribución. (1) *"una actividad no
> tiene repetición"* **NO es pedido de la profe**: es frase de **Elkis** (40:01): *"podemos
> definir bien eso allí ser una actividad no tiene repetición, por ejemplo"*, ampliada en 40:40:
> *"una actividad de integración en vez de tener como una repetición puede tener como un campo
> de texto donde explique de qué va la actividad, cómo se evalúa."* Paola la **endosó, no la
> pidió**: 40:34 (*"se está perdiendo espacio o no sé... ensucia"*) y 41:02 (*"Si pudiéramos
> darle ese app y también sería súper interesante"*). La interpretación técnica del plan es
> correcta ("no le impongas el bloque de video vacío, NO prohíbe el video") — coincide con la
> intención de Elkis en 40:40; lo que se corrige es la atribución y, con ella, la fuerza del
> requisito: **si hay que recortar, esto es recortable.** (2) La parte de "no se ve ordenado" sí
> es de Paola, pero de **36:48** (*"insisto en las lecciones, encuentro que no se ve muy
> ordenado"*), no del mismo momento que 19:34.

## Hallazgo que cambia el alcance (verificado)
**El "campo de texto que explique de qué va la actividad" YA EXISTE. No hace falta columna nueva.**
- `lessons.content` (text, Markdown) creada por `0039_lesson_text_content.sql:19`, con bucket
  público `lesson-content`.
- Ya expuesta en admin: `components/admin/lesson-edit-form.tsx:128-133` con `<LessonContentEditor>`
  bajo "Contenido de la clase (texto / diapositiva)".
- Ya renderizada al alumno: `[lessonSlug]/page.tsx:264-278` con `<Markdown>` cuando `isTextLesson`.

El cambio se reduce a: (a) columna de tipo, (b) exponerla en admin, (c) badge para el alumno,
(d) ajustar el fallback. **Notablemente menos trabajo del que el brief sugiere.**

## Decisiones
### D6. NO tocar el enum `lesson_kind`. ✅
`lesson_kind` (`0001:73`) es **modalidad** y lo comparten DOS tablas: `lessons.kind` (`:81`) y
`class_sessions.modality` (`:118`). Meter `'practice'`/`'evaluation'` significaría que una
`class_session` puede tener `modality='evaluation'` — incoherente. Modalidad y tipo de actividad
son **ortogonales** (una actividad práctica puede ser presencial u online).

### D7. Columna `text` + `CHECK`, no enum nuevo, no tabla de catálogo. ✅
Precedente interno: `evaluations.scope` (`0033:23`) y `quiz_questions.question_type`. El repo YA
decidió text+CHECK. Contra enum: un valor de enum no se puede eliminar ni renombrar nunca;
`0040:32-41` demuestra el patrón `drop constraint` + `add constraint` — trivial con CHECK,
imposible con enum. Contra catálogo: nadie pidió tipos configurables por tenant.

### D8. `not null default 'class'` → backfill automático, cero SQL de datos. ✅
En PG 11+ no reescribe la tabla. Todas las lecciones de prod quedan `'class'` = statu quo.
⚠️ **NO** backfillear a `'evaluation'` las lecciones con `evaluations` asociada: *una clase con
quiz sigue siendo una clase*. La profe re-etiqueta a mano las pocas que aplican.

### D9. Valores: ~~`'class' | 'practice' | 'integration' | 'evaluation'`~~ → **Corregido:
`'class' | 'practice' | 'evaluation'`** (tres). ✅ Confirmado por la transcripción — ya NO es
N4 (pregunta de negocio abierta). Ver corrección B1 abajo.

> **Corregido tras revisión (15-jul) — B1 (la corrección más importante de este documento):**
> el plan original proponía cuatro tipos (`class | practice | integration | evaluation`) y N4
> recomendaba "los cuatro". Esto **contradice la taxonomía final de Paola**. La lista de 19:34
> (*"algunas son clases, otras son actividades prácticas como roleplay o como challenge day, y
> otras son integración, y otras son evaluación"*) es su **descripción inicial del desorden**,
> no la taxonomía. Después ella misma **reclasifica** en 38:30: *"cuando tú ves actividad de
> integración, challenge, esas no son clases, esas son actividades prácticas, que son parte de
> la metodología comercial"* → integración queda DENTRO de actividad práctica. Y en 39:43 da la
> enumeración deliberada y cerrada: *"está la modalidad y está qué actividad es, **es clase, es
> actividad práctica o es evaluación**."* **D9 pasa a `class | practice | evaluation`
> (tres).** N4 se invierte: el default es tres, y `'integration'` se presenta como opción que
> ella descartó implícitamente. Si se le consulta, mostrarle **su propia frase de 39:43**, no
> la lista de 19:34. Ajustar `ACTIVITY_OPTIONS`, `ACTIVITY_TYPE_LABELS`, el CHECK de la
> migración y los tonos de badge en consecuencia (quedan 2 badges: práctica y evaluación; clase
> sin badge). Razón de fondo: con cuatro tipos se le entrega un "Integración" que ella misma
> dijo que es una actividad práctica → se reintroduce el desorden que pidió eliminar.

### D10. NO adelantar la reestructuración por cursos. ✅
Es de la generación de octubre, en reunión aparte. `activity_type` es ortogonal a cómo se agrupen
las lecciones → compatible sin migración adicional. No crear tablas ni campos "preparatorios".

> **Agregado tras revisión (15-jul) — B7:** la exclusión está bien fundada, con un matiz a
> añadir: 41:14 Elkis propone la estructura por cursos *"para la siguiente corte"*; **44:17 es
> el propio Elkis quien la difiere** (*"no nos vayamos por las ramas porque eso es como para
> otra reunión más de base"*); **44:24 Paola acepta** (*"pensarla para el próximo diplomado que
> va a ser en octubre... empezar a ver Septiembre"*). Quien pospuso fue el dev, Paola solo
> aceptó; y **la planificación arranca en septiembre** para el diplomado de octubre. **Nadie
> agendó esa reunión** — tarea operativa pendiente (ver sección de Tareas operativas al final).

## Pasos
1. **Migración `0071_lessons_activity_type.sql`**: `activity_type text not null default 'class'`
   + CHECK con guarda `do $$ ... pg_constraint ... end $$`. Sin índice (no se filtra por él).
   CHECK permite `'class' | 'practice' | 'evaluation'` — ver corrección B1; **NO incluir
   `'integration'`** como valor separado.
   Verificación: 2×, todo `'class'`, CHECK muerde.
2. **Tipos**: `activity_type: string` en `lessons` Row/Insert/Update. NO tocar `Enums.lesson_kind`
   (`:2189`). `LessonActivityType` en `lib/classroom/types.ts` + `ACTIVITY_TYPE_LABELS` compartido
   (label + tono), tonos de `components/ui/badge.tsx:7-14`.
3. **API admin**: `activityType` zod enum en `app/api/admin/lessons/route.ts` (`:9`, `:11-22`, `:73-83`)
   y en `[lessonId]/route.ts`.
4. **UI admin** `lesson-edit-form.tsx`:
   ⚠️ **Rename necesario**: `:135` etiqueta el select de `kind` como **"Tipo"**. Con otro select
   "Tipo de actividad" quedan dos "Tipo" adyacentes — el desorden que la profe pidió eliminar.
   Cambiar "Tipo" → **"Modalidad"**.
   `ACTIVITY_OPTIONS`, estado, PATCH, `<Select>`.
   **Etiqueta dinámica del contenido (ESTO ES el pedido)**: `:129-131` hoy es fija
   "Contenido de la clase (texto / diapositiva)". Condicional: si `activityType !== "class"` →
   **"En qué consiste la actividad y cómo se evalúa"**. Misma columna, mismo editor, cero migración.
   También `add-lesson-button.tsx` (tiene su copia de `KIND_OPTIONS` en `:11-15`).
   Y la page que construye `initial` debe pasar `activityType` (buscar con grep `LessonEditForm`).
5. **Vista alumno: badge**. Las 2 queries usan `select("*")` → `activity_type` llega sin tocar SQL
   (`lib/classroom/queries.ts:165-177` y `:379-382`).
   `module-accordion.tsx:4-13` extiende `ClassRowData` con `activityType?` (opcional: las filas de
   `class_sessions` no tienen la columna). Badge reusando el pill de "Repetición" (`:39-42`).
   **Solo cuando `activityType !== "class"`** — marcar las clases normales sería ruido en el 90%
   de las filas. ⚠️ La rama `else` (`:49-59`, fila bloqueada) también debe mostrarlo.
6. **"Una actividad no tiene repetición": arreglar el fallback**.
   `[lessonSlug]/page.tsx:172-174`: hoy `isTextLesson = !hasVideo && (!!lessonContent?.trim() || resources.length > 0)`.
   **Problema exacto**: una actividad sin video **y sin contenido escrito todavía** cae en el
   tercer caso — el `div.video-stage.aspect-video` de `:279-297` con icono de claqueta y
   "Contenido disponible próximamente". Ese es el bloque de video muerto que la profe no quiere.
   **Fix**: `isActivity` → `isTextLesson = !hasVideo && (isActivity || ...)`.
   Fallback discreto si `isActivity && !content`: "El detalle de esta actividad se publicará pronto."
   **NO tocar** `hasVideo ? <LessonVideoSection>`: una actividad CON video grabado sigue mostrando
   el video (caso legítimo; `class_sessions.lesson_id` de `0041` depende de ese camino).
   "Una actividad no tiene repetición" = *no le impongas el bloque de video vacío*, NO =
   *prohíbe el video*.
7. **ADR-0017** (o `0016` si el Cambio 1 no se ejecuta). Registra D6, D7, D8 y **D10 explícitamente**.
8. **CHANGELOG** → Added.

## Decisiones de NEGOCIO pendientes (Cambio 2)
- ~~**N4.** ¿Los 4 valores son correctos o `'integration'` sobra? El brief resume 3 pero cita a
  la profe nombrando integración (4). **Recomendación: los cuatro.** Confirmar.~~ →
  **Corregido: confirmado por la transcripción — son tres (`class | practice | evaluation`).
  `'integration'` NO es un tipo aparte; queda dentro de `'practice'`. Ya no es una decisión de
  negocio pendiente** — si se quiere doble-chequear con la profe, usar su propia frase de
  39:43, no la lista de 19:34 (ver corrección B1).
- **N5.** Copy y color de cada badge (~~Práctica=ámbar, Integración=violeta, Evaluación=lima,
  Clase=sin badge~~ → **Corregido (ver B1): quedan 2 badges — Práctica=ámbar, Evaluación=lima;
  Clase sin badge.**) es propuesta del ejecutor, no de la profe. **Confirmar.**
- **N6.** ¿Quién re-etiqueta las lecciones existentes? Todas quedan `'class'` por el default.
  **No hay script de backfill y no debe haberlo**: requiere criterio pedagógico. Es trabajo de la
  profe post-deploy.

## Tareas operativas (post-deploy, no de código)

> **Agregado tras revisión (15-jul) — B5 y B7.**

- **Renombrar el módulo práctico a "Metodología Comercial"** (dato en admin, no requiere
  migración). Acuerdo explícito de 36:48 (Paola: *"Me gusta mucho la idea, Elkis, de que a la
  parte del módulo práctico, o cuatro clases, las llamemos módulo metodología comercial."*).
- **Agendar la reunión de reestructuración por cursos** (ver D10 / corrección B7), prevista
  para arrancar en septiembre, de cara al diplomado de octubre. Nadie la había agendado aún.

## Riesgos transversales
| Riesgo | Mitigación |
|---|---|
| Colisión de numeración con el plan de Evaluaciones | `ls db/migrations/ \| tail -3` antes de crear. Números orientativos. Aditivas y sin colisión → orden irrelevante. |
| `types.ts` desincronizado | A mano. `pnpm typecheck` lo atrapa. |
| Fuga multi-tenant | No relajar ningún `.eq("program_id")` existente. |
| TZ: la profe pone 9:30 y se guarda 12:30 | Verificación manual explícita (paso 7). |
| Tests de quiz con fixtures incompletos | Helper tolerante a `undefined` + fixtures explícitos. |
| Regresión en el sidebar del final | Pasos 4 y 5 van juntos. |
| Scope creep hacia cursos | D10. Si aparecen tablas nuevas en el Cambio 2, DETENERSE. |

Verificación final: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. NO pushear.

## Referencia cruzada

> **Agregado tras revisión (15-jul) — B8.**

El frente de notas 1-7 vive en `docs/briefs/evaluaciones-y-notas-1-7.md`. Ambos piden la
migración `0070` — coordinar numeración antes de aplicar cualquiera de las dos (ambas son
aditivas y sin colisión de objetos → el orden entre ellas no importa, pero el número sí).
Además, el rename "Quiz de la clase" → "Evaluación de la clase" (acuerdo explícito,
22:52–23:44) vive en el **Paso 9 del brief de Evaluaciones**, pero toca
`components/admin/lesson-edit-form.tsx` — el mismo archivo que el **Paso 4 del Cambio 2** de
este documento. Coordinar para no pisarse.
