# ADR-0029: Métricas de actividad del alumno (tiempo dentro de la plataforma)

- **Status:** proposed
- **Date:** 2026-08-05
- **Deciders:** Elkis (producto/desarrollo), Paola (docente), clienta (reunión 2026-07-29)
- **Tags:** data-model, analytics, privacidad, classroom

## Contexto

En la reunión del 29-jul-2026 la clienta pidió poder **medir el uso y el tiempo
que el alumno pasa dentro de la plataforma**: quién la usa, cuánto tiempo, y
quién está inactivo.

Hoy eso no se puede responder. Lo único que se mide es:

- **Progreso de video** (`public.video_progress`, migración 0006): guarda
  `watch_percentage`, `completed` y `last_watched_at` por par
  (matrícula, lección). Solo existe una fila si el alumno abrió un **video**.
- **Asistencia a clases en vivo** (`public.session_attendance`, migración 0050):
  presencia en una sesión sincrónica puntual.

Ninguna de las dos mide tiempo de uso de la plataforma:

1. **Cobertura incompleta.** Leer el foro de conversaciones, rendir un quiz,
   revisar entregables, mirar el calendario o consultar sus notas **no deja
   ningún rastro**. Un alumno que entra todos los días a la comunidad y nunca
   abre un video aparece hoy como completamente inactivo.
2. **`watch_percentage` no es tiempo.** Mide avance del cabezal del reproductor.
   Un alumno que deja el video corriendo en otra pestaña marca 100 % con cero
   atención; otro que retrocede y repite tramos marca menos del 100 % habiendo
   invertido el doble de tiempo.
3. **`last_watched_at` subestima la última conexión.** Es lo más cercano que hay
   a "última vez que se vio al alumno", y es lo que hoy alimenta la columna
   `last_seen` de `/admin/progress` (`lib/classroom/admin-queries.ts`), pero solo
   avanza cuando hay reproducción de video.

Restricciones que condicionan la decisión:

- **Antecedente de timeouts por RLS (21-jul-2026, migración 0079).** Las policies
  de `video_progress` disparaban una cascada RLS → RLS → RLS y el endpoint de
  progreso devolvía `57014` (statement timeout) en caliente. Cualquier escritura
  nueva de alta frecuencia no puede reintroducir ese patrón.
- **Antecedente de PII con RLS abierta (megaauditoría v1, jun-2026).** Esto mide
  el comportamiento de personas identificadas: la RLS tiene que nacer cerrada.
- **Volumen.** Un latido por alumno cada N segundos crece rápido. Con ~400
  matrículas activas y 2 h de uso diario, guardar cada latido de 60 s son
  ~48.000 filas por día (~17 M al año) — inviable para agregar en TypeScript,
  que es como este repo calcula todos sus reportes (no hay ningún RPC de
  agregación; ver `lib/classroom/admin-queries.ts`).

## Decisión

Se construye **una tabla propia de actividad, alimentada por un latido
(heartbeat) y agregada por día calendario de Chile** (Opción A), con tres
restricciones de diseño que salen directamente de los antecedentes de arriba:

1. **Una fila por (matrícula, día), no una fila por latido.** Techo de ~400
   filas/día en vez de ~48.000. El latido **incrementa** un contador en la fila
   del día.
2. **El servidor calcula el tiempo; el cliente solo dice "sigo acá".** El cuerpo
   del `POST` **no lleva segundos**. El incremento se deriva en la base como
   `now() - last_beat_at`, recortado a un tope (`ACTIVITY_MAX_GAP_SECONDS`, el
   doble del intervalo de latido). Con esto un cliente manipulado no puede
   inflar su tiempo: cada latido acredita como máximo ese tope, y un latido
   reenviado por reintento acredita ~0. El latido queda naturalmente idempotente.
3. **Escritura únicamente por `service_role`, en un solo statement atómico.** El
   upsert-con-incremento vive en una función SQL
   (`public.record_student_activity`) invocada por la ruta con el cliente admin.
   Esto evita (a) el patrón leer-modificar-escribir desde TypeScript, que en dos
   pestañas abiertas pierde escrituras, y (b) volver a pagar la cascada de RLS en
   caliente. Es el mismo criterio de ADR-0019 (escritura de intentos solo por
   `service_role`) y el mismo que ya usa `PATCH /api/classroom/progress`.

La tabla se indexa por **`enrollment_id`** y no por `user_id` porque así reusa
tal cual las funciones `owns_enrollment()` / `is_staff_of_enrollment()` que la
migración 0079 ya creó y endureció, y porque todos los paneles del admin son
por cohorte.

**Qué se mide, deliberadamente acotado:** presencia por día y por matrícula
(segundos activos, cantidad de latidos, primer y último latido del día). **No**
se registra ruta visitada, ni tiempo por lección, ni ningún evento por página.
Eso responde las tres preguntas de la clienta sin construir un sistema de
analítica de comportamiento sobre personas identificadas.

## Opciones consideradas

### Opción A — Tabla propia de actividad con latido, agregada por día (elegida)

- Pros
  - Es lo único que responde de verdad la pregunta: mide tiempo de presencia en
    **toda** la plataforma, no solo en el reproductor.
  - El dato vive en la misma base: se cruza con matrícula, cohorte y programa en
    una consulta, y se muestra junto al progreso existente.
  - RLS propia y cerrada desde el primer día.
  - Volumen acotado y predecible por la agregación diaria.
