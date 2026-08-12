# ADR-0034: Grabación nativa de las clases en vivo

- **Status:** proposed
- **Date:** 2026-08-12
- **Deciders:** Elkis Daza (dirección), equipo de desarrollo
- **Tags:** infra, video, clases-en-vivo, livekit, mux

## Contexto

ADR-0031 dejó la clase en vivo dentro de la plataforma: LiveKit autoalojado en
Railway (`wss://livekit-production-0c7a.up.railway.app`), tokens firmados por la
app (`app/api/classroom/clase/[sessionId]/token/route.ts`), sala propia en
`app/sala/[code]`, moderación server-side y sala de espera (0091). Lo que ese ADR
dejó explícitamente pendiente es el punto 3 de su lista: **Egress**.

Hoy, entonces, la clase se dicta en casa pero **la grabación sigue siendo
manual**: alguien tiene que estar grabando por fuera, descargar el archivo y
subirlo con `MuxUploader` desde
`components/admin/session-recording-panel.tsx`. Recién ahí arranca sola toda la
cadena que ya funciona y que nadie quiere rehacer:

```
video en Mux → webhook video.asset.ready (app/api/webhooks/mux/route.ts)
   → lessons.mux_playback_id + miniatura inteligente + aviso "grabación disponible"
   → webhook video.asset.track.ready
   → lesson_transcripts + corrección de transcripción + resumen IA + capítulos
   → la repetición aparece en la pantalla de la clase vía class_sessions.lesson_id (0041)
```

El cuello de botella es humano, y ya cobró su precio: hay clases sin repetición
publicada durante días y transcripciones que nadie pidió regenerar.

### El hallazgo que corrige la premisa

La idea de partida era: "Egress deja un MP4, la app crea el asset en Mux por
URL, y **la cadena existente hace el resto sin cambios**". La segunda mitad de
esa frase **es falsa**, y verificarlo cambia el alcance:

```ts
// app/api/webhooks/mux/route.ts
if (event.type === "video.asset.ready") {
  const { id: assetId, upload_id, ... } = event.data;
  if (!upload_id) {
    return NextResponse.json({ received: true });   // ← sale por acá
  }
  ...
  .eq("mux_upload_id", upload_id)                   // la lección se ubica SOLO por upload
```

Un asset creado por **ingesta de URL no tiene `upload_id`**: nace de
`POST /video/v1/assets`, no de un *direct upload*. Con el código de hoy, el
webhook lo descarta en silencio, la lección nunca recibe `mux_playback_id`, y el
`video.asset.track.ready` posterior tampoco encuentra a quién enlazar. La
repetición quedaría en "Procesando en Mux…" para siempre, sin un solo error en
los logs.

Es exactamente el modo de falla que este repo ya conoce por el CSP
(`lib/security/csp.ts`): compila, pasa los tests, y no funciona. Por eso el
cambio en el webhook de Mux es **parte de la decisión**, no un detalle de
implementación.

### Restricciones de partida

- **Egress es pesado.** Corre Chrome headless; un trabajo de Room Composite pide
  del orden de 2 a 6 CPU y el servicio recomienda un piso de 4 CPU / 4 GB.
- **Mux no es destino nativo de Egress.** Las salidas son S3/Azure/GCS, RTMP,
  MP4 o HLS. Hace falta un salto intermedio o un stream.
- **No hay AWS.** El almacenamiento S3-compatible disponible es Supabase Storage
  (proyecto `igatsyghbadccbrjiurl`), que ya se usa para certificados, entregables
  y recursos con buckets privados + URLs firmadas.
- **El playback de Mux está sin firmar por decisión aceptada**
  (`docs/SEGURIDAD-mux-playback-sin-firmar.md`). Eso cambia de peso cuando el
  video deja de ser el profesor solo y pasa a contener a los alumnos.

## Decisión

Agregar **LiveKit Egress (Room Composite) como servicio propio en Railway**,
junto al `livekit-server` que ya corre ahí, con esta cadena:

