#!/bin/sh
set -eu

# Arranque de LiveKit en Railway (ADR-0031).
#
# LO QUE SE CREÍA Y RESULTÓ FALSO
#
# El supuesto de partida era que Railway, al no exponer puertos UDP entrantes,
# obligaba a llevar el medio de WebRTC por ICE sobre TCP. Es falso: Railway SÍ
# deja salir UDP y mantiene la traducción de direcciones, así que el par ICE se
# arma por UDP contra la IP de salida del contenedor. Medido con la herramienta
# oficial de carga: 1 publicador + 20 suscriptores, 7,1 Mbps, 0,002% de pérdida.
#
# El primer intento fijaba `node_ip` a la IP del TCP Proxy de Railway para poder
# anunciar un candidato TCP alcanzable. Eso ROMPE la conexión: hace que LiveKit
# anuncie también sus candidatos UDP en una IP que no reenvía UDP, y ninguno de
# los 20 suscriptores llegó a conectar. Por eso acá se deja el descubrimiento
# normal por STUN.
#
# El camino TCP queda pendiente como respaldo para redes que bloqueen UDP: ver
# la sección correspondiente en el ADR y en el README de esta carpeta.

CONFIG=/tmp/livekit.yaml

cat > "$CONFIG" <<EOF
port: ${PORT:-7880}
log_level: ${LIVEKIT_LOG_LEVEL:-info}
rtc:
  # Descubre la IP pública por STUN y anuncia ahí los candidatos. Es lo que hace
  # que el medio funcione; no lo fijes a mano salvo que sepas lo de arriba.
  use_external_ip: true
  tcp_port: ${RAILWAY_TCP_APPLICATION_PORT:-7881}
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

# Interruptor para MEDIR el peor caso: apaga el UDP a propósito y obliga a ICE
# sobre TCP. Hoy con esto NO conecta nadie —el respaldo TCP todavía no está
# resuelto—, así que sirve para verificar si un intento futuro lo arregla.
if [ "${LIVEKIT_FORCE_TCP:-}" = "true" ]; then
  echo "  force_tcp: true" >> "$CONFIG"
  echo "livekit-entrypoint: UDP DESACTIVADO a propósito (LIVEKIT_FORCE_TCP=true)"
fi

echo "livekit-entrypoint: config lista; el medio va por UDP con IP descubierta por STUN"

exec /livekit-server --config "$CONFIG"
