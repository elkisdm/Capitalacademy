# Agendar reuniones reales con un lead desde `/admin/leads`

**Clasificación**: `feat` · large · riesgo **alto** · known · cruza DOS repos
(`Capitalacademy` y `atlas/core`) + una autorización de dominio en Google Workspace
**Tier**: 3 — Full
**Depende de**: ADR-0038 (gestor de leads, en prod) · ADR-076 de Atlas (captura de
Google Workspace, `proposed`, flags apagados)

---

## Objetivo

Que desde el detalle de un lead se pueda agendar una reunión real: el evento aparece
en el Google Calendar de Paola (`pvicuna@capitalinteligente.cl`), el lead recibe la
invitación en su correo y el evento trae enlace de Meet.

Hoy "Próximos pasos" solo agenda un recordatorio **interno**. La reunión con el
prospecto sigue coordinándose por fuera y no existe en ninguna agenda hasta que
alguien la crea a mano.

---

## El bloqueante que creí que había NO existe

**Corrección.** En la primera versión de esta spec declaré que el scope de escritura no
estaba autorizado y que hacía falta una acción de super-admin en la consola. Es falso, y
lo verifiqué de dos formas:

1. **En la consola** (*Seguridad → Controles de API → Delegación de todo el dominio*): el
   cliente **`Claudia Agent`, ID `117328633791043298469`**, ya tiene autorizados nueve
   scopes, entre ellos `https://www.googleapis.com/auth/calendar` — el de
   lectura/escritura completa, que crea, mueve y cancela eventos y genera enlaces de Meet.
   También tiene `meetings.space.created`, `calendar.events.readonly`, `gmail.send` y
   `gmail.settings.basic`.
2. **Pidiendo un token de verdad**: la Service Account
   `claudia-agent-scheduler@encuentro-smart-sheets.iam.gserviceaccount.com` obtuvo un
   token con scope `calendar` impersonando a `pvicuna@capitalinteligente.cl`, y leyó su
   calendario primario (`America/Santiago`). El intercambio JWT devolvió 200, no el 401
   que yo anticipaba.

**No hay ninguna acción pendiente en la consola de Google.** La tarea 0 de la versión
anterior se elimina.

De paso, esto revela que el comentario de Atlas que dice que `gmail.settings.basic` "hoy
no está autorizado" está **desactualizado**: sí lo está.

## Atlas y Claudia comparten la MISMA cuenta de servicio

Verificado leyendo las variables del servicio `Fastapi - Backend` del proyecto
`Atlas Engine` en Railway:

```
GOOGLE_SA_CLIENT_EMAIL: claudia-agent-scheduler@encuentro-smart-sheets.iam.gserviceaccount.com
GOOGLE_SA_PRIVATE_KEY:  [configurada]
GOOGLE_EMAIL_API_ENABLED: true
```

Es exactamente la cuenta que aparece en la consola como **Claudia Agent**, client ID
`117328633791043298469`, la que ya tiene `calendar` de escritura. **Atlas hereda esa
autorización tal cual**: crear eventos desde Atlas no necesita ningún paso de consola.

Esto además corrige dos cosas que el ADR-076 dice y ya no son ciertas:
- Dice que la Fase 1 *"se construye y testea con fakes"* y que falta la autorización.
  Falso hoy: la cuenta está configurada en producción y `GOOGLE_EMAIL_API_ENABLED` está
  en `true`.
- Pedía una Service Account *"en un proyecto GCP dentro de la organización de
  capitalinteligente.cl"*. La que se usa vive en el proyecto `encuentro-smart-sheets`.
  No bloquea nada, pero el ADR y la realidad no coinciden.

## Por qué Atlas y no Claudia, aunque Claudia tenga el código hecho

`Claudia IA/src/modules/calendario/google/proveedor.ts` ya crea el evento contra
`.../events?conferenceDataVersion=1&sendUpdates=all` con `conferenceData.createRequest`,
devuelve el `hangoutLink` y hasta detecta choque de horarios (`CupoOcupadoEnGoogle`,
`freebusy.ts`). Tentador reusarlo — pero:

- **Claudia es un producto, no un hub.** Es el agente de voz del negocio inmobiliario.
  Que la Academia dependa de él para agendar es un acoplamiento raro; que dependa de
  Atlas es lo normal — Atlas ya sirve a varios consumidores por `X-API-Key`
  (`/ingest/lead`, `/lookup`, `/requalify`, `/reservations`).
- **Sus rutas no son reusables**: `POST /api/tools/agendar-reunion` recibe el teléfono de
  un lead de Claudia, exige evaluación de perfil previa y rechaza por DICOM o renta baja,
  con textos redactados para que los diga un agente de voz.
- **Lo que hay que portar es poco.** Atlas ya tiene lo difícil: DWD, firma RS256, caché de
  token por buzón. Falta un `httpx.post` con los mismos parámetros de query. Son decenas
  de líneas, no un módulo.

Se pierde la detección de choque de horarios, que de todos modos estaba fuera de alcance.

