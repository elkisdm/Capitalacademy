-- =============================================================================
-- Capital Academy — Métricas de actividad del alumno (ADR-0029)
--
-- Pedido de la clienta (reunión 2026-07-29): medir el uso y el TIEMPO que el
-- alumno pasa dentro de la plataforma — quién la usa, cuánto rato, y quién
-- lleva días sin aparecer.
--
-- Hoy eso no se puede responder. Lo único que se mide es progreso de VIDEO
-- (video_progress, 0006) y asistencia a clases en vivo (session_attendance,
-- 0050). Leer el foro, rendir un quiz, revisar entregables o mirar las notas no
-- deja ningún rastro: un alumno que entra todos los días y nunca abre un video
-- aparece como completamente inactivo. Además watch_percentage mide avance del
-- cabezal del reproductor, no tiempo invertido.
--
-- DISEÑO (las tres restricciones vienen de ADR-0029)
--
-- 1. UNA FILA POR (MATRÍCULA, DÍA), no una por latido. Con ~400 matrículas
--    activas y latido de 60 s, guardar cada latido serían ~48.000 filas/día
--    (~17 M al año) — inviable para agregar en TypeScript, que es como este
--    repo calcula todos sus reportes. Agregado por día son ~400 filas/día.
--
-- 2. EL SERVIDOR CALCULA EL TIEMPO; EL CLIENTE SOLO DICE "SIGO ACÁ". El cuerpo
--    del POST no lleva segundos: el incremento se deriva acá como
--    now() - last_beat_at, recortado a p_max_gap_seconds. Un cliente manipulado
--    no puede inflar su tiempo (cada latido acredita a lo más el tope) y un
--    latido reenviado por reintento acredita ~0, así que el latido es
--    naturalmente idempotente.
--
-- 3. ESCRITURA SOLO POR service_role, EN UN SOLO STATEMENT ATÓMICO. El
--    upsert-con-incremento vive en record_student_activity() y lo invoca la
--    ruta con el cliente admin. Evita (a) el patrón leer-modificar-escribir
--    desde TypeScript, que con dos pestañas abiertas pierde escrituras, y
--    (b) volver a pagar la cascada de RLS en caliente — la lección del
--    incidente de timeouts 57014 del 21-jul (ver 0079). Mismo criterio que
--    ADR-0019 y que increment_coupon_redemptions (0061).
--
-- POR QUÉ enrollment_id Y NO user_id: así reusa tal cual owns_enrollment() e
-- is_staff_of_enrollment(), las funciones SECURITY DEFINER que 0079 creó
-- justamente para cortar la recursión de RLS, y porque todos los paneles del
-- admin son por cohorte.
--
-- QUÉ NO SE REGISTRA, A PROPÓSITO: ni ruta visitada, ni tiempo por lección, ni
-- eventos por página. Esto mide personas identificadas; se guarda el mínimo que
-- responde las tres preguntas y nada más (megaauditoría v1: PII con RLS
-- abierta).
--
-- activity_date es el día calendario de CHILE, resuelto por la aplicación con
-- lib/time.ts (TZ_CHILE) y pasado como parámetro. No se usa
-- now() at time zone 'America/Santiago' acá para que el corte de día sea el
-- mismo que el que muestran los paneles, con una sola fuente de verdad.
--
-- NO APLICADA a producción todavía.
--
-- Idempotente: create ... if not exists, drop policy if exists antes de create.
-- =============================================================================

create table if not exists public.student_activity_daily (
  id uuid primary key default gen_random_uuid(),

  -- on delete cascade: sin la matrícula el dato no significa nada, y borrar a
  -- una persona debe llevarse su rastro de comportamiento (a diferencia de
  -- access_email_log, donde la evidencia de soporte sí se preserva).
  enrollment_id uuid not null
    references public.enrollments(id) on delete cascade,

  -- Día calendario de Chile (columna `date`, NO un instante: formatearla con
  -- timeZone Chile la retrocedería un día — ver el encabezado de lib/time.ts).
  activity_date date not null,

  -- Segundos acumulados con la plataforma abierta y visible. NO son "horas de
  -- estudio": el alumno pudo tener la pestaña al frente sin leer nada, o
  -- estudiar con material descargado sin sumar un segundo acá.
  active_seconds integer not null default 0,

  -- Cantidad de latidos recibidos en el día. Sirve para distinguir "estuvo
  -- 40 minutos seguidos" de "entró 12 veces por un minuto".
  beats integer not null default 0,

  first_beat_at timestamptz not null default now(),
  last_beat_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un solo renglón por matrícula y día: es el corazón del diseño agregado.
  constraint student_activity_daily_unique
    unique (enrollment_id, activity_date),

  -- 86400 = un día completo. El tope real lo impone el recorte por latido de
  -- la función; esta restricción es el cinturón de seguridad por si alguna vez
  -- se escribe la tabla por otra vía.
  constraint student_activity_daily_seconds_chk
    check (active_seconds >= 0 and active_seconds <= 86400),
  constraint student_activity_daily_beats_chk
    check (beats >= 0)
);

