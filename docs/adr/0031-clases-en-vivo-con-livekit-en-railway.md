# ADR-0031: Clases en vivo con LiveKit autoalojado en Railway

- **Status:** accepted
- **Date:** 2026-08-06
- **Deciders:** Elkis Daza (dirección), equipo de desarrollo
- **Tags:** infra, video, clases-en-vivo, asistencia

## Contexto

Hoy la clase en vivo **no vive en la plataforma**. `class_sessions.meeting_url`
(`db/migrations/0001_init_core.sql:119`) es un texto libre que alguien del equipo
pega a mano al crear la sesión; la app solo lo valida como URL
(`app/api/admin/sessions/route.ts:27`) y lo muestra como un botón "Entrar a la
clase" que abre Zoom o Meet en otra pestaña
(`app/(classroom)/classroom/[cohortSlug]/clase/[sessionId]/page.tsx:206-217`).
El mismo enlace se inyecta en los tres correos de recordatorio
(`app/api/cron/session-reminders/route.ts:300,310`).

De ahí salen tres costos operativos concretos:

1. **La grabación es 100% manual.** Alguien descarga el video del proveedor y lo
   sube a Mux con `@mux/upchunk` contra `/api/admin/mux/upload`. Recién ahí se
   dispara automático todo lo bueno que ya existe: webhook, transcripción,
   resumen IA, capítulos y el aviso de "grabación disponible"
   (`app/api/webhooks/mux/route.ts`). El cuello de botella es humano.
2. **La asistencia depende de que el alumno escanee un QR** aunque esté sentado
   en una clase online (`lib/asistencia/checkin.ts`, ventana de −20/+30 min en
   `lib/asistencia/window.ts:11-12`). Ya hubo un incidente de acceso por esta vía
   el 22-jul.
3. **No hay ninguna señal de lo que pasó en la clase**: ni quién entró, ni
   cuánto se quedó, ni cuándo terminó de verdad.

La decisión de producto ya tomada es que la clase **se dicte dentro de la
plataforma**, que la grabación **entre sola** al pipeline de Mux que ya funciona,
y que la asistencia de las clases online **se derive de quién estuvo en la
sala**, dejando el QR para lo presencial.

La restricción de despliegue es que LiveKit va **autoalojado en Railway**.

## Decisión

Adoptar LiveKit autoalojado como servidor de clases en vivo, con estas piezas:

- **Servidor LiveKit** en Railway, con Redis para estado de sala.
- **Token de acceso** emitido por la app: una ruta propia que valida matrícula
  activa y rol, y firma un token acotado a la sala de ESA sesión. El identificador
  de sala se deriva de `class_sessions.id`, nunca se acepta del cliente — mismo
  criterio que ya se aplicó en `/api/docente/perfil` (ADR-0028).
- **Egress (Room Composite)** para grabar la clase, con salida a almacenamiento
  S3-compatible y desde ahí ingesta a Mux por URL.
- **Webhooks de LiveKit** para marcar asistencia con un `method` nuevo
  (`livekit`), reusando la tabla `session_attendance` (0050) sin cambiar su forma.

`meeting_url` se conserva para las sesiones ya creadas y como respaldo si hay que
volver a un proveedor externo; deja de ser el camino por defecto.

## Hallazgos que condicionan el diseño

Estos dos se verificaron contra documentación antes de decidir, y ninguno era
obvio de antemano:

### Railway no expone UDP — el medio va por TCP

WebRTC prefiere UDP, y la documentación de LiveKit lo dice explícitamente: *"UDP
is preferred over TCP for WebRTC traffic, as it has better control over
congestion and latency"*. Railway **no expone puertos UDP crudos**; su plantilla
de LiveKit resuelve esto forzando el transporte por un proxy TCP (puerto 7882)
con reenvío por iptables.

Funciona, pero **no es gratis**: TCP introduce head-of-line blocking, así que ante
pérdida de paquetes la clase se degrada peor que con UDP (congelamientos en vez
de pérdida de calidad progresiva). La plantilla de Railway está pensada para
**agentes de voz 1-a-1**, no para un aula de ~20 personas: es un perfil de carga
distinto y no hay evidencia publicada de que se comporte igual.