## Hallazgos de exploración

1. **La plomería existe y es reusable.** `GoogleWorkspaceConnector` recibe el scope por
   constructor, firma su propia aserción RS256 con `PyJWT` (sin SDK de Google) y cachea
   el token por buzón. Una instancia con scope de escritura es un cambio de una línea
   *en código* — el costo real es la autorización.
2. **Atlas hoy solo captura, no agenda.** El ADR-076 lo dice literal: *"el objetivo no
   es disponibilidad ni agendamiento"*. Es un cron que lee 256 buzones y cuelga al lead
   las reuniones que ya existen. Su único endpoint es `/google-activity/health`.
3. **Atlas ya tiene patrón server-to-server para terceros**: `X-API-Key` vía
   `verify_api_key`, usado por `/ingest/lead`, `/lookup`, `/requalify` y `/reservations`.
   El endpoint nuevo entra por ahí; no hay que inventar autenticación.
4. **Capital Academy ya sabe federarse**: `lib/surveys/remote.ts` (ADR-0026) es el molde
   de una integración server-to-server con otro sistema de la empresa.
5. **Capital Academy NO tiene hoy ninguna referencia a Atlas** ni variables de entorno
   hacia él. Es un contrato nuevo.
6. **Trampa del caché de tokens**: `_tokens` se indexa por `subject_email`, no por scope.
   Dos scopes conviviendo exigen DOS instancias del conector; reusar una y mutarle el
   scope serviría un token con permisos equivocados sin ningún error visible.

---

## Supuestos (corrígeme si alguno está mal)

1. **La llamada a Google vive en Atlas.** Ya tiene la cuenta de servicio configurada en
   producción, la autorización de escritura heredada, y es el hub que el resto de los
   sistemas ya consume. Capital Academy habla con Atlas por HTTP y **nunca ve la llave
   privada**: copiarla a Netlify sería una tercera copia de una credencial con delegación
   sobre todo el dominio.
2. **La reunión es una `lead_task`, no una entidad nueva.** Una reunión ES un próximo
   paso con hora; se le agregan columnas nullable. Así la franja de pendientes y el
   digest diario la cubren sin código nuevo.
3. **El evento se crea impersonando a Paola**, así que la invitación sale a nombre de
   ella. Es lo esperado: la reunión es con ella.
4. **Duración por defecto 45 minutos**, editable al agendar.
5. **Si Atlas falla, la tarea local se guarda igual** y queda marcada como no
   sincronizada. Perder lo que la persona escribió es peor que un evento faltante; lo
   inaceptable es que *parezca* agendado sin estarlo.
6. **Borrar una tarea con evento borra el evento en Google.** El propio centinela de
   Atlas vigila "una reunión agendada que ya no existe en el calendario real" como falla
   que el cliente sufre en persona; dejar fantasmas en la agenda de Paola es esa falla al
   revés.

---

## Criterios de aceptación

- [ ] Desde el detalle de un lead se agenda una **reunión** (además del recordatorio
      interno que ya existe), con fecha, hora y duración.
- [ ] El evento aparece en el calendario de Paola con el lead como invitado.
- [ ] El evento trae **enlace de Meet** y ese enlace se muestra en el panel.
- [ ] El lead recibe la invitación de Google en el correo con que se registró.
- [ ] Si el scope no está autorizado o Atlas no responde, la tarea queda guardada y
      **visiblemente marcada como no agendada** — nunca aparece como si estuviera en el
      calendario.
- [ ] Borrar o completar la reunión desde el panel **borra el evento en Google**.
- [ ] Reintentar el agendamiento de la misma tarea **no duplica** el evento.
- [ ] Nada de esto es alcanzable sin ser `ops`/`admin`.
- [ ] Con la funcionalidad apagada por bandera, `/admin/leads` se comporta exactamente
      como hoy.

---

## Técnico

### Reparto entre repos

```
/admin/leads  ──POST /api/admin/leads/[leadId]/meetings──▶  Capital Academy (Next)
                                                                  │
                                          X-API-Key + HTTPS       │
                                                                  ▼
                              POST /calendar/events  ─────▶  Atlas (FastAPI)
                                                                  │
                                    DWD, impersona a Paola        │
                                                                  ▼
                                                          Google Calendar API
```

### En Atlas (`~/Developer/trabajo/atlas/core`)

- **Instancia separada del conector** con `CALENDAR_WRITE_SCOPE`
  (`https://www.googleapis.com/auth/calendar`). Separada y no mutando la existente: el
  caché `_tokens` se indexa por buzón y NO por scope, así que compartir instancia
  serviría un token con permisos equivocados sin ningún error visible.
- `create_event` / `delete_event` en `connectors/google_workspace.py`, portando lo que
  Claudia ya probó: `conferenceDataVersion=1&sendUpdates=all` y
  `conferenceData.createRequest` para que Google genere el Meet.
- Router nuevo `routers/calendar_events.py` con `Depends(verify_api_key)`:
  `POST /calendar/events` y `DELETE /calendar/events/{event_id}`.
