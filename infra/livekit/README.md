# LiveKit en Railway

Servidor de clases en vivo, autoalojado. La decisión y sus tradeoffs están en
[ADR-0031](../../docs/adr/0031-clases-en-vivo-con-livekit-en-railway.md).

- **Proyecto Railway:** `capitalacademy-livekit` (workspace de la empresa)
- **Servicios:** `livekit` (esta imagen) y `Redis`
- **Señalización:** `wss://livekit-production-0c7a.up.railway.app`
- **Medio:** UDP, contra la IP pública que el propio servidor descubre por STUN

## Lo que hay que saber antes de tocar la configuración

**Railway sí deja pasar el medio por UDP.** Es contraintuitivo, porque Railway no
expone puertos UDP *entrantes*, pero deja salir UDP y mantiene la traducción de
direcciones, así que el par ICE se arma igual.

**No fijes `rtc.node_ip` a la IP del TCP Proxy.** Fue el primer intento y ROMPE
la conexión: hace que LiveKit anuncie también sus candidatos UDP en una IP que no
reenvía UDP. Medido: 0 de 20 suscriptores logran conectar. Con el descubrimiento
normal por STUN, los mismos 20 conectan con 0,002% de pérdida.

## Por qué hay una imagen propia y no la oficial a secas

Solo para generar la configuración al arranque a partir de las variables de
Railway. Es una capa fina sobre la imagen oficial, con la versión fijada.

## Desplegar

```bash
railway up --service livekit
```

**Cambiar una variable NO redespliega el código.** El servicio vuelve a arrancar
con la imagen oficial y la configuración por defecto, lo que hace parecer que la
configuración propia funciona cuando en realidad no está corriendo. Después de
tocar variables, corre `railway up`.

## Variables del servicio

| Variable | Para qué |
|---|---|
| `LIVEKIT_KEYS` | par `APIkey: secret` que firma los tokens |
| `LIVEKIT_REDIS_ADDR` | `redis.railway.internal:6379` (red privada) |
| `LIVEKIT_REDIS_PASSWORD` | referencia a `${{Redis.REDISPASSWORD}}` |
| `PORT` | `7880`. **No lo saques**: sin él el proxy HTTP de Railway da 502 aunque el servidor esté sano |
| `LIVEKIT_FORCE_TCP` | solo para medir: apaga el UDP. Hoy con esto NO conecta nadie |

`LIVEKIT_CONFIG` **no debe existir**: si está, LiveKit la prefiere por sobre el
archivo que arma el entrypoint y se ignora toda la configuración de arriba.

## Verificar que quedó bien

```bash
curl -s https://livekit-production-0c7a.up.railway.app/
```

Debe responder `OK`. Para probar el medio de verdad hace falta la herramienta
oficial (`brew install livekit-cli`):

```bash
lk load-test --url wss://livekit-production-0c7a.up.railway.app --api-key "$LIVEKIT_API_KEY" --api-secret "$LIVEKIT_API_SECRET" --room prueba --video-publishers 1 --subscribers 20 --duration 2m --video-resolution medium
```

Referencia de una corrida sana: **20/20 conectados, 7,1 Mbps, 0,002% de pérdida**.

## Pendiente

- **Respaldo para redes que bloqueen UDP.** Hoy no existe. El intento con `socat`
  falló, probablemente porque un proxy de espacio de usuario reescribe la
  dirección de origen a `127.0.0.1` y ICE ya no puede formar un par válido; por
  eso la plantilla oficial de Railway usa `iptables REDIRECT`, que sí la
  preserva. Mientras tanto, un alumno tras un firewall que bloquee UDP no podrá
  entrar a la clase.
- **La prueba se corrió desde una sola máquina.** Mide que el servidor abastece a
  20 suscriptores, no 20 redes domésticas distintas.