-- La consulta del panel es "actividad de estas matrículas en este rango de
-- fechas": el índice único (enrollment_id, activity_date) ya la sirve.

-- Rollup transversal del día ("quién estuvo activo hoy", sin filtrar por
-- cohorte), que el índice único no cubre porque enrollment_id va primero.
create index if not exists student_activity_daily_date_idx
  on public.student_activity_daily(activity_date desc);

alter table public.student_activity_daily enable row level security;

-- Una sola policy permisiva de SELECT, no tres: Postgres evalúa cada policy por
-- separado y ese fue justamente uno de los costos que 0079 tuvo que deshacer.
-- Todas las llamadas van envueltas en (select ...) para forzar el initplan
-- caching (se evalúan una vez por consulta, no por fila candidata).
drop policy if exists student_activity_daily_select on public.student_activity_daily;
create policy student_activity_daily_select
  on public.student_activity_daily
  for select using (
    (select public.owns_enrollment(student_activity_daily.enrollment_id))
    or (select public.is_staff_of_enrollment(student_activity_daily.enrollment_id))
    or (select public.is_platform_staff())
  );

-- Sin políticas de insert/update/delete: la escritura es exclusivamente por
-- service_role, vía record_student_activity(). Un alumno puede LEER lo suyo
-- pero no puede escribirlo — si pudiera, la métrica no valdría nada.

-- ----------------------------------------------------------------------------
-- Latido: acumula el tiempo transcurrido desde el latido anterior, recortado.
-- ----------------------------------------------------------------------------
--
-- Devuelve jsonb (y no `returns table`) a propósito: con RETURNS TABLE las
-- columnas de salida son parámetros OUT y chocan por nombre con las columnas
-- homónimas del RETURNING, que es un error de referencia ambigua.
--
-- La primera fila del día se crea con active_seconds = 0: el primer latido abre
-- el reloj, no acredita tiempo. Por eso una sesión que cruza la medianoche de
-- Chile pierde a lo más un intervalo de latido (ADR-0029, riesgos).
create or replace function public.record_student_activity(
  p_enrollment_id uuid,
  p_activity_date date,
  p_max_gap_seconds integer
)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  with upserted as (
    insert into public.student_activity_daily as sad (
      enrollment_id, activity_date, active_seconds, beats, first_beat_at, last_beat_at
    )
    values (p_enrollment_id, p_activity_date, 0, 1, now(), now())
    on conflict (enrollment_id, activity_date) do update
      set
        -- least(..., 86400) respeta la check constraint incluso ante un reloj
        -- corrido; greatest(..., 0) descarta un delta negativo por lo mismo.
        active_seconds = least(
          sad.active_seconds + least(
            greatest(
              floor(extract(epoch from (now() - sad.last_beat_at)))::integer,
              0
            ),
            greatest(coalesce(p_max_gap_seconds, 0), 0)
          ),
          86400
        ),
        beats = sad.beats + 1,
        last_beat_at = now(),
        updated_at = now()
    returning
      sad.activity_date,
      sad.active_seconds,
      sad.beats,
      sad.last_beat_at
  )
  select jsonb_build_object(
    'activity_date', u.activity_date,
    'active_seconds', u.active_seconds,
    'beats', u.beats,
    'last_beat_at', u.last_beat_at
  )
  from upserted u;
$$;

-- Es security definer: sin la revocación, cualquier sesión autenticada podría
-- llamarla con un enrollment_id ajeno y ensuciar la métrica de otra persona.
-- La ruta valida la matrícula ANTES de invocarla, con el cliente admin.
-- Mismo blindaje que increment_coupon_redemptions (0061).
revoke execute on function public.record_student_activity(uuid, date, integer)
  from public, anon, authenticated;
grant execute on function public.record_student_activity(uuid, date, integer)
  to service_role;
