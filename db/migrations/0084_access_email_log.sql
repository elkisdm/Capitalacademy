-- =============================================================================
-- Capital Academy — Bitácora de los correos de ACCESO (enlace para activar la
-- cuenta o recuperar la contraseña).
--
-- Problema: app/api/auth/forgot-password/route.ts responde `ok: true` en los
-- tres desenlaces posibles —enlace enviado, Resend rechazó el envío, o el
-- correo no tiene cuenta— y la pantalla siempre dice "Enlace enviado". Eso es
-- correcto de cara al alumno (responder distinto delataría qué correos existen
-- en la plataforma), pero hacia adentro deja al equipo a ciegas: cuando alguien
-- reporta "no me llega nada" no hay forma de saber si el correo salió, si
-- rebotó, o si tecleó mal su dirección.
--
-- Al 2026-07-29 hay 312 personas matriculadas que nunca activaron su cuenta
-- (150 en el I Ciclo 2026, vigente hasta el 18-ago). Van a pedir su enlace, y
-- soporte necesita poder responder con evidencia.
--
-- Fix: bitácora append-only de cada solicitud. `status` guarda el desenlace del
-- ENVÍO; `delivery_status`/`delivered_at` los actualiza después el webhook de
-- Resend (email.delivered / bounced / complained) buscando por
-- provider_message_id. Se separan a propósito: el webhook no debe poder pisar
-- el hecho de que el envío ocurrió.
--
-- A diferencia de session_reminder_recipients (0075) y de los ledgers de 0077,
-- acá NO hay restricción de unicidad: pedir el enlace tres veces son tres
-- hechos distintos y los tres importan para soporte. Esto es una bitácora, no
-- un mecanismo de idempotencia.
--
-- Se registran también los intentos SIN cuenta (`status = 'no_account'`): el
-- caso de soporte más común es que la persona escriba mal su correo, y sin ese
-- registro es indistinguible de "el correo nunca salió".
--
-- RLS: solo staff lee (is_platform_staff), mismo criterio que 0075/0077. La
-- ruta escribe con service_role (bypassa RLS): NO se abren políticas de
-- escritura.
--
-- Aplicada a producción el 2026-07-29 (versión 20260729155905).
--
-- Idempotente: create ... if not exists, drop policy if exists antes de create.
-- =============================================================================

create table if not exists public.access_email_log (
  id uuid primary key default gen_random_uuid(),

  -- Se guarda el correo tal como lo pidió quien lo escribió (normalizado a
  -- minúsculas) porque el caso de soporte más útil es justamente el correo que
  -- NO corresponde a ninguna cuenta.
  email text not null,

  -- Nulo cuando no existe cuenta para ese correo. on delete set null: borrar a
  -- una persona no debe borrar la evidencia de soporte.
  user_id uuid references public.profiles(id) on delete set null,

  kind text not null default 'access_link',

  -- Desenlace del ENVÍO.
  status text not null,
  error text,

  -- Desenlace de la ENTREGA, lo escribe el webhook de Resend. Nulo mientras no
  -- haya llegado ningún evento (o si el webhook no está dado de alta todavía).
  delivery_status text,
  delivered_at timestamptz,

  provider text not null default 'resend',
  provider_message_id text,

  created_at timestamptz not null default now(),

  constraint access_email_log_kind_chk
    check (kind in ('access_link')),
  constraint access_email_log_status_chk
    check (status in ('sent', 'failed', 'no_account')),
  constraint access_email_log_delivery_status_chk
    check (delivery_status is null
           or delivery_status in ('delivered', 'bounced', 'complained')),
  constraint access_email_log_provider_chk
    check (provider in ('resend'))
);

-- Soporte busca "qué pasó con el correo de esta persona", más reciente primero.
create index if not exists access_email_log_email_idx
  on public.access_email_log(lower(email), created_at desc);

-- La ficha del alumno en el panel admin lista por usuario.
create index if not exists access_email_log_user_idx
  on public.access_email_log(user_id, created_at desc)
  where user_id is not null;

-- El webhook resuelve el evento de Resend contra su fila por message id.
create index if not exists access_email_log_provider_message_idx
  on public.access_email_log(provider_message_id)
  where provider_message_id is not null;

alter table public.access_email_log enable row level security;

drop policy if exists access_email_log_staff_select on public.access_email_log;
create policy access_email_log_staff_select
  on public.access_email_log
  for select using (public.is_platform_staff());

-- Sin políticas de insert/update/delete: escritura solo por service_role.
