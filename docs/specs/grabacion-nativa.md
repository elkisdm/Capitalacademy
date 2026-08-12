# Grabación nativa de las clases en vivo

**Clasificación**: `feat` · large · **riesgo alto** (infra nueva + PII en video + toca el webhook de Mux que está en producción) · toca `lib/livekit/`, `lib/classroom/`, `app/api/classroom/clase/`, `app/api/webhooks/`, `components/classroom/live/`
**Tier**: 3 — Full
**Estado**: especificado, sin implementar
**Fecha**: 2026-08-12
**ADR**: [0034](../adr/0034-grabacion-nativa-clases-en-vivo.md)

---

## Objetivo

Que una clase en vivo dictada en `/sala/<código>` aparezca como repetición en la
pantalla de la clase —con transcripción, resumen y capítulos— **sin que nadie
descargue ni suba un archivo**.

La frase que esto tiene que habilitar es la del docente al terminar la clase:

> "Listo, cierro la sala y me voy."

---

## Lo que ya existe y se reusa sin tocar

| Pieza | Qué aporta |
|---|---|
| `lib/livekit/config.ts` | `getLiveKitConfig()` y el 503 que nombra las variables que faltan |
| `lib/livekit/access.ts` | `decideRoomAccess()` y `roomNameForSession()` — el gate de quién es docente de esa cohorte |
| `lib/livekit/token.ts` | `createAccessToken()` — se le agrega **un** campo al grant |
| `lib/livekit/meeting-code.ts` | `parseSessionRef()` — la ruta acepta código o UUID |
| `lib/mux/client.ts` | `getMuxClient()` |
| `lib/classroom/recording-notifications.ts` | aviso "grabación disponible" (se dispara solo desde el webhook de Mux) |
| `lib/classroom/correct-transcript.ts`, `generate-summary.ts`, `generate-chapters.ts` | la cadena de IA, disparada por `video.asset.track.ready` |
| `lib/api/cron-auth.ts` | `authorizeCron()` |
| `lib/rate-limit.ts` | `createRateLimiter()` |
| El patrón twirp de `app/api/classroom/clase/[sessionId]/moderar/route.ts` | cómo se llama a LiveKit desde el servidor con un token de servicio de 60 s. **Confirma además que los endpoints twirp aceptan JSON en snake_case** (`track_sid` funciona en producción) |
| El patrón de bucket privado de `db/migrations/0053_entregables.sql` y `0029` | bucket sin policies + URLs firmadas server-side |
| El patrón de cron de `netlify/functions/recording-notifications-cron.mjs` | Netlify Scheduled Function que delega en un route handler con `CRON_SECRET` |

**No se toca nada del camino manual.** `MuxUploader`, `/api/admin/mux/upload` y
el flujo de "Preparar y subir repetición" siguen exactamente igual: son el
respaldo cuando la grabación nativa falla.

---

## Decisiones cerradas (detalle en ADR-0034)

- **D1** — Egress como servicio propio en Railway (no navegador, no LiveKit Cloud).
- **D2** — Salida MP4 a Supabase Storage por S3, no RTMP directo a Mux.
- **D3** — El asset lo crea la app con la misma configuración que la subida manual.
- **D4** — El webhook de Mux ubica la lección por `mux_asset_id` cuando no hay `upload_id`.
- **D5** — Una grabación activa por sala; arranca sola al conectarse el docente, termina sola al cerrarse la sala.
- **D6** — El estado vive en `session_recordings`.
- **D7** — El archivo intermedio se borra cuando Mux confirma; 14 días de retención si falla.

---

## El hallazgo que hay que arreglar sí o sí

`app/api/webhooks/mux/route.ts`, hoy en producción:

```ts
if (event.type === "video.asset.ready") {
  const { id: assetId, upload_id, playback_ids, duration } = event.data;
  if (!upload_id) {
    return NextResponse.json({ received: true });   // ← un asset por URL sale por acá
  }
```

Un asset creado por ingesta de URL **no tiene `upload_id`**. Sin el arreglo de
D4, la repetición nativa queda en "Procesando en Mux…" para siempre y no hay un
solo error en los logs. Es el mismo tipo de falla silenciosa que el CSP.

