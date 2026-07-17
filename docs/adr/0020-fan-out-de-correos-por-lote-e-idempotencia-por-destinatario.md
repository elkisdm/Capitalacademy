# ADR-0020: Fan-out de correos por lote e idempotencia por destinatario

- **Status:** proposed
- **Date:** 2026-07-16
- **Deciders:** Elkis Daza (ingeniería)
- **Tags:** data-model, correos, crons, asistencia

## Contexto

`app/api/cron/session-reminders/route.ts` envía los recordatorios de clase (`24h`/`1h`) y la
alerta de inasistencias con dos patrones que la megaauditoría del 2026-07-16 (C4/C5) encontró
insuficientes al escalar a cohortes grandes:

1. **Fan-out secuencial, un correo por request.** `session_reminders` (migración 0026) da
   idempotencia por `(session_id, kind, channel)` — por SESIÓN, no por destinatario. El loop
   de envío es secuencial y sin throttle: con 239 matrículas activas en CAP-CI (cohorte
   `b0000000-…-004`) son 239 requests a Resend en una sola corrida, cruzando el límite real
   de la cuenta (**10 req/s**, confirmado por el texto del error guardado en prod, no los 2/s
   por defecto). Si la corrida muere a mitad de camino, la fila vuelve a `pending`, el
   reclamo la retoma y **reenvía desde el destinatario 1** — duplicados a quienes ya
   recibieron.

2. **`sent` como estado terminal con entregas parciales.** El código previo marcaba
   `status: sent > 0 ? "sent" : ...` — con que UN solo correo se enviara, la fila quedaba en
   estado terminal `sent` y no se reintentaba jamás. Evidencia en prod al 2026-07-16: de las 5
   corridas históricas de `session_reminders` (24 destinatarios cada una), **4 tienen un 429
   de Resend guardado en `error`** y quedaron con `recipients_count` entre 20 y 23 —
   ~10 recordatorios nunca llegaron, sin reintento posible. A 239 destinatarios el mismo
   patrón es masivo.

3. **La alerta de inasistencias evalúa todas las cohortes activas sin mirar el programa**
   (`getStudentsAtAbsenceThreshold`, `lib/asistencia/queries.ts`). CAP-CI (239 matrículas,
   ciclo gratuito de captación) acumula su 2ª ausencia el 2026-07-28 ~16:30 UTC: el cron
   enviaría a 239 personas —equipo interno de CI incluido— un correo que cita "Máximo
   permitido: 3 inasistencias", régimen que ADR-0013 definió solo para el Diplomado.

Ver detalle completo en el informe de la megaauditoría del 2026-07-16 (hallazgos C4/C5;
pendiente de commit en otro frente al momento de escribir este ADR).

## Decisión

### 1. Fan-out por lote con idempotencia por destinatario (C4)

- Nueva tabla `session_reminder_recipients` (migración 0075): bitácora por
  `(session_id, kind, channel, student_id)`. El cron la consulta antes de enviar para calcular
  a quién le FALTA el correo (`missing = recipients - alreadyDelivered`) y solo arma mensajes
  para esos. Un reintento es quirúrgico: no reenvía a quien ya está en la bitácora como
  `sent`.
- Nuevo `lib/email/send-batch.ts` con `sendEmailBatch()`: agrupa los mensajes en lotes de
  hasta 100 (`resend.batch.send`, límite real del SDK `resend@6.12.2`) con un delay de 150ms
  entre lotes y backoff `[1000, 2000, 4000]` ante error. 239 destinatarios pasan de 239
  requests secuenciales a 3 llamadas de batch (~2-4s), muy por debajo del límite de 10 req/s.
  `batchValidation: 'permissive'` permite que un correo inválido dentro del lote no tumbe el
  resto (`errors[]` trae el índice del rechazado).
- `idempotencyKey` por lote, derivada del hash del contenido (`to` de cada mensaje): cierra la
  ventana estrecha entre "Resend aceptó el envío" y "se escribió la bitácora". Es *hardening*,
  no la garantía principal — si la retención de claves de Resend no cubre la ventana de
  catch-up, se puede quitar sin perder la idempotencia real (que vive en la bitácora).
- `session_reminders.status` cambia de significado: **ya no es "se envió algo"**, es "se
  entregó a TODOS los destinatarios". Con entrega parcial, la fila queda `failed`
  (reintentable) en vez de `sent` (terminal) — corrige directamente el bug de los 4/5 envíos
  perdidos en prod.
- `sendSessionReminderEmail` / `sendCapacitacionReminderEmail` (que enviaban un correo cada
  una) se renombran a `buildSessionReminderEmail` / `buildCapacitacionReminderEmail`: arman el
  contenido sin enviarlo, porque el cron es el único llamador y ahora despacha por lote.

### 2. Opt-in por programa de la alerta de inasistencias (C5)

- Nueva columna `programs.attendance_alerts_enabled boolean not null default false`
  (migración 0076). `getStudentsAtAbsenceThreshold` solo evalúa cohortes de programas con
  `attendance_alerts_enabled = true`.
- Se activa explícitamente solo `DIP-VENTAS` (el único programa con alertas realmente
  enviadas: las 24 filas históricas de `attendance_alerts` son todas de esa cohorte).
