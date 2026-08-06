#!/bin/sh
set -eu

# Arranque de LiveKit detrás del TCP Proxy de Railway (ADR-0031).
#
# EL NUDO QUE ESTE ARCHIVO RESUELVE
#
# Railway no expone UDP, así que el medio de WebRTC tiene que ir por ICE sobre
# TCP. Ahí chocan dos restricciones que ninguna de las dos partes puede ceder:
#
#   - LiveKit usa UN SOLO valor, `rtc.tcp_port`, tanto para el puerto que
#     ESCUCHA como para el que ANUNCIA en su candidato ICE. No existe opción
#     para separarlos (verificado en el struct RTCConfig de
#     livekit/mediatransportutil, pkg/rtcconfig/config.go).
#   - Railway ASIGNA el puerto público y no deja elegirlo, y entrega el tráfico
#     en un puerto interno distinto. Tampoco hay forma de cambiar el puerto
#     interno después: la API solo tiene `tcpProxyCreate` y `tcpProxyDelete`.
#
# La salida es invertir el reparto: LiveKit escucha directamente en el puerto
# PÚBLICO (así el candidato que anuncia es correcto) y socat hace de traductor,
# recibiendo donde Railway entrega y reenviando a donde LiveKit escucha.
#
# Todo se lee de las variables que Railway inyecta, así que si algún día
# reasigna el puerto o la IP del proxy, esto sigue funcionando sin tocar nada.

PROXY_PORT="${RAILWAY_TCP_PROXY_PORT:?falta RAILWAY_TCP_PROXY_PORT — habilita el TCP Proxy del servicio}"
APP_PORT="${RAILWAY_TCP_APPLICATION_PORT:?falta RAILWAY_TCP_APPLICATION_PORT}"
PROXY_DOMAIN="${RAILWAY_TCP_PROXY_DOMAIN:?falta RAILWAY_TCP_PROXY_DOMAIN}"

# LiveKit anuncia una IP, no un nombre de host: hay que resolverlo en el arranque.
PROXY_IP="$(getent hosts "$PROXY_DOMAIN" | awk '{ print $1; exit }')"
if [ -z "$PROXY_IP" ]; then
  echo "livekit-entrypoint: no se pudo resolver $PROXY_DOMAIN" >&2
  exit 1
fi

CONFIG=/tmp/livekit.yaml

cat > "$CONFIG" <<EOF
port: ${PORT:-7880}
log_level: ${LIVEKIT_LOG_LEVEL:-info}
rtc:
  # El puerto público de Railway: es el que LiveKit escucha Y anuncia.
  tcp_port: ${PROXY_PORT}
  # La IP del proxy, no la del contenedor: es la única alcanzable desde afuera.
  node_ip: ${PROXY_IP}
  # Ya fijamos node_ip a mano; descubrirla por STUN además de innecesario
  # falla, porque el STUN sale por UDP y Railway no lo permite.
  use_external_ip: false
EOF

if [ -n "${LIVEKIT_REDIS_ADDR:-}" ]; then
  cat >> "$CONFIG" <<EOF
redis:
  address: ${LIVEKIT_REDIS_ADDR}
  password: ${LIVEKIT_REDIS_PASSWORD:-}
EOF
fi

# Las llaves se escriben en el archivo (y no se dejan solo en LIVEKIT_KEYS) para
# que la configuración efectiva sea una sola y quede visible en un lugar.
if [ -n "${LIVEKIT_KEYS:-}" ]; then
  echo "keys:" >> "$CONFIG"
  echo "$LIVEKIT_KEYS" | sed 's/^/  /' >> "$CONFIG"
fi

echo "livekit-entrypoint: anuncia ${PROXY_IP}:${PROXY_PORT} (ICE sobre TCP)"

# Si alguna vez Railway entregara en el mismo puerto público, el traductor sobra
# y además chocaría con el socket de LiveKit.
if [ "$APP_PORT" != "$PROXY_PORT" ]; then
  echo "livekit-entrypoint: socat ${APP_PORT} -> 127.0.0.1:${PROXY_PORT}"
  socat "TCP-LISTEN:${APP_PORT},fork,reuseaddr" "TCP:127.0.0.1:${PROXY_PORT}" &
fi

exec /livekit-server --config "$CONFIG"
