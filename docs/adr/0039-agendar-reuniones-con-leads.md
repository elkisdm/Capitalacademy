# ADR-0039: Agendar reuniones reales con un lead, vía Atlas

- **Status:** proposed
- **Date:** 2026-08-26
- **Deciders:** Elkis (desarrollo)
- **Tags:** captación, integraciones, google-workspace, seguridad

## Contexto

El gestor de leads (ADR-0038) agenda "próximos pasos", pero son **recordatorios
internos**: nadie fuera del equipo se entera. La reunión con el prospecto se
sigue coordinando por fuera y no existe en ninguna agenda hasta que alguien la
crea a mano en Google.

Lo que se pidió: agendar desde el panel una reunión que caiga en el calendario
real de la profesora, con invitación al lead y enlace de Meet.

### Lo que se creyó bloqueante y no lo era

La primera versión de la spec declaró que el scope de escritura de calendario no
estaba autorizado y que hacía falta una acción de super-admin en la consola de
Google Workspace. **Era falso.** Verificado de dos formas el 2026-08-26:

1. En *Seguridad → Controles de API → Delegación de todo el dominio*, el cliente
   `Claudia Agent` (ID `117328633791043298469`) ya tiene nueve scopes, entre
   ellos `https://www.googleapis.com/auth/calendar` — escritura completa.
2. Se pidió un token real con ese scope suplantando un buzón del dominio: 200,
   no el 401 que se anticipaba.

Y en Railway, el servicio `Fastapi - Backend` de Atlas Engine tiene
`GOOGLE_SA_CLIENT_EMAIL = claudia-agent-scheduler@encuentro-smart-sheets...`:
**Atlas y Claudia comparten la misma Service Account**, así que Atlas hereda esa
autorización tal cual.

## Decisión

**Atlas expone la escritura de calendario; Capital Academy la consume por HTTP.**

- Atlas gana `POST/DELETE /calendar/events` con `X-API-Key`, el mismo patrón que
  ya usan `/ingest/lead`, `/lookup` y `/reservations`.
- Capital Academy manda la petición desde `lib/atlas/calendario.ts`. **La llave
  privada de la Service Account NUNCA entra a este repo.**
- Una reunión es una `lead_tasks` con `kind = 'meeting'`, no una entidad nueva.

### Por qué Atlas y no Claudia, que ya tenía el código

Claudia ya crea eventos con Meet y hasta detecta choque de horarios. Aun así:

- **Claudia es un producto, no un hub.** Es el agente de voz del negocio
  inmobiliario; que la Academia dependa de él para agendar es un acoplamiento
  raro. Atlas ya sirve a varios consumidores.
- **Sus rutas no eran reusables**: `tools/agendar-reunion` recibe el teléfono de
  un lead de Claudia, exige evaluación de perfil previa y rechaza por DICOM o
  renta baja, con textos para un agente de voz.
- **Portar era barato**: Atlas ya tenía lo difícil (delegación, firma RS256,
  caché de token por buzón). Faltaba un `httpx.post`.

Se renuncia a la detección de choque de horarios, que estaba fuera de alcance.

### Por qué la Academia no habla con Google directamente

La Service Account tiene delegación sobre los **256 buzones del dominio** y nueve
scopes, incluido `gmail.send`. Una tercera copia de esa llave (Claudia, Atlas y
Netlify) multiplica la superficie sin ganar nada.

## Decisiones de diseño

- **Se guarda primero, se agenda después.** Si Atlas o Google fallan, lo que la
  persona escribió no se pierde: la tarea queda con `sync_error` poblado y el
  panel la muestra como "no llegó al calendario". Al revés, un fallo al guardar
  dejaría un evento huérfano que nadie sabría borrar.
- **Nunca reportar como agendado lo que no lo está.** Es la regla que no se
  negocia; de ahí la columna `sync_error` y la insignia en el panel.
- **Borrar la tarea cancela el evento.** Si no, la agenda de la profesora se
  llena de fantasmas y el lead conserva una invitación a una reunión que nadie
  va a dar. Si la cancelación falla no se resucita la fila: se avisa y queda en
  el log.
- **El id del evento se deriva del id de la tarea.** El hex de un UUID es
  subconjunto de base32hex, así que sirve tal cual y hace la creación
  idempotente: reintentar apunta al mismo evento y Google responde 409.
- **El buzón a suplantar NO es un parámetro libre de la ruta de Atlas.** Va
  contra una lista blanca. Sin eso, quien tenga la API key podría agendar y
  mandar invitaciones a nombre de cualquier persona de la empresa.
- **Una instancia del conector por scope.** El caché de tokens de Atlas se indexa
  por buzón y no por scope: compartir instancia serviría un token con permisos
  equivocados sin ningún error visible.

## Consecuencias

### Positivas
- "Reunión agendada" deja de ser algo que alguien anota y pasa a existir.
- El lead recibe una invitación real, con Meet, sin trabajo manual.

### Negativas
- **Correo saliente a prospectos**: el título del evento es texto que una
  persona que dejó sus datos en una landing lee en su bandeja.
- **El correo del lead viaja a Google** como asistente del evento — un flujo de
  datos personales a un tercero que antes no ocurría.
- Capital Academy pasa a depender de Atlas en tiempo de ejecución para esta
  función (degradada, no bloqueante: la tarea se guarda igual).

### Riesgos
- La misma Service Account sirve a Claudia, a Atlas y ahora indirectamente a la
  Academia. Un compromiso de esa llave alcanza los 256 buzones del dominio.
- El ADR-076 de Atlas está desactualizado: dice que su captura se construye "con
  fakes" y que falta la autorización, cuando la cuenta ya está en producción.

## Referencias

- `docs/specs/agendar-reunion-con-lead.md`
- `db/migrations/0108_lead_meetings.sql`
- ADR-0038 (gestor de leads)
- Atlas: `apps/api/app/routers/calendar_events.py`, ADR-076