- **El buzón a impersonar NO es un parámetro libre**: se valida contra una lista blanca de
  configuración. Una ruta que acepta cualquier buzón le da a quien tenga la API key la
  capacidad de crear eventos y mandar invitaciones a nombre de cualquier persona del
  dominio.
- Recibe: título, inicio, duración, correo del invitado y un `client_event_id`.
- **Idempotencia**: el `id` del evento lo genera quien llama (Capital Academy manda uno
  derivado de `lead_tasks.id`). Google responde 409 si ya existe → se traduce a 200 con
  el evento existente. Un reintento nunca duplica.

### En Capital Academy

- **Migración `0108`**: columnas nullable en `lead_tasks` — `kind` (`'task'|'meeting'`),
  `duration_minutes`, `google_event_id`, `meet_url`, `sync_error`. Aditiva; toda tarea
  existente es `'task'`.
- `lib/atlas/calendario.ts` — cliente HTTP hacia Atlas, molde de `lib/surveys/remote.ts`.
- `app/api/admin/leads/[leadId]/meetings/route.ts` — `POST` crea la tarea y luego llama a
  Atlas; `DELETE` en la ruta de tareas ya existente se extiende para borrar el evento.
- UI: el formulario de "Agendar" gana un selector Recordatorio / Reunión; con Reunión
  aparecen duración y el aviso de que el lead recibirá invitación.

### Variables de entorno nuevas

`ATLAS_API_URL` y `ATLAS_API_KEY` en Netlify, más `NEXT_PUBLIC_MEETINGS_ENABLED` como
bandera de apagado. La llave de la Service Account NO entra a Capital Academy.

---

## Spec (Given / When / Then)

**Escenario: agendar una reunión**
- GIVEN un lead con correo y el scope autorizado
- WHEN se agenda una reunión para mañana a las 11:00
- THEN el evento existe en el calendario de Paola con el lead invitado y Meet, y el
  panel muestra el enlace

**Escenario: Atlas caído no miente**
- GIVEN Atlas no responde
- WHEN se agenda una reunión
- THEN la tarea queda guardada, marcada "no llegó al calendario", y el panel lo dice

**Escenario: el reintento no duplica**
- GIVEN una reunión que ya creó su evento
- WHEN se reintenta el agendamiento
- THEN Google devuelve el evento existente y no se crea un segundo

**Escenario: borrar limpia la agenda de Paola**
- GIVEN una reunión con `google_event_id`
- WHEN se borra desde el panel
- THEN el evento desaparece del calendario de Paola

**Escenario: no se puede agendar en el buzón de cualquiera**
- GIVEN una petición con `X-API-Key` válida pero un buzón fuera de la lista blanca
- WHEN llega a `/calendar/events`
- THEN responde 422 y no se crea nada

**Escenario: la bandera apagada no cambia nada**
- GIVEN `NEXT_PUBLIC_MEETINGS_ENABLED` apagada
- WHEN se abre un lead
- THEN solo existe el recordatorio interno de hoy

---

## Tareas

1. Atlas: conector con scope de escritura + `create_event` / `delete_event`, con tests.
2. Atlas: router `/calendar/events` con `X-API-Key`, lista blanca de buzones e
   idempotencia por 409, con tests.
3. Atlas: probar contra el calendario real de Paola con un correo de prueba propio.
4. Capital Academy: migración `0108`.
5. Capital Academy: `lib/atlas/calendario.ts` + ruta de reuniones, con tests.
6. Capital Academy: borrado que limpia el evento.
7. UI del formulario Recordatorio / Reunión.
8. ADR-0039, codemap, CHANGELOG.

---

## Fuera de alcance

- **Disponibilidad**: no se consulta si Paola está libre. Quien agenda mira su calendario.
- **Reprogramar** desde el panel (borrar y volver a crear cubre el caso).
- **Recordatorio propio** del evento: se usa el de Google.
- Agendar en el calendario de alguien que no sea Paola (la ruta nueva debe rechazar
  cualquier otro buzón: si acepta impersonar a quien sea, es una escalada dentro del
  dominio).
- Reuniones con alumnos matriculados (esto es captación).
- Encender la captura del ADR-076 (leer reuniones existentes) — es otro frente.

---

## Riesgos

- **Correo saliente a prospectos.** La invitación llega al correo personal de gente que
  dejó sus datos en una landing. Es comunicación de la empresa hacia afuera: el título y
  la descripción del evento son texto que el prospecto lee.
- **El correo del lead viaja a Google** como asistente del evento. Es un flujo de datos
  personales a un tercero que hoy no ocurre.
- **La Service Account tiene delegación sobre TODO el dominio** y nueve scopes, incluida
  escritura de calendario y `gmail.send`. Ya es así hoy; este cambio no la amplía, pero sí
  suma un consumidor más. Es el argumento más fuerte para que la llave nunca salga de
  Atlas y para que la ruta nueva valide qué buzón se puede impersonar en vez de aceptar
  cualquiera.