**Consecuencia:** el riesgo de calidad hay que medirlo con una prueba de carga
real antes de mover una clase de verdad, no asumirlo resuelto por la plantilla.

### Egress no escribe directo a Mux, y es caro

Egress requiere Redis, pide **mínimo 4 CPU y 4 GB de memoria**, corre Chrome
headless, y un trabajo de Room Composite —el que sirve para grabar una clase
entera— consume **entre 2 y 6 CPU**. Sus salidas son S3, Azure Blob, GCS, RTMP,
MP4 o HLS: **Mux no es un destino nativo**.

**Consecuencia:** hace falta un salto intermedio (Egress → almacenamiento →
crear el asset en Mux por URL) y un servicio de Railway dimensionado aparte, que
solo se justifica si se apaga o se reduce cuando no hay clase en curso.

## Estado del despliegue (6-ago-2026)

**Paso 1 hecho y verificado: servidor y Redis arriba.** Proyecto Railway
`capitalacademy-livekit`, en el workspace de la empresa —el mismo donde ya vive
`umami-analytics`, que Capital Academy consume desde `app/layout.tsx:132`.

| Pieza | Estado |
|---|---|
| `livekit-server` v1.13.5 (imagen oficial, versión fijada) | corriendo |
| Redis (Railway) | conectado por red privada, `redis.railway.internal:6379` |
| Señalización pública | `https://livekit-production-0c7a.up.railway.app` → HTTP 200 |
| Autenticación | token firmado da 200; token adulterado da 401 |
| API de salas | `CreateRoom` → `ListRooms` → `DeleteRoom` los tres 200 |

Las credenciales (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) quedaron
en el `.env` local, que está en `.gitignore`. **Todavía no están en Netlify**
porque ninguna ruta de la app las usa aún.

Dos cosas que costaron y conviene no volver a descubrir:

- **Railway daba 502 con el servidor sano.** LiveKit respondía `OK` en
  `127.0.0.1:7880` dentro del contenedor y escuchaba en `:::7880`, así que no era
  el binding: era el puerto destino del proxy. Se resuelve declarando `PORT=7880`
  como variable del servicio; el flag `--port` de `railway domain` no bastó.
- **El log confirma la limitación de UDP en vivo**: `could not validate external
  IP` y `network is unreachable` contra el STUN. El servidor sigue funcionando
  porque cae al TCP de 7881, que es justo el camino que este ADR asume.

**Paso 2 hecho y verificado: el medio ya tiene camino público por TCP.**
TCP Proxy de Railway en `zephyr.proxy.rlwy.net:33805` → puerto interno 7881.

El problema resultó peor de lo anticipado, porque eran **dos** restricciones que
chocaban de frente:

- LiveKit usa **un solo** valor (`rtc.tcp_port`) para el puerto que escucha y
  para el que anuncia en su candidato ICE. Se verificó en el struct `RTCConfig`
  de `livekit/mediatransportutil` (`pkg/rtcconfig/config.go`): hay `tcp_port`,
  `node_ip`, `use_external_ip` y `skip_external_ip_validation`, pero **ninguna
  opción para anunciar un puerto distinto del que se escucha**.
- Railway **asigna** el puerto público y no deja elegirlo, y el puerto interno
  **no se puede cambiar después**: su API solo expone `tcpProxyCreate` y
  `tcpProxyDelete`, no un update.

La salida fue invertir el reparto en vez de pelear con ninguna de las dos:
**LiveKit escucha directamente en el puerto público** (así el candidato que
anuncia es correcto) y **`socat` traduce**, recibiendo donde Railway entrega y
reenviando a donde LiveKit escucha. Además `rtc.node_ip` se fija a la IP del
proxy —no la del contenedor, que es inalcanzable— y `use_external_ip` queda en
`false`, porque el descubrimiento por STUN sale por UDP y siempre falla acá.

Eso obligó a una **imagen propia** (`infra/livekit/`), versionada en el repo:
la oficial no trae `socat` ni forma de generar la configuración al arranque. El
entrypoint deriva todo de las variables que Railway inyecta
(`RAILWAY_TCP_PROXY_PORT`, `RAILWAY_TCP_APPLICATION_PORT`,
`RAILWAY_TCP_PROXY_DOMAIN`), así que una reasignación de puerto o IP no rompe
nada ni exige editar archivos.

