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

### El supuesto del transporte TCP era FALSO (corregido el 6-ago)

> Este ADR sostuvo durante su primer día que, al no exponer Railway puertos UDP
> entrantes, el medio tenía que ir por ICE sobre TCP, con la degradación que eso
> implica. **La prueba de carga demostró que es falso** y el diseño se corrigió.

Lo que dice la documentación es cierto pero incompleto: Railway no expone
puertos UDP **entrantes**, y la documentación de LiveKit efectivamente prefiere
UDP (*"UDP is preferred over TCP for WebRTC traffic"*). De ahí salió la
conclusión equivocada.

Lo que pasa en realidad es que **Railway sí deja salir UDP y mantiene la
traducción de direcciones**, así que el par ICE se arma igual por UDP: LiveKit
descubre su IP pública por STUN, anuncia ahí sus candidatos, y las
comprobaciones de conectividad abren el camino de vuelta. No hace falta ningún
proxy TCP.

**El intento de forzar TCP fue activamente dañino.** Fijar `rtc.node_ip` a la IP
del TCP Proxy —para poder anunciar un candidato TCP alcanzable— hace que LiveKit
anuncie **también sus candidatos UDP** en una IP que no reenvía UDP. Resultado
medido: **0 de 20 suscriptores lograron conectar**. Con el descubrimiento normal
por STUN, los mismos 20 conectan con 0,002% de pérdida.

**Consecuencia:** el riesgo #1 de este ADR —que la clase se degradara por ir
sobre TCP— **no aplica**, porque el medio no va sobre TCP. Lo que queda abierto
es el caso contrario: qué pasa con un alumno cuya red bloquee UDP (ver más
abajo).

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

Tres cosas que costaron y conviene no volver a descubrir:

- **Railway daba 502 con el servidor sano.** LiveKit respondía `OK` en
  `127.0.0.1:7880` dentro del contenedor y escuchaba en `:::7880`, así que no era
  el binding: era el puerto destino del proxy. Se resuelve declarando `PORT=7880`
  como variable del servicio; el flag `--port` de `railway domain` no bastó.
- **`LIVEKIT_CONFIG` le gana al `--config`.** Si esa variable existe, LiveKit la
  prefiere e ignora el archivo que arma el entrypoint. Hay que borrarla, no basta
  con dejar de usarla.
- **Cambiar una variable NO redespliega el código.** Varias veces el servicio
  volvió a arrancar con la imagen oficial y la configuración por defecto, lo que
  hizo parecer que la configuración propia funcionaba cuando en realidad no
  estaba corriendo. Después de tocar variables hay que correr `railway up`.

**Paso 2: prueba de carga, y corrección del diseño (6-ago).**

La prueba se hizo con la herramienta oficial (`lk load-test`, livekit-cli
2.18.2): 1 publicador de video + 20 suscriptores, resolución media, 2 minutos.

| Configuración | Resultado |
|---|---|
| `node_ip` fijado a la IP del TCP Proxy + `socat` | **0 de 20 conectan** |
| `force_tcp: true` (UDP apagado a propósito) | **0 de 20 conectan** |
| Descubrimiento normal por STUN (la que quedó) | **20 de 20**, 7,1 Mbps, **0,002% de pérdida** |

O sea: **la arquitectura que este ADR proponía no funcionaba, y la que se creía
innecesaria sí.** El detalle está en la sección de hallazgos. El aparato de TCP
Proxy + `socat` se retiró de la imagen por ser una pieza móvil que no aportaba.

El TCP Proxy de Railway (`zephyr.proxy.rlwy.net:33805` → 7881) se dejó creado
pero **sin uso**: no cuesta nada y sirve de punto de partida si algún día se
retoma el respaldo por TCP.

### Lo que falta (no hecho todavía)

1. **Respaldo para redes que bloqueen UDP.** Hoy no existe: con `force_tcp` no
   conecta nadie. El intento con `socat` falló probablemente porque un proxy de
   espacio de usuario reescribe la dirección de origen a `127.0.0.1` y ICE ya no
   puede formar un par válido — es justamente la razón por la que la plantilla
   oficial de Railway usa `iptables REDIRECT`, que sí la preserva. Mientras esto
   no se resuelva, un alumno tras un firewall corporativo que bloquee UDP no
   podrá entrar a la clase.
2. **La prueba se corrió desde una sola máquina y una sola conexión.** Mide que
   el servidor abastece a 20 suscriptores, no 20 redes domésticas distintas. La
   prueba con alumnos reales sigue siendo necesaria antes de una clase de verdad.
3. Egress, emisión de tokens desde la app, webhooks de asistencia y migración de
   `class_sessions`.

## Opciones consideradas

### Opción A — LiveKit autoalojado en Railway (elegida)

- **Pros:** control total, sin costo por minuto de participante, mismo proveedor
  de infraestructura que el equipo ya decidió usar, datos de la clase en casa.
- **Contras:** hay que operar servidor, Redis y Egress, y el dimensionamiento de
  Egress es responsabilidad nuestra. Sin respaldo por TCP, un alumno con UDP
  bloqueado no puede entrar.

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

- **DESCARTADO** (era el principal): que el aula por TCP no aguantara ~20
  participantes. No aplica: el medio va por UDP y la prueba dio 0,002% de
  pérdida con 20 suscriptores.
- **Vigente: un alumno con UDP bloqueado hoy no puede entrar.** No hay respaldo
  por TCP funcionando. Mitigación mientras tanto: `meeting_url` conservado como
  salida de emergencia.
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