- **Efecto secundario conocido, no es regresión:** Liderazgo deja de recibir la alerta que
  hoy recibiría (3 alumnos calificarían el 21-jul), pero nunca se envió una alerta a
  Liderazgo — ver ADR-0013, amendment. Se activa con un `UPDATE` de una línea cuando el
  equipo académico lo decida.

## Opciones consideradas

### Opción A — Fan-out por lote + bitácora por destinatario (elegida, C4)
- Pros: corrige la pérdida de correos ya observada en prod; escala a cientos de
  destinatarios sin acercarse al rate limit; reintento quirúrgico.
- Contras: una tabla nueva y un round-trip extra por sesión (lectura de la bitácora).

### Opción B — Aumentar el delay entre correos secuenciales (descartada)
- Pros: cambio de una línea, sin migración.
- Contras: no arregla el problema real (`sent` como estado terminal con entregas
  parciales); a 239 destinatarios con delay conservador el envío se acerca al techo de la
  función serverless; no da idempotencia por destinatario, solo pospone el síntoma.

### Opción C — Deny-list de programas gratuitos/captación para la alerta (descartada, C5)
- Pros: no requiere columna nueva.
- Contras: *fail-open* — el default sigue siendo "todo programa nuevo envía alertas", que es
  exactamente la causa raíz del bug (CAP-CI heredó la alerta en silencio al crearse). Obliga
  además a inventar una taxonomía "programa gratuito/de captación" que no existe en el
  modelo de datos.

### Opción D — Reusar `programs.min_attendance_pct` como gate de la alerta (descartada, C5)
- Pros: cero columnas nuevas.
- Contras: no distingue nada (vale 85 tanto en el Diplomado como en CAP-CI, verificado en
  prod) y conflaría dos conceptos independientes: asistencia mínima para certificación vs.
  opt-in de una alerta operativa.

## Consecuencias

### Positivas
- Deja de perderse correos de recordatorio en cohortes grandes (evidencia real: 4/5 corridas
  históricas con pérdidas).
- El fan-out cabe cómodamente en el presupuesto de tiempo de la función (~2-4s para 239
  destinatarios) y respeta el rate limit real de la cuenta de Resend.
- La alerta de inasistencias deja de alcanzar programas para los que no fue diseñada
  (CAP-CI, Workshop) y el riesgo se cierra por defecto para cualquier programa futuro.

### Negativas
- Tabla nueva (`session_reminder_recipients`) y columna nueva
  (`programs.attendance_alerts_enabled`): más superficie de datos, mismo criterio que
  `session_reminders`/`attendance_alerts` ya existentes.
- Liderazgo deja de recibir una alerta que hoy recibiría el 21-jul (documentado arriba;
  reversible con un `UPDATE`).

### Riesgos
- El comportamiento real de `resend.batch.send` (payload, límite efectivo de 100) no se pudo
  probar contra volumen real desde este entorno; el ensayo de bajo riesgo es la sesión de
  Liderazgo del 2026-07-17 (3 destinatarios reales) antes del evento de 239 del 2026-07-20.
- La retención de `idempotencyKey` en Resend no se pudo verificar; es hardening, no la
  garantía principal.

## Referencias

- `docs/adr/0013-alerta-inasistencias-y-expiracion-qr.md` — define la alerta y su alcance
  (amendment agregado por esta decisión).
- `db/migrations/0026_session_reminders.sql` — contrato de idempotencia por sesión (vigente).
- `db/migrations/0054_attendance_alerts.sql` — bitácora de idempotencia de la alerta.
- `db/migrations/0075_session_reminder_recipients.sql` — bitácora por destinatario (C4).
- `db/migrations/0076_programs_attendance_alerts_optin.sql` — opt-in por programa (C5).
- `db/migrations/0077_recipient_ledgers_deliverable_recording.sql` — bitácora por
  destinatario extendida a entregable-abierto y grabación/seguimiento CAP-CI (amendment
  2026-07-17).
- `lib/email/send-batch.ts` — fan-out por lote.
- `app/api/cron/session-reminders/route.ts` — `processWindow`, `processAbsenceAlerts`.

## Amendment (2026-07-17)

El patrón de fan-out por lote + bitácora por destinatario (sección 1) se extendió a las otras
dos familias de correos que aún hacían fan-out secuencial sin bitácora: apertura de entregable
(`lib/deliverables/notify.ts`) y grabación disponible / seguimiento CAP-CI
(`lib/classroom/recording-notifications.ts`). Mismo mecanismo: `buildDeliverableOpenEmail` /
`buildRecordingAvailableEmail` / `buildCapacitacionFollowupEmail` arman el contenido sin
enviarlo, `sendEmailBatch` despacha, y dos tablas nuevas (`deliverable_open_recipients`,
`recording_notify_recipients`, migración 0077) registran quién ya recibió para que un
reintento sea quirúrgico. Además, ambos crons (`deliverable-openings`,
`recording-notifications`) ganaron un `MAX_PER_RUN = 10` para acotar el trabajo por corrida
(mismo criterio que `flow-reconcile`, ADR-0021).