Verificado: el contenedor tiene `socat` en 7881 y `livekit-server` en 33805; el
arranque reporta `nodeIP 66.33.22.227` y `rtc.portTCP 33805`; desde fuera el
puerto público acepta TCP en ~250 ms; y un STUN Binding Request enviado con
encuadre RFC 4571 hace que el servidor **cierre la conexión tras leerlo**, que es
justo lo que hace pion ante un ufrag desconocido — prueba de que el mux ICE está
leyendo el tráfico que llega por el camino público.

**Trampa cara:** dejar la variable `LIVEKIT_CONFIG` puesta. LiveKit la prefiere
por sobre el `--config` del entrypoint, así que el servidor arrancó ignorando
toda la configuración nueva: siguió anunciando la IP del contenedor y chocó con
`address already in use` contra el propio `socat`. Hay que borrarla, no basta
con dejar de usarla.

### Lo que falta (no hecho todavía)

1. **Prueba de carga con ~20 participantes reales.** Es lo único que puede
   confirmar o refutar el riesgo #1 de este ADR: hasta acá está probado que el
   transporte funciona, NO que la calidad aguante un aula.
2. Egress, emisión de tokens desde la app, webhooks de asistencia y migración de
   `class_sessions`.

## Opciones consideradas

### Opción A — LiveKit autoalojado en Railway (elegida)

- **Pros:** control total, sin costo por minuto de participante, mismo proveedor
  de infraestructura que el equipo ya decidió usar, datos de la clase en casa.
- **Contras:** el medio va por TCP con la degradación descrita; hay que operar
  servidor, Redis y Egress; el dimensionamiento de Egress es responsabilidad
  nuestra.

### Opción B — LiveKit Cloud para el SFU, Railway para lo demás

- **Pros:** UDP real y red global, sin operar el servidor de medios; Egress
  gestionado.
- **Contras:** costo por minuto de participante; contradice la restricción de
  despliegue ya fijada.

### Opción C — Seguir con Zoom/Meet y solo automatizar la grabación

- **Pros:** cambio mucho menor; la calidad de video es la de un proveedor maduro.
- **Contras:** no resuelve la asistencia ni la señal de lo ocurrido en clase, y
  la clase sigue fuera de la plataforma. No cumple la decisión de producto.

## Consecuencias

### Positivas

- La grabación entra sola al pipeline que ya existe: transcripción, resumen IA,
  capítulos y aviso al alumno dejan de esperar a que alguien suba un archivo.
- La asistencia de clases online deja de depender de que el alumno se acuerde de
  escanear.
- Aparece señal nueva y hoy inexistente: quién entró, cuándo y cuánto se quedó.

### Negativas

- Tres servicios nuevos que operar (LiveKit, Redis, Egress) y su costo fijo.
- La calidad de la clase queda atada a un transporte TCP, peor que el de Zoom.
- El almacenamiento intermedio es una pieza más que puede fallar entre la clase y
  la grabación publicada.

### Riesgos

- **El principal: que el aula por TCP no aguante ~20 participantes con calidad
  aceptable.** Mitigación: prueba de carga con participantes reales ANTES de
  migrar una clase del Diplomado, y `meeting_url` conservado como salida de
  emergencia.
- Que el costo de Egress sorprenda si queda encendido fuera de horario de clases.
- Que un fallo de Egress pierda la grabación de una clase que ya ocurrió y no se
  puede repetir. Mitigación: mantener disponible la subida manual a Mux como
  camino de recuperación.

## Referencias

- [Deploying LiveKit](https://docs.livekit.io/transport/self-hosting/deployment/) — puertos y requisitos de red
- [Self-hosting Egress](https://docs.livekit.io/home/self-hosting/egress/) — Redis, CPU y destinos de salida
- [Railway: LiveKit self-hosted WebRTC](https://railway.com/deploy/livekit-voice-agent) — proxy TCP en 7882
- ADR-0028 (perfil del docente) — criterio de resolver identidad por `auth.uid()` y nunca por un id del cliente
- Migraciones relacionadas: 0001 (`class_sessions`), 0041 (repetición vía `lesson_id`), 0050 (`session_attendance`)
