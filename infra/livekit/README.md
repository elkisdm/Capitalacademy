# LiveKit en Railway

Servidor de clases en vivo, autoalojado. La decisión y sus tradeoffs están en
[ADR-0031](../../docs/adr/0031-clases-en-vivo-con-livekit-en-railway.md).

- **Proyecto Railway:** `capitalacademy-livekit` (workspace de la empresa)
- **Servicios:** `livekit` (esta imagen) y `Redis`
- **Señalización:** `wss://livekit-production-0c7a.up.railway.app`
- **Medio (ICE sobre TCP):** `zephyr.proxy.rlwy.net:33805`

## Por qué hay una imagen propia y no la oficial a secas

Railway no expone UDP, así que el medio de WebRTC tiene que ir por ICE sobre TCP
a través de su TCP Proxy. Ahí chocan dos restricciones:

- LiveKit usa **un solo** valor (`rtc.tcp_port`) para el puerto que escucha y
  para el que anuncia en su candidato ICE. No hay forma de separarlos.
- Railway **asigna** el puerto público (no se elige) y entrega el tráfico en un
  puerto interno distinto, que tampoco se puede cambiar después: la API solo
  tiene `tcpProxyCreate` y `tcpProxyDelete`.

La salida es invertir el reparto: LiveKit escucha en el puerto **público** (así
anuncia bien) y `socat` recibe donde Railway entrega y reenvía a donde LiveKit
escucha. Todo se deriva de las variables que Railway inyecta
(`RAILWAY_TCP_PROXY_PORT`, `RAILWAY_TCP_APPLICATION_PORT`,
`RAILWAY_TCP_PROXY_DOMAIN`), así que si Railway reasigna el puerto o la IP, esto
sigue funcionando sin editar nada.

## Desplegar

```bash
railway link --project capitalacademy-livekit --environment production --service livekit
railway up --service livekit
```

## Variables del servicio

| Variable | Para qué |
|---|---|
| `LIVEKIT_KEYS` | par `APIkey: secret` que firma los tokens |
| `LIVEKIT_REDIS_ADDR` | `redis.railway.internal:6379` (red privada) |
| `LIVEKIT_REDIS_PASSWORD` | referencia a `${{Redis.REDISPASSWORD}}` |
| `PORT` | `7880`. **No lo saques**: sin él el proxy HTTP de Railway da 502 aunque el servidor esté sano |

`LIVEKIT_CONFIG` **no debe existir**: si está, LiveKit la prefiere por sobre el
archivo que arma el entrypoint y se ignora toda la configuración de arriba.

## Verificar que quedó bien

```bash
curl -s https://livekit-production-0c7a.up.railway.app/
```

Debe responder `OK`. En los logs del arranque tienen que aparecer el `nodeIP` con
la IP del proxy (no la del contenedor) y `rtc.portTCP` con el puerto público:

```
livekit-entrypoint: anuncia 66.33.22.227:33805 (ICE sobre TCP)
starting LiveKit server {"nodeIP": "66.33.22.227", "rtc.portTCP": 33805}
```

## Pendiente

Prueba de carga con ~20 participantes reales antes de mover una clase del
Diplomado. El transporte TCP degrada peor que UDP ante pérdida de paquetes, y
ese riesgo todavía no está medido.
