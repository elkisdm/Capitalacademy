# ADR-0013: Alerta de inasistencias a 2 clases + expiración proactiva del QR

- **Status:** proposed
- **Date:** 2026-07-10
- **Deciders:** Elkis Daza (ingeniería)
- **Tags:** data-model, classroom, asistencia, correos

## Contexto

El registro de asistencia por QR (`app/asistencia/[sessionId]/`) ya valida una ventana
temporal de [inicio - 20min, fin + 30min] (`lib/asistencia/window.ts`, derivada de
`class_sessions.ends_at`, `timestamptz not null` desde `0001_init_core.sql:117`). Fuera de
esa ventana, el Server Action rechaza el registro con `outside_window`, pero la página no
lo comunica hasta que el alumno hace clic en el botón.

Además, no existe ningún mecanismo que avise proactivamente cuando un alumno acumula
inasistencias a clases en vivo. El equipo académico (reunión del 7-jul-2026, ver
`docs/devlog/2026-07-07.md`) pidió una alerta temprana antes de llegar al máximo tolerado.

## Decisión

1. **Definición de inasistencia:** una sesión EN VIVO (`modality != 'recorded'`,
   `status != 'cancelled'`) de la cohorte ACTIVA del alumno cuya ventana de registro ya
   cerró (`ends_at + 30min < now`) y sin fila en `session_attendance` (ni QR ni manual)
   para ese alumno. Se filtra por audiencia/segmento igual que el resto del sistema
   (`class_sessions.audience` / `enrollments.segment`, migración 0024): una sesión
   `audience='capital_inteligente'` solo cuenta para alumnos con ese segmento.

   No se usa `class_sessions.status = 'finished'` como criterio porque nada transiciona
   ese campo automáticamente (confirmado contra el enum `session_status` de 0001); la
   única exclusión por estado es `'cancelled'`.

2. **Umbral y unicidad:** se avisa al alumno cuando llega a **2 o más** inasistencias
   (`ABSENCE_ALERT_THRESHOLD = 2`), por debajo del máximo tolerado documentado de 3
   (`MAX_ABSENCES_TOLERATED = 3`, citado en el correo). Se eligió `>= 2` en vez de
   `=== 2` exacto: si un alumno salta de 1 a 3 inasistencias entre corridas del cron (o ya
   tenía 3 al desplegar esta feature), igual recibe el aviso una vez. La tabla
   `attendance_alerts` (migración `0054`) garantiza un único envío por
   `(student_id, cohort_id, kind='absence_2')` vía `unique` constraint; el correo cita el
   conteo real (`absences_count`), así que el copy no pierde precisión.

3. **Disparo por el cron existente:** el pase de detección se agrega al cron
   `session-reminders` (cada 30 min, `app/api/cron/session-reminders/route.ts`) en vez de
   crear un endpoint y una Netlify Scheduled Function nuevos. Reusa `CRON_SECRET`, la
   cadencia `*/30` ya configurada y el patrón reserva-antes-de-enviar de
   `session_reminders` (0026). Alternativa descartada: endpoint + función Netlify
   dedicados — más superficie de infraestructura por poco valor a esta escala.

4. **Expiración proactiva del QR:** `lib/asistencia/window.ts` expone
   `getWindowState(session, now): 'before' | 'open' | 'closed'` como única fuente de
   verdad (`isWithinWindow` delega en ella). La página `/asistencia/[sessionId]` calcula
   el estado en el servidor y la tarjeta del alumno muestra el aviso correspondiente
   (`BEFORE_WINDOW_LABEL` / `EXPIRED_WINDOW_LABEL`) sin botón, en vez de esperar a que el
   alumno haga clic para enterarse. El Server Action sigue devolviendo `outside_window`
   como defensa en profundidad si la ventana cambia entre el render y el clic.

5. **Sin columna nueva de horario:** `class_sessions.ends_at` ya es suficiente para
   derivar tanto la expiración del QR como el cierre de una sesión a efectos de conteo de
   inasistencias.

## Opciones consideradas

### Opción A — Pase de inasistencias dentro del cron existente (elegida)
- Pros: reusa `CRON_SECRET`, la Netlify Scheduled Function y la cadencia `*/30` sin nueva
  infraestructura; un solo lugar para razonar sobre "trabajos periódicos de asistencia".
- Contras: mezcla dos responsabilidades (recordatorios pre-clase vs. alertas post-clase)
  en un mismo endpoint.

### Opción B — Endpoint y Netlify Scheduled Function dedicados
- Pros: separación de responsabilidades más limpia.
- Contras: más superficie (nuevo secret o reuso manual, nueva función, nuevo cron) por un
  beneficio marginal a la escala actual (pocas cohortes, <200 alumnos).

## Consecuencias

### Positivas
- El alumno se entera de que su QR expiró sin necesidad de hacer clic.
- El equipo académico recibe (vía el alumno) una señal temprana de desenganche antes del
  máximo tolerado, con un correo cordial y brandeado por entorno.
- Cero infraestructura nueva: mismo cron, mismo secret, mismo patrón de idempotencia.

### Negativas / Riesgos
- El escaneo de inasistencias recorre sesiones cerradas de todas las cohortes activas cada
  30 min. A la escala actual es trivial; si crece, se puede acotar por rango de fechas de
  la cohorte.
- `maxDuration=60` del route: el envío secuencial de correos podría acercarse al límite
  con muchos destinatarios simultáneos. No aplica a la escala actual; si crece, se
  paraleliza o pagina.
- La migración `0054` no se aplica a producción en este ciclo (mismo criterio que 0022,
  0043, 0049): queda escrita y revisada, pendiente de aplicación explícita.

## Referencias

- `lib/asistencia/window.ts` — `getWindowState`, `isWithinWindow`.
- `lib/asistencia/queries.ts` — `getStudentsAtAbsenceThreshold`.
- `app/api/cron/session-reminders/route.ts` — `processAbsenceAlerts`.
- `lib/email/attendance-warning.ts` — correo de advertencia.
- `db/migrations/0054_attendance_alerts.sql` — bitácora de idempotencia.
- `db/migrations/0026_session_reminders.sql` (patrón reserva-antes-de-enviar).
- `db/migrations/0024_audience_and_segment.sql` (audiencia/segmento).