```
docente entra a la sala
   │  (su navegador llama a POST /api/classroom/clase/:ref/grabacion — idempotente)
   ▼
StartRoomCompositeEgress (twirp, token con roomRecord)
   │  file_outputs: MP4 → S3 de Supabase Storage (bucket privado `grabaciones`)
   ▼
la clase termina → la sala se cierra → Egress termina solo y sube el archivo
   │
   ▼
webhook egress_ended  →  /api/webhooks/livekit
   │  (respaldo: cron de reconciliación que consulta ListEgress)
   ▼
URL firmada del objeto (24 h)  →  mux.video.assets.create({ inputs: [{ url }] })
   │  se escribe lessons.mux_asset_id de inmediato
   ▼
webhook video.asset.ready  →  la lección-repetición queda lista
   │  (transcripción, resumen IA, capítulos y aviso: sin cambios)
   ▼
borrar el objeto del bucket
```

Siete decisiones concretas la sostienen.

### D1 — Egress propio en Railway, no en el navegador ni en la nube de LiveKit

Se mantiene la restricción de despliegue de ADR-0031. Ver *Opciones
consideradas* para por qué se descartaron grabar en el navegador del docente y
usar LiveKit Cloud.

### D2 — Un MP4 por clase a Supabase Storage, no RTMP directo a Mux

La alternativa seria era **saltarse el almacenamiento**: `stream_outputs` RTMP
contra un *live stream* de Mux, que graba mientras recibe y publica el asset al
cerrar. Es menos piezas y no necesita bucket, ingesta ni limpieza.

Se descarta para v1 por una razón y se deja anotada para v2:

- **No deja copia propia.** Si el push RTMP falla a mitad de clase, no queda
  nada que un humano pueda rescatar. ADR-0031 ya listó como riesgo "que un fallo
  de Egress pierda la grabación de una clase que ya ocurrió y no se puede
  repetir", y su mitigación era justamente conservar el camino manual. Con RTMP
  esa mitigación no existe: no hay archivo.
- Agrega **minutos de live streaming** a la factura de Mux, que hoy no se pagan.
- La ingesta de VOD que ya usa el repo se comporta igual que hoy; un asset
  nacido de un live stream tiene otro ciclo de vida y otros webhooks.

Contrapartida honesta de haber elegido el archivo: **un MP4 se sube al final del
trabajo**, no mientras se graba. Ver *Fallos*.

### D3 — El asset en Mux lo crea la app, con la misma configuración que la subida manual

`lib/classroom/ingest-recording.ts` firma una URL del objeto y llama a
`assets.create` copiando exactamente lo que hoy pone
`app/api/admin/mux/upload/route.ts` en `new_asset_settings`: `video_quality:
"basic"`, `static_renditions: [{ resolution: "highest" }]`,
`generated_subtitles` en español y la misma política de playback. Si la
repetición nativa se configurara distinto, el alumno vería dos productos con el
mismo nombre.

### D4 — El webhook de Mux ubica la lección por `mux_asset_id` cuando no hay `upload_id`

Es el arreglo del hallazgo de arriba, y es de una línea de lógica: resolver la
lección por `mux_upload_id` **o** por `mux_asset_id`, y seguir igual. Se escribe
`mux_asset_id` en la lección en el mismo momento en que Mux devuelve el asset,
así el webhook siempre encuentra a quién enlazar.

**No se usa `passthrough`.** Sería un segundo vínculo entre asset y lección que
puede divergir del primero; el id del asset ya es el vínculo y no hay ninguna
pregunta que `passthrough` responda mejor.

### D5 — Una grabación activa por sala, con arranque automático y término automático

- **Arranca sola** cuando el docente se conecta: su navegador llama a la ruta,
  que es idempotente. El botón manual existe para volver a intentar o para
  cortar antes, no para acordarse. Si la grabación dependiera de que alguien
  pulse "Grabar", habríamos movido el cuello de botella humano, no eliminado.
- **Termina sola**: un Room Composite se cierra cuando la sala se cierra. El
  botón "Detener" es la salida de emergencia.
- **Una sola a la vez**, garantizado por índice único parcial sobre
  `session_recordings` y por una consulta a `ListEgress` antes de arrancar. Cada
  Room Composite levanta un Chrome: dos en paralelo en la misma sala duplican el
  costo y producen dos archivos que compiten por la misma lección.
- **Todos ven que se está grabando.** LiveKit propaga el estado a los
  participantes (`room.isRecording` + `RoomEvent.RecordingStatusChanged`,
  verificado en livekit-client 2.21.0), así que el aviso no depende de que
  nuestra UI adivine nada.

### D6 — El estado vive en `session_recordings`, no en LiveKit ni en la lección

