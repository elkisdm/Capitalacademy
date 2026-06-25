-- =============================================================================
-- Capital Academy — Estado de error de procesamiento Mux en lessons
-- Spec (Tier 3, spec-flow): manejo del ciclo de vida de Mux. Cuando Mux falla al
-- subir/procesar un video (video.upload.errored / video.asset.errored), el
-- webhook guarda el motivo acá para que la UI lo muestre en vez de quedar en
-- polling infinito esperando un mux_playback_id que nunca llegará.
--
-- TODO ADITIVO · idempotente · reversible. Lo limpia el route de upload al
-- iniciar una subida nueva y el webhook al recibir video.asset.ready.
-- =============================================================================

alter table public.lessons
  add column if not exists mux_error text;

comment on column public.lessons.mux_error is
  'Motivo del fallo de subida/procesamiento en Mux (NULL = sin error). Lo setea el webhook en eventos errored; lo limpia un upload nuevo o asset.ready. Ver migración 0042.';