**El arreglo, mínimo y quirúrgico:** resolver el `lessonId` antes del update,
por `mux_upload_id` **o** por `mux_asset_id`, y dejar el resto del handler
—miniatura inteligente, idempotencia, avisos— intacto.

---

## Máquina de estados de una grabación

```
                 POST /grabacion
                       │
                       ▼
   ┌──────────┐  egress_started   ┌────────┐  egress_ended(ok)  ┌──────────┐
   │ starting ├──────────────────►│ active ├───────────────────►│ uploaded │
   └────┬─────┘                   └───┬────┘                    └────┬─────┘
        │ StartEgress falla           │ egress_ended(error)          │ ingesta
        ▼                             ▼                              ▼
   ┌────────┐                    ┌────────┐                    ┌───────────┐
   │ failed │◄───────────────────┤ failed │                    │ ingesting │
   └────────┘                    └────────┘                    └─────┬─────┘
                                                                     │ video.asset.ready
                                                                     ▼
                                                               ┌───────┐   borrado del objeto
                                                               │ ready ├──► storage_deleted_at
                                                               └───────┘
```

Toda transición la escribe el servidor. El cliente solo pide arrancar o detener y
lee el estado.

---

## Contrato del API

### `GET|POST|DELETE /api/classroom/clase/[sessionId]/grabacion`

`sessionId` acepta el **código legible** (`abc-defg-hij`) o el UUID, vía
`parseSessionRef()` — igual que `/token`, `/acceso` y `/moderar`.

**Autorización (idéntica en los tres verbos):** se carga la sesión con el cliente
admin, se resuelve `getClassroomAccess(user.id, session.cohort_id)` y se pasa por
`decideRoomAccess(...)`. Se exige `decision.allowed === true && decision.role ===
"teacher"`, que es exactamente el gate de `moderar/route.ts`. Un alumno de la
cohorte, un invitado aprobado en la sala de espera y un docente de **otra**
cohorte reciben 403. La cohorte **nunca** viene del cliente: sale de la sesión.

**Límite de tasa:** `createRateLimiter({ limit: 20, windowSeconds: 60 })` por
usuario.

#### `GET` — estado

```jsonc
// 200
{
  "grabando": true,
  "estado": "active",          // starting|active|uploaded|ingesting|ready|failed|null
  "iniciadaEn": "2026-08-12T18:02:11.000Z",
  "duracionSegundos": 4211,     // null hasta que termina
  "error": null,                // motivo legible cuando estado === "failed"
  "lessonId": "…"               // la lección-repetición, null hasta que se prepara
}
```

#### `POST` — arrancar (idempotente)

El navegador del docente la llama sola al conectarse. Devolver el estado actual
cuando ya hay una grabación en curso **no es un error**: es el resultado que
quien llama quería.

| Situación | Respuesta |
|---|---|
| Ya hay una en `starting`/`active` | `200 { "grabando": true, "estado": "active", "yaEstaba": true }` |
| Arranca bien | `200 { "grabando": true, "estado": "starting", "egressId": "EG_…" }` |
| `LIVEKIT_EGRESS_ENABLED` apagado | `200 { "grabando": false, "estado": null, "deshabilitado": true }` — la sala funciona igual |
| Falta configuración de LiveKit o de S3 | `503 { "error": "La grabación no está configurada.", "missing": ["…"] }` |
| La sala no existe todavía en LiveKit (nadie conectado) | `409 { "error": "Entra a la sala antes de grabar." }` |
| Egress rechaza (sin CPU, caído) | `502 { "error": "No se pudo iniciar la grabación." }` + fila `failed` |
| No es docente de esa cohorte | `403 { "error": "No puedes grabar esta clase." }` |

#### `DELETE` — detener

| Situación | Respuesta |
|---|---|
| Había una activa | `200 { "grabando": false, "estado": "uploaded" }` |
| No había ninguna | `200 { "grabando": false, "yaEstaba": true }` |

### `POST /api/webhooks/livekit`

Lo llama el `livekit-server`, no un navegador. Cabecera `Authorization: <JWT>`
firmado HS256 con `LIVEKIT_API_SECRET`, cuyo payload trae el `sha256` del cuerpo
crudo en base64.

- Se lee el **cuerpo crudo primero** y se verifica antes de parsear — igual que
  el webhook de Mux.