LiveKit olvida un egress terminado y la lección solo sabe del asset final. Para
poder decir "esta clase se grabó, el archivo pesa X, la ingesta falló por Y" hace
falta una tabla propia (migración nueva, ver la spec). Es la misma razón por la
que existen `session_reminder_recipients` (0075) y los ledgers de 0077.

### D7 — El archivo intermedio se borra cuando Mux confirma

El MP4 contiene caras y voces de alumnos: es PII. El bucket es **privado**, sin
policies de lectura (solo `service_role`, como `certificates` en 0029 y
`deliverables` en 0053), y el objeto se borra en cuanto llega
`video.asset.ready`. Si la ingesta falla, el archivo se retiene **14 días** para
poder reintentar o rescatarlo a mano, y después el cron lo barre. Nada de
retención indefinida "por si acaso".

## Opciones consideradas

### Opción A — Egress en Railway → MP4 a Supabase Storage → ingesta a Mux por URL (elegida)

- **Pros:** reusa entera la cadena de repetición; deja copia propia del archivo;
  no agrega costo de Mux respecto de hoy; el camino manual sigue vivo como
  respaldo sin ninguna adaptación.
- **Contras:** tres piezas nuevas que operar (contenedor de egress, bucket,
  ingesta) y una ventana de pérdida total si el contenedor muere antes de subir.

### Opción B — Egress con salida RTMP a un live stream de Mux

- **Pros:** sin almacenamiento intermedio, sin ingesta, sin limpieza; Mux graba
  mientras recibe, así que una caída a los 170 minutos conserva 170 minutos;
  habilita transmitir la clase a quien no está en la sala.
- **Contras:** no deja copia propia; suma minutos de live streaming a Mux; el
  asset nace de otro ciclo de vida que el repo no ejercita hoy.
- **Cuándo reconsiderarla:** si se pierde una clase larga por caída del
  contenedor, o si aparece el requisito de transmitir. La forma de tener las dos
  cosas es un solo egress con `file_outputs` **y** `stream_outputs` a la vez.

### Opción C — Grabar en el navegador del docente (`MediaRecorder`)

- **Pros:** cero infraestructura nueva, cero costo.
- **Contras:** la grabación queda atada al computador de una persona —su CPU, su
  subida, su batería, su pestaña—; si el navegador se cae, la clase se perdió; y
  después alguien tiene que subir el archivo, que es exactamente el problema que
  esto viene a resolver.

### Opción D — LiveKit Cloud solo para Egress

- **Pros:** no se opera el contenedor ni se dimensiona nada.
- **Contras:** costo por minuto grabado, una cuenta más, y contradice la
  restricción de despliegue ya fijada en ADR-0031.

## Costos aproximados

Railway cobra por **uso medido** (vCPU-minuto y GB-minuto), no por los límites
declarados. Eso es lo que hace viable dejar el contenedor prendido: un egress sin
trabajos no levanta Chrome y consume poco. Lo que sí hay que declarar alto son
los **límites** del servicio, porque egress rechaza un trabajo si no ve CPU
disponible.

Supuestos: ~12 clases al mes × 2,5 h ≈ **30 h de grabación mensuales**; 720p a
~3 Mbps ≈ **1,3 GB por hora** ≈ 3,5 GB por clase de 2,5 h.

| Concepto | Cálculo | Aprox. mensual |
|---|---|---|
| Egress en reposo (~0,1 vCPU, ~0,4 GB, 730 h) | tarifa × horas | US$ 5-7 |
| Egress grabando (~3 vCPU, ~2 GB, 30 h) | tarifa × horas | US$ 3-4 |
| Storage del archivo intermedio | se borra tras la ingesta; días-GB residuales | < US$ 1 |
| Egreso de Supabase hacia Mux | ~42 GB/mes, dentro de los 250 GB incluidos del plan Pro | US$ 0 |
| Mux (encoding, storage, delivery) | **sin cambio**: es el mismo video que hoy se sube a mano | US$ 0 adicional |
| **Total incremental** | | **≈ US$ 10 / mes** |

> Las tarifas por vCPU-hora y GB-hora de Railway y el precio de egreso de
> Supabase **hay que confirmarlos en sus páginas de precios antes de comprometer
> la cifra**. Lo que no depende de la tarifa es la forma del costo: el gasto
> dominante es el contenedor prendido, no las horas de clase, y el lado Mux no
> sube porque es exactamente el mismo archivo que hoy se sube a mano.

