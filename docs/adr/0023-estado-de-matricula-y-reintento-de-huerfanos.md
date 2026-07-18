# ADR-0023: Estado de matrícula por pago y reintento de huérfanos (A1)

- **Status:** proposed
- **Date:** 2026-07-17
- **Deciders:** Eduardo Daza (ingeniería)
- **Tags:** payments, data-model, crons, flow, matrícula

## Contexto

Megaauditoría global 2026-07-17, hallazgo A1: un pago Flow que llega a `succeeded` dispara,
dentro de `processFlowPayment` (`lib/flow/process-payment.ts`), la matrícula del comprador
(`enrollBuyer`, en `lib/classroom/enroll-from-payment.ts`) en la cohorte activa de su
programa. Antes de este ADR, si `enrollBuyer` fallaba (cohorte inactiva, `generateLink` caído,
error de Resend al enviar el onboarding, etc.), el fallo solo se logueaba con
`console.error` — el pago quedaba `paid_at` no-nulo y `status='succeeded'` para siempre, y
**nada volvía a intentar la matrícula**. `firstSuccess` no vuelve a ser `true` para ese pago
(la guarda atómica `UPDATE … WHERE paid_at IS NULL` ya lo marcó), y el cron
`flow-reconcile` (ADR-0021) solo consulta pagos `status='pending'` — un `succeeded` con
matrícula fallida es invisible para él. Es la misma clase de incidente que los 3 pagos de
mayo ($783.400 CLP, ver ADR-0021): plata cobrada, alumno nunca matriculado, sin alerta.

A diferencia de ADR-0021 (webhook perdido → pago nunca llega a `succeeded`), acá el pago SÍ
está `succeeded` — el problema es un paso posterior (matrícula) sin estado propio ni
reintento.

## Decisión

1. **Cuatro columnas nuevas en `payments`** (migración `0078_payments_enrollment_state.sql`):
   `enrollment_status` (`'not_applicable' | 'pending' | 'enrolled' | 'failed'`, default
   `'pending'`), `enrolled_at`, `enrollment_attempts` (default `0`), `enrollment_error`. El
   default `'pending'` es correcto solo para pagos **futuros**; el backfill de la misma
   migración cierra los `succeeded` históricos como terminales (`enrolled` si el plan es
   matriculable, `not_applicable` si no) para que el reconcile no los reprocese en masa al
   desplegar.
2. **`runPaymentEnrollment` (`lib/flow/process-payment.ts`), nueva función reinvocable e
   idempotente** que reemplaza el bloque de matrícula inline que antes vivía dentro de
   `processFlowPayment`. Nunca lanza (try/catch propio) y persiste el resultado en
   `enrollment_*`:
   - Plan no matriculable → `enrollment_status='not_applicable'`.
   - `enrollBuyer` exitoso → `enrollment_status='enrolled'` + `enrolled_at`.
   - `enrollBuyer` falla → `enrollment_status='failed'`, `enrollment_attempts` incrementado,
     `enrollment_error` con el mensaje. Se trata como `failed` incluso cuando el error viene
     del envío del correo de onboarding (`enrollResult.error` con prefijo `email:`): el
     alumno ya quedó matriculado en `enrollments`, pero sin el correo con el link de acceso
     el resultado práctico es el mismo huérfano funcional (no puede entrar), así que se
     reintenta igual — reintentar es seguro porque el paso 2 de `enrollBuyer` (upsert de
     `profiles`) y el paso 3 (upsert de `enrollments`) son ambos idempotentes.
   - Retorna el estado (`"enrolled" | "failed" | "not_applicable"`) en vez de `void`: el
     cron (punto 4) cuenta recuperados con el valor devuelto, sin un SELECT extra por fila.
3. **Alerta al equipo por correo** (`sendEnrollmentFailureNotification`, en
   `lib/email/payment-confirmation.ts`, reutilizando `getResendClient`/`FROM_EMAIL`/
   `TEAM_NOTIFICATION_EMAIL`/`resolveProgram`/`moneyFormatter`/`escapeHtml` ya existentes en
   ese archivo) solo en el primer intento (`attempts === 1`, para no perder el aviso inicial)
   y en el último (`attempts >= MAX_ENROLL_ATTEMPTS`, marcado "ACCIÓN MANUAL" porque el
   reintento automático se agotó). Los intentos intermedios no alertan, para no saturar la
   bandeja del equipo con reintentos que el cron ya está manejando solo.