- **Fail-closed en producción**: sin firma válida, 401. En desarrollo, aviso por
  consola y sigue.
- Eventos que interesan: `egress_started`, `egress_updated`, `egress_ended`.
  Cualquier otro (`room_started`, `participant_joined`, …) responde `200
  { received: true }` sin hacer nada: son ruido hoy, pero llegan por la misma URL.
- `egress_ended` con `status: EGRESS_COMPLETE` → fila a `uploaded`, se guarda
  `storage_path`, `file_size_bytes`, `duration_seconds`, y se dispara la ingesta
  a Mux **awaited** dentro del handler (`maxDuration = 300`, mismo criterio que
  el webhook de Mux: en serverless un fire-and-forget muere al responder).
- `egress_ended` con `EGRESS_FAILED`/`EGRESS_ABORTED` → fila a `failed` con el
  motivo.
- **Idempotente por `egress_id`**: una reentrega no vuelve a crear un asset. La
  reserva se hace con un update condicional (`... where status = 'uploaded'`),
  mismo patrón de reserva-antes-de-actuar que `recording-notifications.ts`.

### `GET|POST /api/cron/grabaciones`

Autorizado por `authorizeCron()`. Cada 15 minutos. Techo de 10 filas por corrida
(`MAX_PER_RUN`, mismo criterio que `flow-reconcile`). Hace cuatro cosas:

1. Filas `active` cuya sesión terminó hace más de 30 min → `ListEgress`; si el
   trabajo ya terminó, aplica el cierre que se perdió; si sigue vivo, `StopEgress`.
2. Filas `starting` de hace más de 5 min sin confirmación → `ListEgress` para
   ver si arrancó de verdad; si no, `failed`.
3. Filas `ingesting` de hace más de 30 min → consulta el asset en Mux y aplica
   el `ready` que se perdió (cubre la carrera de D4).
4. Filas `ready` con `storage_deleted_at IS NULL` → borra el objeto. Filas
   `failed` con más de 14 días → borra el objeto y anota la purga.

---

## Llamadas a LiveKit (twirp)

Mismo mecanismo que `moderar/route.ts`: `config.url` con `wss:`→`https:`, token
de servicio de 60 s, `Authorization: Bearer <token>`.

**Grant de servicio:** `{ room, roomJoin: true, canPublish: false, canSubscribe:
false, canPublishData: false, roomRecord: true }`. Esto obliga a agregar
`roomRecord?: boolean` a `VideoGrant` en `lib/livekit/token.ts` — el único cambio
al firmado de tokens, y se mantiene la invariante de que **todo token acota una
sala**.

```
POST {http}/twirp/livekit.Egress/StartRoomCompositeEgress
{
  "room_name": "clase-<uuid de la sesión>",
  "layout": "speaker",
  "audio_only": false,
  "file_outputs": [{
    "file_type": "MP4",
    "filepath": "<session_id>/<recording_id>.mp4",
    "s3": {
      "access_key": "…", "secret": "…",
      "region": "…",
      "endpoint": "https://<ref>.storage.supabase.co/storage/v1/s3",
      "bucket": "grabaciones",
      "force_path_style": true
    }
  }]
}

POST {http}/twirp/livekit.Egress/StopEgress   { "egress_id": "EG_…" }
POST {http}/twirp/livekit.Egress/ListEgress   { "room_name": "clase-…", "active": true }
```

`layout: "speaker"` y no `grid`: una grilla de 20 cámaras a 720p es la peor
relación entre bitrate y utilidad para una repetición donde lo que importa es
quien habla y lo que comparte en pantalla.

`filepath` empieza por el id de la sesión para que el bucket sea navegable y para
que borrar una sesión sea borrar un prefijo.

---

## Ingesta a Mux

`lib/classroom/ingest-recording.ts`, en este orden exacto:

1. `ensureRecordingLesson(admin, sessionId)` — crea o devuelve la lección
   `kind='recorded'` enlazada por `class_sessions.lesson_id`. **Es la lógica que
   hoy vive dentro de `POST /api/admin/sessions/[sessionId]/recording`** y que se
   extrae para que los dos caminos —manual y nativo— usen la misma. Si la sesión
   no tiene módulo, la ingesta se marca `failed` con un motivo accionable
   ("Asigna un módulo a la sesión") en vez de crear una lección huérfana.