La conclusión operativa: **no vale la pena apagar y prender el contenedor por
clase.** Egress toma trabajos por Redis, no por HTTP, así que el "dormir hasta
que llegue tráfico" de Railway no lo despierta; automatizar el encendido
significaría llamar a la API de Railway desde la app —una pieza móvil más— para
ahorrar unos pocos dólares al mes.

## Fallos y cómo se comportan

| Fallo | Qué pasa hoy sin diseño | Qué hace este diseño |
|---|---|---|
| **Egress caído o sin CPU** | La clase se dicta sin grabar y nadie se entera hasta que alguien busca la repetición | `StartEgress` falla → la fila queda `failed` con el motivo, el docente ve "no se está grabando" en la sala y el panel admin muestra el aviso con la subida manual disponible. **La clase nunca se cae por esto.** |
| **Se pierde el webhook `egress_ended`** | El archivo queda en el bucket y nadie lo ingesta | El cron `/api/cron/grabaciones` consulta `ListEgress` y cierra las filas que quedaron `active` con la sala ya terminada |
| **Upload parcial / bucket lleno / límite de tamaño** | Archivo corrupto ingestado a Mux | `egress_ended` llega con error → fila `failed`, no se ingesta nada, aviso en el panel |
| **Clase de 3 h** | — | ~4 GB en un solo objeto. El bucket se crea con límite holgado (8 GB) y el layout se fija en `speaker` para no inflar el bitrate. **Riesgo real: el MP4 se sube al terminar, así que una caída del contenedor en el minuto 170 pierde las 3 horas.** Mitigación v1: el camino manual sigue vivo. Mitigación v2 si llega a ocurrir: `segmented_file_outputs` (sube mientras graba) o la Opción B |
| **`video.asset.ready` llega antes de que escribamos `mux_asset_id`** | La repetición queda colgada | El webhook responde 200 y el cron reconcilia consultando el asset en Mux |
| **Egress que queda colgado después de la clase** | Se factura Chrome corriendo de noche | El cron corta con `StopEgress` todo egress activo cuya sesión terminó hace más de 30 minutos |
| **Dos grabaciones de la misma sala** | Dos archivos peleando por una lección | Índice único parcial + chequeo de `ListEgress` antes de arrancar |

## Variables de entorno nuevas

| Variable | Dónde | Para qué |
|---|---|---|
| `LIVEKIT_EGRESS_ENABLED` | Netlify + `.env` | Interruptor. Apagada, la sala funciona igual y no se graba: permite cortar sin desplegar |
| `SUPABASE_S3_ACCESS_KEY_ID` | Netlify + `.env` | Credencial S3 de Supabase Storage que Egress usa para subir. Se crea en Dashboard → Storage → S3 Access Keys |
| `SUPABASE_S3_SECRET_ACCESS_KEY` | Netlify + `.env` | ídem |
| `SUPABASE_S3_REGION` | Netlify + `.env` | Región del proyecto; el endpoint S3 se deriva de `NEXT_PUBLIC_SUPABASE_URL` para no tener dos variables que puedan apuntar a proyectos distintos |
| `EGRESS_CONFIG_BODY` | Railway → servicio `livekit-egress` | Config YAML completa del contenedor (Redis, `ws_url`, api key/secret, `enable_chrome_sandbox: false`, `health_port`) |
| — | Railway → servicio `livekit-server` | Se **modifica** su config para agregar `webhook.urls` apuntando a `/api/webhooks/livekit`. Sin esto no llega ningún evento de egress |

`LIVEKIT_URL`, `LIVEKIT_API_KEY` y `LIVEKIT_API_SECRET` **ya existen** en el
`.env` local pero, según ADR-0031, todavía no están en Netlify. Este cambio las
vuelve obligatorias en producción, y de paso hay que agregarlas a `.env.example`,
donde hoy no figuran. No se agregan credenciales nuevas de LiveKit: el webhook se
verifica con el mismo `LIVEKIT_API_SECRET`.

## Consecuencias

### Positivas

- La repetición aparece sola. Nadie descarga ni sube nada, y transcripción,
  resumen IA, capítulos y el aviso al alumno dejan de esperar a una persona.
- El pipeline de IA se alimenta de todas las clases, no solo de las que alguien
  alcanzó a subir.
