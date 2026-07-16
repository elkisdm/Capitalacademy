# ADR-0021: Reconciliación de pagos Flow

- **Status:** accepted
- **Date:** 2026-07-16
- **Deciders:** Eduardo Daza (ingeniería)
- **Tags:** payments, data-model, crons, flow

## Contexto

M10 de la megaauditoría: pagos cobrados por Flow pueden quedar `pending` para siempre.
Verificado en el código y en producción (`igatsyghbadccbrjiurl`):

1. **`app/api/pago/checkout/route.ts`, `app/api/pago/liderazgo/checkout/route.ts` y
   `app/api/pago/cobro/route.ts`** insertan el pago (`status: pending`) y luego hacen un
   segundo `UPDATE` para persistir `commerce_order`, `flow_token` y `flow_order`. Ese UPDATE
   no captura su error (a diferencia del INSERT), y **si falla, el pago queda sin ninguna
   llave con la que reconciliarlo** — ni siquiera `commerce_order`, porque hoy se genera y
   persiste en ese mismo UPDATE.
2. **`app/api/flow/webhook/route.ts`** busca el pago SOLO por `flow_token`. Si el token nunca
   se persistió, o si el webhook de Flow simplemente nunca llega (el caso real observado),
   el pago responde `{ok:true, ignored:"unknown-token"}` sin marcarse `succeeded`. No hay
   ningún proceso que vuelva a preguntar por ese pago más tarde.
3. **No existe reconciliación activa** contra la API de Flow (`payment/getStatus*`). El
   sistema es puramente pasivo: si el webhook no llega, nadie se entera.

**Daño real medido:** 3 pagos de mayo de 2026 ($783.400 CLP en total) fueron cobrados por
Flow (confirmado contra `payment/getStatusByCommerceId`, `status=2`, con `fee` descontado y
`balance` transferido a la cuenta de la empresa) pero quedaron `pending` en la base de datos.
Su causa raíz específica es que el webhook nunca procesó esos 3 pagos (no el bug del UPDATE:
los 3 sí tienen `flow_token`/`commerce_order` persistidos). El bug del UPDATE es una segunda
vulnerabilidad, real pero aún sin víctimas conocidas — este ADR cierra ambas.

## Decisión

1. **`commerce_order` se genera y persiste en el INSERT** (no en el UPDATE posterior) en los
   tres endpoints de checkout. El `id` del pago se genera en el servidor
   (`crypto.randomUUID()`) antes del INSERT para poder derivar `commerce_order` a partir de
   él. Así la llave de reconciliación existe en la base de datos **antes** de que Flow pueda
   cobrar, sin depender de un segundo UPDATE.
2. **El UPDATE posterior de `flow_token`/`flow_order` es best-effort**: se captura y loguea
   su error (`console.error`) pero no aborta el checkout ni bloquea al usuario. Si falla, el
   pago sigue siendo reconciliable por `commerce_order`.
3. **`commerce_order` es la llave canónica de reconciliación, no `flow_token`.** El webhook
   (`app/api/flow/webhook/route.ts`) ahora busca el pago en tres pasos, en orden: (1) por
   `flow_token` (camino normal), (2) por `commerce_order` si Flow lo reporta y el primero no
   matcheó, (3) por `optional.payment_id` (que nosotros mismos enviamos en `payment/create` y
   Flow devuelve firmado de vuelta) como última red.
4. **La API de Flow es la fuente de verdad, el webhook es best-effort.** Nuevo cron
   `app/api/cron/flow-reconcile` (Netlify Scheduled Function cada 15 min, igual patrón que
   `deliverable-openings-cron`) consulta contra Flow (`getStatusByCommerceId`, o
   `getStatus` si no hay `commerce_order`) los pagos `pending` de `provider=flow` dentro de
   una ventana `[15 min, 30 días]` desde su creación:
   - menos de 15 min: margen para no pisar al webhook en vuelo.
   - más de 30 días: se asume abandono de carrito y se auto-limpia (no se reconsulta para
     siempre); huérfanos más viejos que eso se reparan a mano caso por caso.
5. **La idempotencia vive en un único lugar.** Se extrae `lib/flow/process-payment.ts`
   (`processFlowPayment`) con la lógica que antes vivía solo en el webhook: mismatch de monto,
   UPDATE atómico `WHERE paid_at IS NULL` (ahora filtrando por `id` en vez de `flow_token`,
   para que sirva tanto al webhook como al cron), emails, redención de cupón y matrícula.
   Todo nuevo consumidor de pagos Flow (webhook, cron, o futuros) debe pasar por este helper:
   así webhook y cron pueden correr en paralelo sobre el mismo pago sin duplicar emails ni
   matrículas.
6. **Sin migración.** Con 86 filas en `payments`, un índice nuevo sería sobreingeniería —
   `payments_commerce_order_idx` ya existe desde `0003_payments_flow.sql`. El rastro de la
   reparación manual de los 3 huérfanos usa `failure_reason` (columna existente, ya usada por
   el webhook para notas de reconciliación offline).

## Opciones consideradas

### Opción A — `commerce_order` al INSERT + cron de reconciliación (elegida)
- Pros: corrige la causa raíz (webhook perdido sin red de seguridad) y cierra también el
  bug latente del UPDATE sin captura; reusa la guarda de idempotencia existente; sin
  migración.
- Contras: un cron más corriendo cada 15 min; `id` ahora se genera en la app en vez de
  delegarse al default de la columna.