2. Si la lección ya tiene `mux_asset_id` o `mux_upload_id`, **no se ingesta**: la
   fila queda `uploaded` y el panel admin ofrece "reemplazar la repetición con
   esta grabación". Pisar una repetición que ya tiene progreso de alumnos sería
   destruir datos sin que nadie lo pidiera.
3. `createSignedUrl(storage_path, 86400)` sobre el bucket privado.
4. `mux.video.assets.create({ inputs: [{ url, generated_subtitles: [{
   language_code: "es", name: "Español CC" }] }], playback_policy:
   [MUX_SIGNING_KEY_ID ? "signed" : "public"], video_quality: "basic",
   static_renditions: [{ resolution: "highest" }] })` — copia exacta de
   `new_asset_settings` en `/api/admin/mux/upload`.
5. `lessons.mux_asset_id = asset.id` y `mux_error = null` **inmediatamente**.
6. Fila a `ingesting` con el `mux_asset_id`.

De ahí en adelante manda el webhook de Mux, sin nada nuevo.

---

## Archivos y rutas a tocar

> Verificado contra el código: **sí** (2026-08-12). El último número de migración
> ocupado es `0095_seed_entorno_pruebas.sql`; confirma que `0096` siga libre al
> implementar, porque hay otros frentes abiertos.

### Nuevos

| Archivo | Responsabilidad |
|---|---|
| `db/migrations/0096_grabacion_nativa.sql` | Tabla `session_recordings` + índice único parcial + RLS + bucket privado `grabaciones` |
| `lib/livekit/egress.ts` | Cliente twirp: `startRoomComposite()`, `stopEgress()`, `listEgress()`. Único lugar con I/O hacia Egress |
| `lib/livekit/egress-estado.ts` | **Puro**: transiciones válidas, `filePathFor()`, mapeo de `EgressStatus` → estado nuestro, etiquetas de la UI del docente |
| `lib/livekit/webhook.ts` | **Puro**: `verifyLiveKitWebhook(rawBody, authHeader, apiKey, apiSecret)` |
| `lib/livekit/__tests__/egress.test.ts` | Cuerpo del request, snake_case, token con `roomRecord`, manejo de 4xx/5xx |
| `lib/livekit/__tests__/egress-estado.test.ts` | La máquina de estados, incluidas las transiciones ilegales |
| `lib/livekit/__tests__/webhook.test.ts` | Firma válida, firma adulterada, cuerpo alterado, header ausente |
| `lib/classroom/ensure-recording-lesson.ts` | Crea-si-no-existe la lección-repetición (extraído del route admin) |
| `lib/classroom/__tests__/ensure-recording-lesson.test.ts` | Idempotencia, sesión sin módulo, unicidad de slug, posición |
| `lib/classroom/ingest-recording.ts` | Firma la URL, crea el asset, enlaza la lección |
| `lib/classroom/__tests__/ingest-recording.test.ts` | Lección ya con video, `createSignedUrl` fallido, Mux 4xx, idempotencia |
| `app/api/classroom/clase/[sessionId]/grabacion/route.ts` | GET/POST/DELETE del contrato de arriba |
| `app/api/classroom/clase/[sessionId]/grabacion/__tests__/route.test.ts` | Los 403 (alumno, invitado aprobado, docente de otra cohorte), idempotencia del POST, 503 sin configurar, 409 sin sala |
| `app/api/webhooks/livekit/route.ts` | Verificación de firma + los tres eventos de egress |
| `app/api/webhooks/livekit/__tests__/route.test.ts` | Fail-closed en producción, idempotencia por `egress_id`, `egress_ended` con error |
| `app/api/cron/grabaciones/route.ts` | Reconciliación y limpieza |
| `app/api/cron/grabaciones/__tests__/route.test.ts` | 401 sin secreto, los cuatro trabajos, `MAX_PER_RUN` |
| `netlify/functions/grabaciones-cron.mjs` | Scheduled Function `*/15 * * * *`, copia del patrón existente |
| `components/classroom/live/grabacion-control.tsx` | Control del docente (arranque automático, botón detener, estado) + insignia "Grabando" para todos |

