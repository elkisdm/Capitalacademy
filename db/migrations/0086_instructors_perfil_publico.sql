-- =============================================================================
-- Capital Academy — Perfil público del profesor: redes sociales y titular.
--
-- ADR: docs/adr/0028-perfil-publico-del-profesor.md
--
-- Pedido de la clienta (reunión 29-jul-2026): que los ALUMNOS puedan ver la
-- descripción/bio y las redes sociales del docente. `instructors` ya tiene
-- `bio` y `photo_url` desde 0022, pero NO tiene dónde guardar redes.
--
-- Por qué en `instructors` y NO en `profiles`: un alumno NO puede leer el
-- `profiles` de otra persona (0045_rls_hardening: `profiles_select` es
-- `id = auth.uid() or is_platform_staff()`). `instructors`, en cambio, ya tiene
-- una policy de lectura con scope por programa
-- (`instructors_program_scoped_select`, 0059) que deja al alumno ver justo a
-- los docentes que dictan en su programa. Es el catálogo dedicado y la única
-- tabla desde la que este dato es legible por su audiencia.
--
-- NO toca policies: la lectura (0059) y la escritura (0022 / 0085) quedan tal
-- cual. Las columnas nuevas heredan el mismo scope de la policy de SELECT, así
-- que un alumno de otro programa sigue sin ver nada de este instructor.
--
-- Idempotente (`add column if not exists` + `drop constraint if exists`).
--
-- Aplicar con el flujo de migraciones del proyecto y regenerar los tipos
-- después (`supabase gen types`). Mientras tanto, `lib/instructors/types.ts`
-- declara las columnas nuevas a mano, igual que se hizo con
-- `class_sessions.teacher_id` en 0022.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columnas nuevas
-- ----------------------------------------------------------------------------
-- `headline`: cargo/titular corto que se muestra bajo el nombre
-- ("Directora Académica · Capital Academy"). Es el equivalente de
-- `profiles.job_title`, pero editable por ops sin depender de que el docente
-- complete su onboarding — y legible por el alumno, que es el punto.
--
-- Las tres URLs son el set MÍNIMO que la clienta pidió: LinkedIn (la red
-- profesional del rubro), Instagram (la que usan los docentes para difusión) y
-- un sitio web propio. Nada más: agregar redes que nadie va a llenar solo
-- ensucia el formulario de admin.
alter table public.instructors
  add column if not exists headline      text,
  add column if not exists linkedin_url  text,
  add column if not exists instagram_url text,
  add column if not exists website_url   text;

comment on column public.instructors.headline is
  'Cargo o titular corto del docente, visible para el alumno bajo el nombre.';
comment on column public.instructors.linkedin_url is
  'Perfil de LinkedIn (https:// obligatorio). NULL = no se muestra el enlace.';
comment on column public.instructors.instagram_url is
  'Perfil de Instagram (https:// obligatorio). NULL = no se muestra el enlace.';
comment on column public.instructors.website_url is
  'Sitio web propio del docente (https:// obligatorio). NULL = no se muestra.';

-- ----------------------------------------------------------------------------
-- 2. CHECK de formato — defensa en la BD contra URLs peligrosas
-- ----------------------------------------------------------------------------
-- Estas tres columnas terminan en el `href` de un <a> que ve el alumno. Sin
-- restricción, un valor como `javascript:alert(1)` cargado por error (o por un
-- staff comprometido) se convierte en XSS al clic. El CHECK exige `https://`
-- explícito: descarta `javascript:`, `data:`, `vbscript:` y también `http://`
-- (no hay motivo para enlazar sin TLS a LinkedIn/Instagram en 2026).
--
-- El límite de 500 caracteres evita que un pegado accidental de una URL
-- gigante rompa el layout de la ficha.
--
-- La app valida lo mismo antes de escribir (zod en el route handler) y otra vez
-- al renderizar (`lib/instructors/social.ts`). El CHECK es la última línea: la
-- que sigue en pie si alguien escribe por SQL a mano, que es exactamente como
-- se administraba esta tabla hasta ahora.
alter table public.instructors
  drop constraint if exists instructors_linkedin_url_https;
alter table public.instructors
  add constraint instructors_linkedin_url_https
  check (
    linkedin_url is null
    or (linkedin_url ~ '^https://[^[:space:]]+$' and length(linkedin_url) <= 500)
  );

alter table public.instructors
  drop constraint if exists instructors_instagram_url_https;
alter table public.instructors
  add constraint instructors_instagram_url_https
  check (
    instagram_url is null
    or (instagram_url ~ '^https://[^[:space:]]+$' and length(instagram_url) <= 500)
  );

alter table public.instructors
  drop constraint if exists instructors_website_url_https;
alter table public.instructors
  add constraint instructors_website_url_https
  check (
    website_url is null
    or (website_url ~ '^https://[^[:space:]]+$' and length(website_url) <= 500)
  );

alter table public.instructors
  drop constraint if exists instructors_headline_len;
alter table public.instructors
  add constraint instructors_headline_len
  check (headline is null or length(headline) <= 120);

-- ----------------------------------------------------------------------------
-- Verificación (correr a mano tras aplicar)
-- ----------------------------------------------------------------------------
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'instructors'
--    order by ordinal_position;
--   -- se esperan las 4 columnas nuevas, todas nullable.
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.instructors'::regclass and contype = 'c';
--   -- se esperan los 4 CHECK de arriba.
--
--   select policyname, cmd from pg_policies where tablename = 'instructors';
--   -- se espera que NO haya cambiado nada respecto de 0059 / 0085.