- Contras
  - Código nuevo: tabla, función SQL, endpoint, hook de cliente y panel.
  - Introduce una escritura periódica que antes no existía.
  - Mide "pestaña abierta y visible", que no es lo mismo que atención.

### Opción B — Derivar las métricas de lo que ya existe, sin tracking nuevo

- Pros
  - Cero código nuevo, cero escritura, cero riesgo operacional.
  - Disponible de inmediato y retroactivo (hay historial desde el arranque).
- Contras
  - **No responde la pregunta.** `video_progress` solo existe si hubo video:
    foro, quizzes, entregables, calendario y notas son invisibles.
  - `watch_percentage` mide avance del cabezal, no tiempo invertido.
  - Produciría un reporte de "inactividad" sistemáticamente falso: marcaría como
    inactivo a quien usa todo menos el reproductor. Es peor que no tener el
    reporte, porque se usaría para hacer outreach a la persona equivocada.

### Opción C — Eventos custom a Umami

- Pros
  - Umami ya está cargado en `app/layout.tsx`; no habría tabla ni endpoint nuevo.
  - Su modelo de sesiones ya calcula duración de visita.
- Contras
  - **Privacidad.** Atribuir tiempo a una persona exige mandar el `user_id` a un
    tercero. Es exactamente la clase de exposición de PII que la megaauditoría v1
    marcó como bloqueante. Hoy Umami solo recibe pageviews anónimos de marketing.
  - **No es consultable desde el producto.** Los datos quedan fuera de la base:
    no se pueden cruzar con cohorte ni matrícula, ni mostrar junto al progreso
    en `/admin/progress`. Habría que consumir la API de Umami desde otro dominio.
  - **La instalación actual no lo soporta.** El script y el `data-website-id`
    están hardcodeados sin variable de entorno, y `window.umami.track` no se usa
    en ninguna parte del repo: habría que instrumentarlo igual.
  - Los bloqueadores de anuncios eliminan una fracción del tráfico, sesgo
    aceptable para marketing pero no para un reporte de cumplimiento del alumno.

## Consecuencias

### Positivas

- `/admin/actividad` responde las tres preguntas de la reunión con un dato
  propio: quién usó la plataforma, cuánto tiempo, y quién lleva N días sin
  aparecer.
- El indicador de "última conexión" deja de depender de que el alumno haya
  abierto un video.
- La tabla queda lista para alimentar en el futuro las alertas de inactividad,
  reusando el patrón de `attendance_alerts` (0054).
- El diseño elegido no toca `PATCH /api/classroom/progress` ni sus policies: el
  camino caliente que ya sufrió el incidente de 0079 queda intacto.

### Negativas

- Una escritura periódica adicional por alumno conectado. Con latido de 60 s y
  ~50 alumnos simultáneos es < 1 escritura por segundo, despreciable, pero es
  tráfico que antes no existía.
- El dato **no es retroactivo**: la serie arranca el día que se despliega.
- El panel muestra tiempo con la pestaña **abierta y visible**, que sobreestima
  respecto de la atención real y subestima respecto del estudio con material
  descargado. Hay que rotularlo así en la interfaz para que nadie lo lea como
  "horas de estudio".

### Riesgos

- **Corte de medianoche.** Una sesión que cruza la medianoche de Chile abre fila
  nueva y su primer latido acredita 0 s. La pérdida es de a lo más un intervalo
  de latido por alumno y por día; se acepta a cambio de no tener que reconciliar
  sesiones que cruzan días.
- **Sobrestimación por pestaña olvidada.** Mitigado porque el latido se detiene
  cuando la pestaña deja de estar visible (`visibilitychange`), no solo cuando se
  cierra.
- **Interpretación del dato.** El riesgo mayor no es técnico: es que "20 minutos"
  se lea como una nota. La métrica sirve para detectar ausencia, no para evaluar
  desempeño; para eso están las evaluaciones (ADR-0018, ADR-0022).
- **Retención.** No se define política de borrado en esta ADR. La tabla crece
  ~150.000 filas al año en el peor caso; cuando eso importe, se resuelve con un
  borrado de filas de más de N meses, que es trivial sobre un agregado diario y
  habría sido imposible sobre un log de latidos.

## Referencias

- `db/migrations/0087_actividad_alumno.sql` — tabla, índices, RLS y función.
- `db/migrations/0079_rls_initplan_optimization.sql` — incidente de timeouts por
  cascada de RLS; origen de `owns_enrollment` / `is_staff_of_enrollment`.
- `db/migrations/0006_classroom.sql` — `video_progress`, el tracking que existe.
- `db/migrations/0084_access_email_log.sql` — patrón de bitácora con RLS de solo
  lectura para staff y escritura exclusiva por `service_role`.
- [ADR-0003](0003-tracking-progreso-video.md) — tracking de progreso de video.
- [ADR-0019](0019-escritura-de-intentos-solo-por-service-role.md) — escritura
  sensible solo por `service_role`.
- `docs/audit/` — megaauditoría v1 (jun-2026), hallazgo de PII con RLS abierta.