### Modificados

| Archivo | Cambio |
|---|---|
| `lib/livekit/token.ts` | `roomRecord?: boolean` en `VideoGrant` |
| `app/api/webhooks/mux/route.ts` | **D4**: resolver la lección por `mux_upload_id` **o** `mux_asset_id`. El resto del handler no se toca |
| `app/api/webhooks/mux/__tests__/route.test.ts` | Caso nuevo: `video.asset.ready` sin `upload_id` enlaza por `mux_asset_id` |
| `components/classroom/live/live-class-room.tsx` | Montar `<GrabacionControl>` dentro de `<LiveKitRoom>`, al lado de `<ModerationPanel>`; el control se dibuja completo solo para `role === "teacher"` y como insignia para el resto |
| `app/api/admin/sessions/[sessionId]/recording/route.ts` | Usar `ensureRecordingLesson()`; el GET devuelve además `nativa: { estado, error, iniciadaEn }` |
| `components/admin/session-recording-panel.tsx` | Bloque con el estado de la grabación nativa cuando existe; el uploader manual sigue disponible siempre |
| `lib/security/csp.ts` | Revisar: la subida va **de Egress a Supabase**, no del navegador, así que **no debería hacer falta tocar `connect-src`**. Se verifica en el paso 6 del runbook antes de darlo por cerrado |
| `.env.example` | Agregar el bloque de LiveKit (hoy no está, pese a estar en uso) y las tres variables S3 |
| `docs/codemap.md` | Filas nuevas |
| `CHANGELOG.md` | Entrada orientada al lector |

### Explícitamente NO se tocan

- `app/api/admin/mux/upload/route.ts` ni `components/admin/mux-uploader.tsx` — el
  respaldo manual queda idéntico.
- `lib/classroom/recording-notifications.ts` — se dispara desde el webhook de
  Mux, que ya funciona.
- `lib/livekit/access.ts` — el gate no cambia; se **usa**.
- La migración 0041 y el player de la repetición.

---

## Migración `0096_grabacion_nativa.sql`

```sql
-- 1. Bucket privado, 8 GB de tope (una clase de 3 h a 720p ≈ 4 GB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('grabaciones', 'grabaciones', false, 8589934592, array['video/mp4'])
on conflict (id) do update set public = false, file_size_limit = 8589934592;
-- Sin policies: solo service_role. Igual que `certificates` (0029) y `deliverables` (0053).

create table if not exists public.session_recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  egress_id text unique,
  status text not null default 'starting'
    check (status in ('starting','active','uploaded','ingesting','ready','failed')),
  storage_path text,
  file_size_bytes bigint,
  duration_seconds integer,
  mux_asset_id text,
  error text,
  started_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ingested_at timestamptz,
  storage_deleted_at timestamptz
);

-- Una sola grabación viva por sala (D5): sin esto, dos clics simultáneos del
-- docente levantan dos Chrome y producen dos archivos que pelean por la misma
-- lección.
create unique index if not exists session_recordings_activa_idx
  on public.session_recordings (session_id)
  where status in ('starting','active');

create index if not exists session_recordings_pendientes_idx
  on public.session_recordings (status, started_at)
  where status in ('starting','active','uploaded','ingesting');

alter table public.session_recordings enable row level security;
-- Nadie lee ni escribe directo: la API sirve el estado y ya verifica que quien
-- pregunta es docente de ESA cohorte. Duplicar ese join en una policy sería
-- arriesgarse a que diverja del gate que vive en decideRoomAccess.
```

---

## Escenarios (Given/When/Then)

**E1 — El camino feliz completo**
- GIVEN una sesión `live_online` con módulo asignado y el docente conectado a la sala
- WHEN su navegador llama a `POST /grabacion` al conectarse
- THEN se crea una fila `starting`, se llama a `StartRoomCompositeEgress` y todos los participantes ven la insignia "Grabando"
- AND al cerrarse la sala, Egress termina solo y sube el MP4
- AND `egress_ended` deja la fila en `uploaded` y dispara la ingesta
- AND `video.asset.ready` enlaza la lección-repetición, se borra el objeto del bucket, y transcripción, resumen, capítulos y aviso ocurren **sin código nuevo**

