-- 0102 — El bucket `grabaciones` deja de filtrar por MIME (enmienda a 0097 y 0101).
--
-- La 0101 amplió la lista para aceptar los segmentos HLS, pero incluyó el
-- playlist como `application/x-mpegURL`. El egress lo envía en MINÚSCULAS
-- (`application/x-mpegurl`) y la validación de Supabase distingue mayúsculas,
-- así que el playlist siguió rechazado con 415 y **el egress terminó en
-- EGRESS_FAILED en todas las corridas**, aunque el MP4 y los segmentos hubieran
-- subido bien. Verificado en los logs de Railway del 2026-08-20:
--
--   egress_failed ... 415 InvalidMimeType:
--   mime type application/x-mpegurl is not supported
--
-- Se quita el filtro entero en vez de agregar la variante en minúsculas, por
-- dos razones:
--
-- 1. **No compra seguridad.** Solo `service_role` escribe en este bucket (0097).
--    Quien tenga esas credenciales puede nombrar cualquier archivo `.mp4` y
--    pasar el filtro igual. La lista blanca no defiende de nada real.
-- 2. **Ya rompió la grabación dos veces, en silencio.** Primero rechazando los
--    segmentos (0101), después el playlist por una diferencia de mayúsculas. El
--    costo de equivocarse en esta lista es una clase perdida; el beneficio es
--    cero. Es una restricción que solo puede hacer daño.
--
-- El tope de tamaño (8 GB) y la privacidad del bucket NO se tocan: esos sí
-- hacen algo.
--
-- ADITIVO · idempotente.

update storage.buckets
   set allowed_mime_types = null
 where id = 'grabaciones';