### Opción B — Solo agregar el fallback de búsqueda en el webhook, sin cron (descartada)
- Pros: cambio mínimo, sin infraestructura nueva.
- Contras: **no habría salvado los 3 pagos reales** — su `flow_token` y `commerce_order` ya
  estaban persistidos; el webhook simplemente nunca llegó. Sin un proceso que vuelva a
  preguntar, el mismo modo de fallo se repite indefinidamente.

### Opción C — Mover `commerce_order` al INSERT sin cron, confiando en que el webhook
siempre llega (descartada)
- Pros: cero infraestructura nueva.
- Contras: ignora la evidencia observada (el webhook SÍ puede no llegar, ya ocurrió). Sin
  reconciliación activa, un webhook perdido futuro repite exactamente el mismo daño.

## Consecuencias

### Positivas
- Un pago cobrado por Flow ya no queda sin registrar de forma indefinida en el volumen actual
  (86 pagos históricos, muy por debajo de `MAX_PER_RUN`): en el peor caso (webhook perdido),
  el cron lo recupera en la corrida siguiente (~15 min), priorizando los pagos más nuevos de
  la ventana. Esta garantía depende del volumen: si los pendientes dentro de la ventana de 30
  días superaran `MAX_PER_RUN` (100), los más viejos podrían no ser re-consultados hasta
  envejecer más de 30 días (ver Riesgos y Follow-ups).
- La llave de reconciliación (`commerce_order`) queda garantizada en la base de datos desde
  el INSERT, cerrando también el bug latente del UPDATE sin captura de error.
- Un solo lugar (`processFlowPayment`) concentra la idempotencia y los side-effects de un
  pago Flow exitoso, en vez de duplicar esa lógica entre webhook y cron.

### Negativas
- Un cron adicional corriendo cada 15 min contra la API de Flow (bajo volumen: ~25
  consultas/hora en el peor caso observado).
- El `id` del pago se genera ahora en la aplicación (`crypto.randomUUID()`) en vez de
  delegarse al default `gen_random_uuid()` de la columna, en los tres endpoints de checkout.

### Riesgos
- Cron y webhook procesando el mismo pago en paralelo podrían duplicar emails/matrículas si
  no comparten la guarda atómica — mitigado: ambos pasan por `processFlowPayment`, que hace
  el UPDATE `WHERE paid_at IS NULL` y solo el primero en ganar la carrera dispara
  side-effects.
- El cron podría recuperar un pago viejo y disparar onboarding a destiempo — mitigado con la
  ventana máxima de 30 días; huérfanos más viejos (los 3 de mayo) quedan fuera a propósito y
  se reparan a mano, con la decisión de matrícula escalada al negocio (no son casos
  automáticos).
- Insertar un `id` explícito en vez de usar el default de la columna — riesgo bajo: es un
  INSERT normal sobre una PK con default (`id uuid primary key default gen_random_uuid()`,
  que solo aplica si se omite la columna) y el único trigger de `payments` es BEFORE UPDATE,
  no BEFORE INSERT. Verificado por inspección del esquema (`db/migrations/0003_payments_flow.sql`
  y siguientes), **no por tests**: no existe ningún test bajo `app/api/pago/` que cubra el
  INSERT de los tres endpoints de checkout (ver Follow-ups).
- El cron prioriza los pagos `pending` más nuevos de la ventana (`ascending: false`) y sube
  `MAX_PER_RUN` a 100: si hubiera más de 100 pendientes en la ventana de 30 días, los más
  viejos quedarían sin re-consultar hasta envejecer más de 30 días (inanición). No se
  implementa cierre automático de esos carritos abandonados (ver Follow-ups).

## Follow-ups

- **Cierre de carritos abandonados (decisión de negocio pendiente).** Hoy nada cierra un pago
  `pending` cuyo `status` en Flow es "nunca pagó" (status=1): la línea que lo detecta hace
  `continue` y la fila queda `pending` para siempre. El fix recomendado (marcar
  `status='failed'`, `failure_reason='abandoned'` tras N días sin pago) cambia la semántica de
  los datos de pago y requiere que el negocio defina N — no se implementa en este ADR.
- **Sin tests del INSERT de checkout.** No existe ningún test bajo `app/api/pago/` que cubra
  el INSERT con `id` explícito de `4ce40fe` (el commit más riesgoso de este fix: mueve
  `commerce_order` al INSERT en los tres endpoints de checkout). Quedó sin red de tests;
  la verificación fue solo por inspección de esquema (ver Riesgos).

## Referencias

- `docs/adr/0006-flujo-onboarding-y-matricula.md` — define el contrato pago→matrícula que
  este fix protege (a través de `enrollBuyer`, invocado desde `processFlowPayment`).
- `db/migrations/0003_payments_flow.sql` — columnas `commerce_order`/`flow_token`/
  `flow_order` y su índice existente.
- `db/migrations/0068_payments_document_type.sql` — `document_type`/`invoice_data`, que
  viajan sin cambios a través de `processFlowPayment`.
- `lib/flow/process-payment.ts` — helper compartido de idempotencia y side-effects.
- `lib/flow/status.ts` — `fetchFlowPaymentStatus` / `fetchFlowPaymentStatusByCommerceId`.
- `app/api/cron/flow-reconcile/route.ts` — cron de reconciliación.
- `app/api/cron/deliverable-openings/route.ts` — patrón de cron calcado.
- `scripts/reconcile-dry-run.mjs` — verificación read-only sin ventana temporal.