**E2 — El hallazgo, en forma de test** *(protege D4)*
- GIVEN un evento `video.asset.ready` **sin** `upload_id` cuyo `data.id` coincide con `lessons.mux_asset_id`
- WHEN llega al webhook de Mux
- THEN la lección recibe `mux_playback_id`, duración y miniatura
- AND se dispara el aviso "grabación disponible"
- AND con el código de hoy este test **falla**: es la prueba de que el cambio hacía falta

**E3 — Doble arranque**
- GIVEN una grabación en `active` para la sesión
- WHEN se llama a `POST /grabacion` otra vez (recarga, segundo dispositivo, dos docentes)
- THEN responde 200 con `yaEstaba: true` y **no** se llama a `StartEgress`
- AND si dos llamadas llegan en paralelo, el índice único parcial deja pasar una sola

**E4 — Un alumno no puede grabar**
- GIVEN un alumno con matrícula activa en la cohorte, dentro de la sala
- WHEN llama a `POST` o `DELETE /grabacion`
- THEN 403, sin importar que tenga token válido de la sala
- AND lo mismo para un invitado aprobado en la sala de espera (0091) y para un docente de otra cohorte

**E5 — Egress caído: la clase no se cae**
- GIVEN el servicio de egress detenido o sin CPU disponible
- WHEN el docente entra y el navegador pide grabar
- THEN la sala funciona con normalidad
- AND la fila queda `failed` con el motivo, el docente ve "No se está grabando esta clase" y el panel admin muestra el aviso con la subida manual disponible

**E6 — Se pierde el webhook de egress**
- GIVEN una fila `active` cuya sesión terminó hace 45 minutos y ningún webhook llegó
- WHEN corre el cron
- THEN consulta `ListEgress`; si el trabajo terminó bien, aplica el cierre y la ingesta; si sigue vivo, lo corta con `StopEgress`

**E7 — Clase de 3 horas**
- GIVEN una sesión de 180 minutos
- THEN el objeto resultante pesa ~4 GB y entra bajo el tope de 8 GB del bucket
- AND `duration_seconds` en la fila coincide (±5 s) con la duración que reporta Mux
- AND el token de servicio de 60 s **no** limita nada: solo firma la llamada de arranque, no la grabación

**E8 — La ingesta no pisa una repetición existente**
- GIVEN una sesión cuya lección-repetición ya tiene `mux_playback_id` (la subieron a mano)
- WHEN termina una grabación nativa de esa misma sesión
- THEN **no** se crea un asset nuevo
- AND la fila queda `uploaded`, el archivo se conserva y el panel admin ofrece reemplazar

**E9 — Sesión sin módulo**
- GIVEN una sesión sin `module_id`
- WHEN la grabación termina y arranca la ingesta
- THEN la fila queda `failed` con "Asigna un módulo a la sesión para publicar la repetición"
- AND el archivo se conserva los 14 días de retención, para que asignar el módulo y reintentar sea posible

**E10 — Reentrega del webhook de LiveKit**
- GIVEN un `egress_ended` ya procesado
- WHEN LiveKit lo reentrega
- THEN no se crea un segundo asset en Mux y la respuesta sigue siendo 200

**E11 — Firma inválida**
- GIVEN `NODE_ENV=production` y un POST a `/api/webhooks/livekit` sin cabecera o con firma adulterada
- THEN 401 y nada se escribe

**E12 — Interruptor apagado**
- GIVEN `LIVEKIT_EGRESS_ENABLED` sin valor o en `false`
- WHEN el docente entra a la sala
- THEN no se llama a Egress, no se crea ninguna fila, y la sala funciona exactamente como hoy

---

## Tests

Vitest, patrón de los `__tests__` vecinos (`vi.mock` de `@/lib/supabase/admin` y
de `getClassroomAccess`, `fetch` mockeado para twirp y para Mux). Sin jsdom: los
componentes React no se testean, por eso toda la decisión vive en
`lib/livekit/egress-estado.ts` y `lib/livekit/webhook.ts`.

