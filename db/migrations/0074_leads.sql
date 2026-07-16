-- =============================================================================
-- Capital Academy — Versionar `leads` (drift datos↔migraciones · megaauditoría
-- 2026-07-16, hallazgo C3)
--
-- La tabla se creó por el dashboard de Supabase (versión remota
-- `20260508043135 create_leads_table`) y era la ÚNICA de las 37 tablas de prod
-- sin migración local: cualquier entorno reconstruido desde db/migrations/
-- (staging, local, disaster recovery) nacía sin ella y el formulario de la
-- landing (app/api/leads/route.ts) devolvía 500 en el primer submit.
--
-- Este archivo REPRODUCE el estado de prod; es un no-op allí (todo con
-- IF NOT EXISTS) y solo sirve para que la reconstrucción sea fiel y auditable.
--
-- SEGURIDAD — LA AUSENCIA DE POLICIES ES INTENCIONAL, NO UN OLVIDO:
-- `leads` guarda PII de prospectos (nombre, email, teléfono, ip_hash, utm_*).
-- En prod tiene RLS habilitada y CERO policies → deny-all para anon/authenticated.
-- El único escritor es app/api/leads/route.ts, que usa createAdminClient()
-- (service_role, bypassa RLS). NO agregues una policy de INSERT para `anon`:
-- expondría la tabla de PII a escritura pública directa vía PostgREST.
-- =============================================================================

create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  full_name        text not null,
  email            text not null,
  phone            text not null,
  role             text,
  company          text,
  program_interest text not null,
  message          text,
  source           text,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  utm_content      text,
  utm_term         text,
  user_agent       text,
  ip_hash          text,
  constraint leads_program_interest_check
    check (program_interest = any (array['diplomado', 'liderazgo', 'ruta', 'indeciso']))
);

create index if not exists leads_created_at_idx
  on public.leads using btree (created_at desc);

create index if not exists leads_program_interest_idx
  on public.leads using btree (program_interest);

-- RLS deny-all: sin policies, solo service_role escribe/lee (ver cabecera).
alter table public.leads enable row level security;
