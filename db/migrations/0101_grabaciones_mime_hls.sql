-- 0101 — El bucket `grabaciones` acepta los segmentos HLS (enmienda a 0097).
--
-- 0097 creó el bucket con `allowed_mime_types = array['video/mp4']`, porque
-- entonces la única salida del egress era el MP4 final. La copia de seguridad
-- en segmentos (commit a097fc2) agrega una segunda salida que sube trozos `.ts`
-- y una lista `.m3u8` DURANTE la clase, al MISMO bucket.
--
-- Verificado contra prod el 2026-08-20 subiendo por S3 (la vía del egress): el
-- bucket responde `415 InvalidMimeType` a `video/mp2t`, a
-- `application/vnd.apple.mpegurl`, a `application/x-mpegURL` y a
-- `application/octet-stream`, y solo acepta `video/mp4`. Sin esta enmienda la
-- salida segmentada se despliega y NO sube ni un segmento: la mitigación de la
-- pérdida del 19-ago quedaría desactivada en silencio, igual que el techo
-- global de 50 MB que causó esa pérdida.
--
-- `application/octet-stream` entra a propósito: el content-type de los
-- segmentos lo pone el cliente S3 del egress y no está garantizado. El bucket
-- es privado y solo `service_role` escribe en él (0097), así que ampliar la
-- lista no abre una superficie nueva.
--
-- ADITIVO · idempotente. No toca el tope de tamaño ni la privacidad.

update storage.buckets
   set allowed_mime_types = array[
         'video/mp4',
         'video/mp2t',
         'application/vnd.apple.mpegurl',
         'application/x-mpegURL',
         'application/octet-stream'
       ]
 where id = 'grabaciones';