| Archivo | Cubre |
|---|---|
| `lib/livekit/__tests__/webhook.test.ts` | E11 |
| `lib/livekit/__tests__/egress-estado.test.ts` | Transiciones, `filePathFor`, etiquetas |
| `lib/livekit/__tests__/egress.test.ts` | Forma del request, `roomRecord`, errores de twirp |
| `app/api/classroom/clase/[sessionId]/grabacion/__tests__/route.test.ts` | E3, E4, E5, E12 |
| `app/api/webhooks/livekit/__tests__/route.test.ts` | E10, E11 |
| `app/api/webhooks/mux/__tests__/route.test.ts` | **E2** |
| `lib/classroom/__tests__/ingest-recording.test.ts` | E8, E9 |
| `lib/classroom/__tests__/ensure-recording-lesson.test.ts` | Idempotencia y slug |
| `app/api/cron/grabaciones/__tests__/route.test.ts` | E6 y la limpieza de D7 |

Antes de pushear: `pnpm vitest run` de los archivos tocados **y** `next build`
(no basta `tsc`).

---

## Runbook — desplegar Egress en Railway

Proyecto `capitalacademy-livekit`, el mismo donde ya viven `livekit-server` y
Redis. Las tres trampas documentadas en ADR-0031 aplican igual acá: una variable
de configuración le gana al archivo, cambiar variables **no** redespliega el
código, y el proxy necesita el puerto declarado.

**Paso 1 — Servicio nuevo desde imagen.**
`New → Docker Image → livekit/egress:<versión>`. **Fija una versión concreta de
la lista de tags publicados; no uses `latest`** — `livekit-server` está fijado en
v1.13.5 por la misma razón, y una imagen que se mueve sola convierte cualquier
clase en un experimento. Mismo proyecto y misma red privada que Redis.

**Paso 2 — Límites del servicio.**
Súbelos a **4 vCPU y 4 GB como mínimo**. Egress mide la CPU disponible y rechaza
el trabajo si no le alcanza; el síntoma es un `StartEgress` que devuelve error
sin explicar. Railway factura el uso real, no el límite: un contenedor en reposo
cuesta poco.

**Paso 3 — Configuración por `EGRESS_CONFIG_BODY`.**
Una sola variable con el YAML completo. Es el camino que la imagen documenta y
evita repetir el enredo de `LIVEKIT_CONFIG` vs `--config`.

```yaml
redis:
  address: redis.railway.internal:6379
  username: default
  password: ${REDIS_PASSWORD}
api_key: <LIVEKIT_API_KEY>
api_secret: <LIVEKIT_API_SECRET>
ws_url: wss://livekit-production-0c7a.up.railway.app
health_port: 8080
log_level: info
# Railway no permite agregar capacidades al contenedor (SYS_ADMIN), así que el
# sandbox de Chrome tiene que ir apagado o el trabajo muere al arrancar.
enable_chrome_sandbox: false
```

Usa **la misma** api key/secret que emite los tokens de la app: Egress se
autentica contra el mismo LiveKit.

**Paso 4 — Sin dominio público.**
Egress no recibe tráfico de internet: toma trabajos por Redis. No le crees
dominio. Si quieres healthcheck de Railway, declara `PORT=8080` (para que el
proxy apunte donde escucha `health_port`) y `healthcheckPath = /`. Si Railway no
logra alcanzarlo, **quita el healthcheck en vez de pelear con él**: el estado
real se verifica con `ListEgress` y con los logs, y un healthcheck mal apuntado
reinicia el contenedor en loop.

**Paso 5 — Webhooks en el `livekit-server` (servicio existente).**
Agrega a su configuración:

```yaml
webhook:
  api_key: <LIVEKIT_API_KEY>
  urls:
    - https://capitalacademy.cl/api/webhooks/livekit
```

Y después **corre `railway up`**: cambiar una variable no redespliega el código, y
ya pasó que el servicio volviera a arrancar con la configuración por defecto
haciendo parecer que la propia estaba activa.

> `www.capitalacademy.cl` responde 404 (DNS apuntado a Vercel, ver el incidente
> del 22-jul). Usa el dominio **sin** `www`.

**Paso 6 — Prueba de humo, en este orden.**

1. Logs del contenedor: `egress worker started` y conexión a Redis, sin reinicios.
2. Con una sala de prueba abierta desde `/sala/<código>`, llama a `POST
   /api/classroom/clase/<código>/grabacion` como docente → debe devolver un
   `egressId`.
