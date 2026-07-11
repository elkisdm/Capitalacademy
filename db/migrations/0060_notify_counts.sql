-- =============================================================================
-- Capital Academy — Contador real de correos enviados por apertura de entregable.
--
-- Hallazgo (megaauditoría, LOTE 2): notifyDeliverableOpen (lib/deliverables/
-- notify.ts) reserva `open_notified_at` con un update condicional ANTES del
-- loop de envío (at-most-once). Si el proceso muere a mitad del loop, la
-- reserva ya quedó tomada y el resto de los correos se pierde SIN quedar
-- registrado en ningún lado: no hay forma de saber, después, cuántos alumnos
-- realmente recibieron el aviso.
--
-- Fix: `open_notified_count` guarda el conteo real de envíos exitosos (`sent`)
-- al terminar el loop. No cambia la propiedad at-most-once de la reserva (que
-- sigue siendo `open_notified_at`); solo deja bitácora para detectar envíos
-- parciales (count < matriculados activos del programa).
--
-- Idempotente: add column if not exists.
-- =============================================================================

alter table public.deliverables add column if not exists open_notified_count int not null default 0;
