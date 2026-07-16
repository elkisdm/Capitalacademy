-- =============================================================================
-- Capital Academy — Opt-in por programa de la alerta de inasistencias.
--
-- Problema (megaauditoría 2026-07-16, C5): getStudentsAtAbsenceThreshold
-- (lib/asistencia/queries.ts) evalúa TODAS las cohortes status='active' sin
-- mirar el programa. CAP-CI (239 matrículas activas, cupo real ~40 por sesión
-- presencial y por orden de llegada) acumula su 2ª ausencia al cerrar la sesión
-- del 28-jul: el 2026-07-28 ~16:30 UTC el cron enviaría a los 239 —equipo
-- interno de CI incluido— un correo que dice "Registramos 2 inasistencias /
-- Máximo permitido: 3", régimen que NO aplica a ese ciclo gratuito.
-- (Simulado contra prod: 266 alumnos cruzan el umbral ese día, 239 de CAP-CI.)
--
-- Decisión (ADR-0020): opt-in explícito por programa, default FALSE. La causa
-- raíz no es CAP-CI: es que el default era "todo programa nuevo envía alertas",
-- así que cada entorno nuevo hereda la alerta en silencio. Con default false un
-- programa nuevo no envía nada hasta que alguien lo decida.
--
-- No se reusa programs.min_attendance_pct: vale 85 tanto en el Diplomado como
-- en CAP-CI (no distingue), y su semántica es de certificación, no de alertas.
--
-- ADR-0013 definió la alerta para el Diplomado y es el único programa con
-- alertas realmente enviadas (las 24 filas de attendance_alerts son todas de la
-- cohorte b0000000-…-002). Se activa solo ese; el resto entra en opt-in con un
-- UPDATE de una línea, sin deploy.
--
-- Idempotente: add column if not exists + update por code.
-- =============================================================================

alter table public.programs
  add column if not exists attendance_alerts_enabled boolean not null default false;

comment on column public.programs.attendance_alerts_enabled is
  'Opt-in de la alerta de inasistencias (ADR-0013 / ADR-0020). Default false: un programa nuevo NO envía alertas hasta activarlo explícitamente. Lector: lib/asistencia/queries.ts::getStudentsAtAbsenceThreshold.';

update public.programs
  set attendance_alerts_enabled = true
  where code = 'DIP-VENTAS';