3. La insignia "Grabando" aparece en **todas** las pestañas conectadas, no solo
   en la del docente.
4. `ListEgress` muestra el trabajo `EGRESS_ACTIVE`.
5. Cierra la sala → el objeto aparece en el bucket `grabaciones` con tamaño > 0.
6. Llega `egress_ended` a `/api/webhooks/livekit` y **la firma verifica**. La
   primera vez, despliega el verificador registrando el resultado sin rechazar,
   confirma que valida, y recién entonces activa el fail-closed.
7. El asset queda listo en Mux, la repetición aparece en la pantalla de la clase
   y el objeto desaparece del bucket.
8. **Grabación larga**: repite con una sala de al menos 45 minutos antes de
   habilitar esto en una clase real. Es la prueba que detecta el problema de
   `/dev/shm` de Chrome, que en una grabación de 2 minutos no se ve.

**Paso 7 — Variables en Netlify.**
`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (que según ADR-0031
**todavía no están en Netlify**), más `SUPABASE_S3_ACCESS_KEY_ID`,
`SUPABASE_S3_SECRET_ACCESS_KEY`, `SUPABASE_S3_REGION`. `LIVEKIT_EGRESS_ENABLED`
se deja **apagada** hasta terminar el paso 6.

**Paso 8 — Rollback.**
Apaga `LIVEKIT_EGRESS_ENABLED` en Netlify. La sala sigue funcionando y el equipo
vuelve a subir la grabación a mano. No hace falta desplegar nada ni tocar
Railway.

---

## Fuera de alcance en v1

- Asistencia derivada de la presencia en la sala (es el otro pendiente de
  ADR-0031; usa el mismo webhook, pero es otra decisión).
- Transmitir la clase a quien no está en la sala (RTMP, Opción B del ADR).
- Grabación por participante (`ParticipantEgress`) o pistas separadas.
- Recortar el inicio y el final de la grabación.
- Firmar el playback de Mux — **es un riesgo abierto, no un olvido**; ver la
  sección de riesgos del ADR.

---

## Riesgos

| Riesgo | Mitigación en v1 |
|---|---|
| Una clase larga se pierde por caída del contenedor antes de subir | El camino manual sigue vivo; si ocurre, se pasa a `segmented_file_outputs` o a la Opción B |
| `/dev/shm` de Chrome en Railway | Paso 6.8 del runbook antes de la primera clase real |
| El video con alumnos queda con playback público | Anotado como riesgo aceptado; recomendación explícita de retomar la firma antes de cohortes con externos |
| Consentimiento (Ley 21.719) | Insignia "Grabando" visible para todos, propagada por LiveKit; falta que el reglamento del programa y el correo de recordatorio lo digan |
| El costo se dispara si un egress queda colgado | Trabajo 1 del cron: `StopEgress` a los 30 min del fin de la sesión |
| Otro frente toma el número 0096 | Verificar `ls db/migrations/` al implementar |

---

## Tareas

1. Migración `0096` (tabla + bucket) → verificar: `psql` local aplica limpio y el índice parcial rechaza la segunda fila activa.
2. `lib/livekit/webhook.ts` + `egress-estado.ts` + tests → verificar: verde, sin red.
3. `lib/livekit/egress.ts` + `roomRecord` en `VideoGrant` + tests → verificar: el cuerpo del request es el del contrato.
4. `app/api/classroom/clase/[sessionId]/grabacion/route.ts` + tests → verificar: E3, E4, E5, E12.
5. **Arreglo del webhook de Mux (D4)** + test E2 → verificar: el test falla antes del cambio y pasa después.
6. `ensure-recording-lesson.ts` (extracción) + `ingest-recording.ts` + tests → verificar: E8, E9, y que el route admin sigue verde.
7. `app/api/webhooks/livekit/route.ts` + tests → verificar: E10, E11.
8. Cron + Netlify Function + tests → verificar: E6 y la limpieza.
9. `grabacion-control.tsx` y su montaje en `live-class-room.tsx` → verificar: `next build` y prueba manual en la sala.
10. Panel admin (estado nativo) + `.env.example` + codemap + CHANGELOG.
11. Runbook completo en Railway, con el paso 6 hasta el final.
