-- =============================================================================
-- Capital Academy — Comunicaciones: correos masivos desde el panel.
--
-- Reemplaza los scripts one-off (scripts/send-novedades-alumnos.mjs y hermanos),
-- que segmentaban a mano, enviaban de a uno a ~3.5 correos/s y deduplicaban con
-- un JSON local NO versionado (scripts/.sent-*.json). Ese estado local es
-- invisible para el equipo y se pierde al cambiar de máquina.
--
-- Dos tablas, mismo patrón que 0075/0077 (ADR-0020):
--   email_campaigns            → el mensaje y su audiencia (una fila por campaña)
--   email_campaign_recipients  → bitácora POR DESTINATARIO
--
-- La bitácora es lo que hace seguro reintentar: el emisor calcula
-- `missing = audiencia − ya_entregados` y solo arma mensajes para esos. Con
-- entrega parcial la campaña queda 'failed' (reintentable), NUNCA 'sent'
-- (terminal) — el mismo bug que ADR-0020 corrigió en session_reminders, donde
-- 4 de 5 corridas históricas perdieron correos en silencio.
--
-- RLS: solo staff lee (is_platform_staff). Escribe la API con service_role, que
-- bypassa RLS: NO se abren políticas de escritura. El contenido de una campaña
-- no es de nadie en particular y la audiencia expone qué alumno recibió qué.
--
-- Idempotente: create table if not exists + drop policy if exists.
-- =============================================================================

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  -- null = todas las cohortes del programa.
  cohort_id uuid references public.cohorts(id) on delete cascade,

  subject text not null,
  -- Texto de vista previa del cliente de correo (el que se ve junto al asunto).
  preheader text,
  -- Cuerpo en Markdown acotado. Se renderiza a HTML email-safe al ENVIAR, no
  -- se guarda HTML: así un arreglo de plantilla arregla también los borradores.
  body_md text not null,
  cta_label text,
  cta_url text,

  -- Segmentación. audience_status espeja enrollment_status; se guarda como
  -- text[] y no como enum[] para poder listar sin castear en cada query.
  audience_status text[] not null default array['active'],
  -- null = sin filtro de segmento. Espeja enrollments.segment (0024).
  audience_segment text,

  status text not null default 'draft',
  recipients_count integer not null default 0,
  sent_count integer not null default 0,
  error text,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Reserva del envío (marca "en curso"), para que dos clics no disparen dos veces.
  send_started_at timestamptz,
  sent_at timestamptz,

  constraint email_campaigns_status_chk
    check (status in ('draft', 'sending', 'sent', 'failed')),
  constraint email_campaigns_subject_len_chk
    check (char_length(subject) between 1 and 200),
  constraint email_campaigns_body_len_chk
    check (char_length(body_md) between 1 and 20000),
  -- Un CTA a medias (label sin url o al revés) rendería un botón roto.
  constraint email_campaigns_cta_pair_chk
    check ((cta_label is null) = (cta_url is null))
);

create index if not exists email_campaigns_program_idx
  on public.email_campaigns(program_id, created_at desc);

alter table public.email_campaigns enable row level security;

drop policy if exists email_campaigns_staff_select on public.email_campaigns;
create policy email_campaigns_staff_select
  on public.email_campaigns
  for select using (public.is_platform_staff());

-- Bitácora por destinatario (ADR-0020). El email se guarda junto al student_id
-- porque es el dato con el que Resend respondió: si el alumno cambia de correo
-- después, la bitácora sigue diciendo a dónde se envió realmente.
create table if not exists public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  channel text not null default 'email',
  status text not null default 'sent',
  error text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint email_campaign_recipients_unique
    unique (campaign_id, channel, student_id),
  constraint email_campaign_recipients_channel_chk
    check (channel in ('email')),
  constraint email_campaign_recipients_status_chk
    check (status in ('sent', 'failed'))
);

create index if not exists email_campaign_recipients_lookup_idx
  on public.email_campaign_recipients(campaign_id, channel, status);

alter table public.email_campaign_recipients enable row level security;

drop policy if exists email_campaign_recipients_staff_select
  on public.email_campaign_recipients;
create policy email_campaign_recipients_staff_select
  on public.email_campaign_recipients
  for select using (public.is_platform_staff());

-- updated_at automático. La función ya existe desde 0001 (tg_set_updated_at).
drop trigger if exists tg_email_campaigns_updated_at on public.email_campaigns;
create trigger tg_email_campaigns_updated_at
  before update on public.email_campaigns
  for each row execute function public.tg_set_updated_at();
