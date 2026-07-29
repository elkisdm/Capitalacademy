-- =============================================================================
-- Capital Academy — Encuestas federadas (ADR-0026).
--
-- El MOTOR de encuestas NO vive aquí: vive en capital-admin/hclp sobre el
-- Supabase COMPARTIDO (upygbobjarduunbwzeva), con sus tablas surveys /
-- survey_submissions / survey_answers / survey_recipients y su renderer público
-- en capitalinteligente.com/s/{slug}. Capital Academy usa OTRO Supabase
-- (igatsyghbadccbrjiurl), así que no puede tener FKs a esas tablas.
--
-- Lo que sí es responsabilidad de Capital Academy —y lo que guardan estas dos
-- tablas— es el ENVÍO: a qué grupo de alumnos se mandó cada encuesta, cuándo, y
-- a quién le llegó. Por eso el enlace con el motor remoto es por
-- external_survey_id / external_survey_slug (texto, sin FK) y no por relación.
--
-- Dos modos, con consecuencias distintas y deliberadas:
--   'anonymous'  → access_mode 'open' en el motor remoto. El enlace es IDÉNTICO
--                  para todos (sin token, sin ?email=). El correo lo manda
--                  Capital Academy con su propio branding vía Resend.
--   'identified' → access_mode 'gated'. El enrolamiento se delega al endpoint de
--                  ingesta de hclp, que emite un token por persona y despacha
--                  correo + WhatsApp con su propia dedup de 30 días.
-- El modo es inmutable una vez enviada: cambiarlo rompería el anonimato ya
-- prometido a quien respondió.
--
-- RLS: solo staff lee. Escribe la API con service_role. Mismo criterio que 0082.
-- =============================================================================

create table if not exists public.survey_campaigns (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  -- null = todas las cohortes del programa.
  cohort_id uuid references public.cohorts(id) on delete cascade,

  title text not null,
  -- Identidad en el motor remoto. Sin FK a propósito: viven en otra base.
  external_survey_id text,
  external_survey_slug text not null,
  external_survey_url text not null,

  mode text not null,
  status text not null default 'draft',

  audience_status text[] not null default array['active'],
  audience_segment text,

  recipients_count integer not null default 0,
  sent_count integer not null default 0,
  error text,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  send_started_at timestamptz,
  sent_at timestamptz,

  constraint survey_campaigns_mode_chk
    check (mode in ('anonymous', 'identified')),
  constraint survey_campaigns_status_chk
    check (status in ('draft', 'sending', 'sent', 'failed')),
  constraint survey_campaigns_title_len_chk
    check (char_length(title) between 1 and 200)
);

create index if not exists survey_campaigns_program_idx
  on public.survey_campaigns(program_id, created_at desc);

alter table public.survey_campaigns enable row level security;

drop policy if exists survey_campaigns_staff_select on public.survey_campaigns;
create policy survey_campaigns_staff_select
  on public.survey_campaigns
  for select using (public.is_platform_staff());

-- Bitácora por destinatario (ADR-0020). A diferencia de 0082, aquí `channel`
-- admite 'whatsapp': en modo identificado el despachador es hclp y reporta el
-- resultado por canal, así que la bitácora registra lo que hclp respondió.
--
-- OJO — en modo anónimo esta tabla dice "a quién se le ENVIÓ", nunca "quién
-- RESPONDIÓ". La respuesta vive en el motor remoto sin identificador, y esa
-- separación es justamente lo que sostiene el anonimato.
create table if not exists public.survey_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.survey_campaigns(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  channel text not null default 'email',
  status text not null default 'sent',
  error text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint survey_campaign_recipients_unique
    unique (campaign_id, channel, student_id),
  constraint survey_campaign_recipients_channel_chk
    check (channel in ('email', 'whatsapp')),
  constraint survey_campaign_recipients_status_chk
    check (status in ('sent', 'failed', 'skipped'))
);

create index if not exists survey_campaign_recipients_lookup_idx
  on public.survey_campaign_recipients(campaign_id, channel, status);

alter table public.survey_campaign_recipients enable row level security;

drop policy if exists survey_campaign_recipients_staff_select
  on public.survey_campaign_recipients;
create policy survey_campaign_recipients_staff_select
  on public.survey_campaign_recipients
  for select using (public.is_platform_staff());

drop trigger if exists tg_survey_campaigns_updated_at on public.survey_campaigns;
create trigger tg_survey_campaigns_updated_at
  before update on public.survey_campaigns
  for each row execute function public.tg_set_updated_at();