- Queda registro de qué se grabó, cuánto pesó y qué falló: hoy no existe ninguna
  señal.
- El camino manual sobrevive intacto como respaldo, sin ramas condicionales en
  la UI: es el mismo panel.

### Negativas

- Un servicio más que operar y pagar (~US$10/mes) y un bucket más que vigilar.
- El webhook de Mux deja de tener un solo camino de entrada: hay que sostener
  dos formas de ubicar la lección.
- Depende de que el `livekit-server` tenga bien puesta la config de webhooks, que
  es justo la parte del despliegue donde ADR-0031 documenta tres trampas
  (`LIVEKIT_CONFIG` le gana al `--config`, cambiar variables no redespliega,
  `PORT` explícito).

### Riesgos

- **El playback sigue sin firmar, y ahora el video tiene alumnos adentro.** Las
  lecciones pregrabadas muestran al profesor; una clase en vivo muestra caras,
  nombres y voces de menores de edad no, pero sí de personas identificadas que
  pagaron un curso. Que el `playback_id` sea público significa que cualquiera con
  la URL lo ve. La decisión de no firmar
  (`docs/SEGURIDAD-mux-playback-sin-firmar.md`) se tomó para otro contenido.
  **Recomendación: retomar la firma antes de que la grabación nativa se active
  en cohortes con alumnos externos.** Mientras tanto queda anotado como riesgo
  aceptado conscientemente, no como olvido.
- **Consentimiento (Ley 21.719).** Grabar automáticamente exige avisar de forma
  visible. La sala muestra el estado "Grabando" a todos los participantes, y el
  correo de recordatorio y el reglamento del programa deberían decirlo. No es un
  detalle de UI: es la base legal.
- **`/dev/shm` de Chrome.** La documentación de Egress pide `--shm-size=1g`, que
  Railway no expone. Si Chrome se cae con memoria compartida agotada, la
  grabación falla en clases largas. Se verifica en el paso 6 del runbook con una
  grabación de prueba larga **antes** de habilitarlo en una clase real; si falla,
  las salidas son una imagen propia derivada de `livekit/egress` o mover el
  egress a otro proveedor.
- **Las credenciales S3 que recibe Egress son de PROYECTO, no de bucket.**
  Supabase Storage no emite llaves acotadas: `SUPABASE_S3_ACCESS_KEY_ID` da
  lectura y escritura sobre TODOS los buckets (certificados, entregables,
  portadas, grabaciones), y viaja en el cuerpo de cada `StartRoomCompositeEgress`
  hacia el servidor de Egress, que además la persiste en su `EgressInfo`
  (visible por `ListEgress`). Comprometer el contenedor de Egress en Railway
  compromete todo el Storage del proyecto, no solo las grabaciones. Mitigación
  operativa (runbook): el contenedor no expone puertos públicos aparte del
  healthcheck, sus logs no se comparten, y las llaves S3 se rotan si el
  contenedor se ve comprometido o se da de baja. Riesgo aceptado consciente:
  la alternativa (un storage S3 aparte solo para grabaciones) agrega un
  proveedor nuevo y queda anotada como salida si esto escala.
- Que la primera clase grabada de verdad descubra algo que la prueba no vio. Por
  eso `LIVEKIT_EGRESS_ENABLED` y por eso el panel manual no se toca.

## Referencias

- ADR-0031 — clases en vivo con LiveKit autoalojado; el punto 3 de su "lo que
  falta" es este ADR
- ADR-0001 — Mux como proveedor de video; la ingesta nueva no lo cambia
- ADR-0020 — fan-out por lote e idempotencia por destinatario; mismo criterio de
  reserva-antes-de-actuar que usa la ingesta
- `docs/specs/grabacion-nativa.md` — la especificación ejecutable
- `docs/SEGURIDAD-mux-playback-sin-firmar.md` — la decisión de playback público
  que este ADR pone en cuestión
- Migraciones relacionadas: 0041 (repetición vía `lesson_id`), 0089 (código de
  sala), 0091 (sala de espera)
- [Self-hosting Egress](https://docs.livekit.io/home/self-hosting/egress/)
- [Supabase Storage · S3-compatible endpoint](https://supabase.com/docs/guides/storage/s3/authentication)
- [Mux · Create an asset from a URL](https://www.mux.com/docs/guides/upload-files-directly)
