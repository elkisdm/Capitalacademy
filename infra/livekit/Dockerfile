# LiveKit para Capital Academy, detrás del TCP Proxy de Railway (ADR-0031).
#
# La versión va FIJA a propósito: es infraestructura, y un `latest` que se mueve
# solo convertiría cualquier redeploy en una actualización no pedida.
FROM livekit/livekit-server:v1.13.5

# socat traduce entre el puerto donde Railway entrega y el que LiveKit escucha;
# el porqué está explicado en entrypoint.sh.
RUN apk add --no-cache socat

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
