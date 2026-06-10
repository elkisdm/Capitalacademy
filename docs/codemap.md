# Code Map — Capitalacademy

> Índice de **dónde vive cada cosa** en este proyecto. Es una PISTA para encontrar
> archivos rápido — verifica siempre contra el código real antes de confiar en una fila.
> El mapa deriva; el código no.
>
> **Mantenimiento automático:** el git post-commit hook detecta cambios estructurales
> (archivos agregados/borrados/renombrados) y deja una nota en `.git/codemap-pending/`.
> Al iniciar la próxima sesión, el agente reconcilia este archivo. `spec-flow` también
> lo actualiza al cerrar cada cambio. No lo edites a mano salvo que quieras corregir algo.
>
> Distinto de: los **ADR** (`docs/adr/`) cuentan el PORQUÉ; este mapa cuenta el DÓNDE.

## Pagos

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/pago/` | Checkout del Diplomado (form + planes/cupones) | `/pago`, `/pago/resultado`, `/pago/gracias` | — |
| `app/pago/cobro/` | Cobro genérico de monto firmado (HMAC) vía Flow | `/pago/cobro?monto=&sig=` | — |
| `app/api/pago/checkout/route.ts` | Inicia checkout del Diplomado (Flow/Fintoc) | `POST /api/pago/checkout` | — |
| `app/api/pago/cobro/route.ts` | Inicia cobro genérico; re-verifica firma del monto | `POST /api/pago/cobro` | — |
| `app/api/pago/cupon/route.ts` | Valida cupones de descuento | `POST /api/pago/cupon` | — |
| `app/api/flow/webhook/route.ts` | Confirma pago Flow vía getStatus + email confirmación | `POST /api/flow/webhook` | — |
| `app/api/fintoc/webhook/route.ts` | Confirma pago Fintoc | `POST /api/fintoc/webhook` | — |
| `lib/flow/` | Cliente Flow: `createFlowCheckout` (acepta `amountOverride`/`subjectOverride`), firma HMAC, status | — | — |
| `lib/fintoc/` | Cliente Fintoc: checkout session, schema de form, webhook | — | — |
| `lib/cobro/sign.ts` | Firma/verifica el monto del cobro genérico (HMAC-SHA256) | — | — |
| `lib/payments/provider.ts` | Resuelve el provider activo (`PAYMENT_PROVIDER`) | — | — |
| `scripts/generate-cobro-link.mjs` | Genera enlaces de cobro firmados (hasta tener página admin) | — | — |