4. **2º pase en `app/api/cron/flow-reconcile`** (`reconcileEnrollments`): además del pase
   existente sobre `status='pending'` (ADR-0021), consulta pagos `status='succeeded'` con
   `enrollment_status in ('pending','failed')` y `enrollment_attempts < MAX_ENROLL_ATTEMPTS`,
   con el mismo grace de 15 min sobre `paid_at` (para no pisar al webhook/cron principal en
   vuelo) y reintenta `runPaymentEnrollment` para cada uno. No consulta la API de Flow — la
   plata ya está confirmada, el problema es puramente de matrícula.
5. **Tope de reintentos (`MAX_ENROLL_ATTEMPTS = 5`).** Pasado ese número, el pago deja de
   reintentarse automáticamente (queda fuera del `WHERE` del cron) y la última alerta indica
   que requiere acción manual.

## Opciones consideradas

### Opción A — Columnas de estado + reintento en el cron existente (elegida)
- Pros: reintento automático real (no solo logging); backfill controla el volumen de
  reproceso al desplegar; reusa la infraestructura de `flow-reconcile` en vez de un cron
  nuevo; alerta acotada (primer y último intento) evita ruido.
- Contras: migración adicional; una tabla más de estado que mantener sincronizada con
  `status`/`paid_at`.

### Opción B — Solo mejorar el logging (alertar sin persistir estado ni reintentar) (descartada)
- Pros: cambio mínimo, sin migración.
- Contras: no resuelve el problema real — el alumno sigue sin matricularse hasta que alguien
  lea el log y actúe a mano. No es distinto en la práctica al estado actual (que ya loguea).

### Opción C — Reintentar solo desde el webhook/checkout, sin cron (descartada)
- Pros: sin tocar `flow-reconcile`.
- Contras: si el fallo de matrícula ocurre en el único intento (webhook), no hay ningún
  disparador posterior — exactamente el bug que se está cerrando.

## Consecuencias

### Positivas
- Un pago `succeeded` con matrícula fallida ya no es invisible: tiene estado propio
  (`enrollment_status`), se reintenta automáticamente cada 15 min hasta 5 veces, y el equipo
  recibe alerta en el primer y último intento.
- `runPaymentEnrollment` retorna el estado resultante, evitando un SELECT extra por fila en
  el cron.
- La lógica de reintento es la misma para webhook y cron (una sola función), igual que
  `processFlowPayment` en ADR-0021.

### Negativas
- Dos columnas de estado más en `payments` (`enrollment_status`, `enrollment_attempts`) que
  hay que mantener coherentes con el ciclo de vida del pago.
- El backfill de la migración marca todos los `succeeded` históricos como terminales
  (`enrolled`/`not_applicable`) asumiendo que el código viejo los procesó correctamente — si
  alguno de esos pagos históricos en realidad nunca se matriculó (huérfano previo a este
  ADR), el backfill NO lo detecta ni lo repara; solo cierra pagos futuros.

### Riesgos
- El caso `email:` tratado como `failed` reintenta `enrollBuyer` completo (no solo el envío
  del correo): los upserts de `profiles`/`enrollments` son idempotentes por diseño
  (`ignoreDuplicates`/`onConflict`), así que el reintento no debería duplicar ni degradar
  datos, pero si `sendInvitationEmail`/`sendDiplomadoInvitationEmail` alguna vez dejaran de
  ser idempotentes (reenvío visible al alumno), este ADR heredaría ese comportamiento.
- `MAX_ENROLL_ATTEMPTS = 5` es un número elegido sin datos históricos de cuántos reintentos
  hacen falta en la práctica; si el error es sistemático (p. ej. cohorte inactiva por
  varios días), los 5 intentos se agotan en ~75 minutos y el caso pasa a manual antes de que
  alguien pueda arreglar la causa raíz.

## Referencias

- `docs/adr/0021-reconciliacion-de-pagos-flow.md` — reconciliación de pagos `pending`
  perdidos; este ADR cubre el caso complementario (`succeeded` con matrícula huérfana).
- `docs/adr/0006-flujo-onboarding-y-matricula.md` — contrato pago→matrícula (`enrollBuyer`).
- `db/migrations/0078_payments_enrollment_state.sql` — columnas, constraint e índice nuevos.
- `lib/flow/process-payment.ts` — `runPaymentEnrollment`, `isEnrollablePlan`.
- `lib/email/payment-confirmation.ts` — `sendEnrollmentFailureNotification`.
- `app/api/cron/flow-reconcile/route.ts` — `reconcileEnrollments` (2º pase).
