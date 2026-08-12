-- 0098: Historial de evaluaciones financieras por USUARIO (enmienda 3, ADR-0032)
--
-- Revierte parcialmente la decisión 1 del ADR-0032: la ficha sigue sin
-- autoguardarse, pero el guardado EXPLÍCITO del asesor ahora persiste en su
-- cuenta (antes localStorage del computador). Contiene datos financieros de un
-- tercero identificado: la RLS es estricta — cada usuario ve SOLO lo suyo, sin
-- excepción para admin/ops. No hay política de UPDATE: cada entrada es una foto
-- inmutable del análisis; se guarda de nuevo o se elimina.

create table if not exists public.evaluation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nombre text not null default 'Ficha sin nombre',
  valor_uf numeric not null,
  ficha jsonb not null,
  evaluacion jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists evaluation_history_user_created_idx
  on public.evaluation_history (user_id, created_at desc);

alter table public.evaluation_history enable row level security;

-- (select auth.uid()) y no auth.uid(): initplan una vez por consulta, no por
-- fila (lección del incidente de statement timeout del 21-jul, migración 0079).
create policy "evaluation_history_select_own" on public.evaluation_history
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "evaluation_history_insert_own" on public.evaluation_history
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "evaluation_history_delete_own" on public.evaluation_history
  for delete to authenticated
  using (user_id = (select auth.uid()));
