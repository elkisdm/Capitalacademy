-- 0090 — Slugs legibles para docentes, hilos del foro y evaluaciones.
--
-- Cierra el barrido que empezó la 0089 con las clases: hasta ahora estas tres
-- rutas mostraban el UUID crudo en la URL
-- (/docente/6f2a…, /conversaciones/9b1c…, /quiz/4d7e…). Es la misma queja de
-- siempre: un enlace que no se puede leer, ni dictar, ni reconocer.
--
-- Continúa el patrón que la migración 0013 ya estableció para cohortes, módulos
-- y lecciones; estas tres tablas simplemente quedaron fuera en su momento.
--
-- El slug se deriva del nombre o el título, con sufijo corto solo cuando hay
-- choque: así `/docente/paola-vicuna` en vez de `/docente/6f2a…`.

-- OJO CON EL ORDEN: `unaccent_bytes` va primero porque `slugify` la llama. La
-- extensión `unaccent` de Postgres haría lo mismo, pero puede no estar instalada
-- en un entorno nuevo; `translate` cubre el español sin depender de nada.
create or replace function public.unaccent_bytes(texto text)
returns text
language sql
immutable
as $$
  select translate(
    coalesce(texto, ''),
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
  );
$$;

-- Normaliza un texto a slug: sin tildes, minúsculas, solo letras/números/guion.
create or replace function public.slugify(texto text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(
        lower(public.unaccent_bytes(coalesce(texto, ''))),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-{2,}', '-', 'g'
    )
  );
$$;

-- ── Docentes ────────────────────────────────────────────────────────────────
alter table public.instructors add column if not exists slug text;

update public.instructors i
   set slug = base.s || case when base.rn = 1 then '' else '-' || base.rn::text end
  from (
    select id,
           nullif(public.slugify(full_name), '') as s,
           row_number() over (partition by public.slugify(full_name) order by created_at, id) as rn
      from public.instructors
  ) base
 where i.id = base.id
   and i.slug is null
   and base.s is not null;

-- Una ficha sin nombre utilizable cae al id: es preferible un slug feo a que la
-- pantalla del docente deje de existir.
update public.instructors set slug = 'docente-' || left(id::text, 8) where slug is null;

create unique index if not exists instructors_slug_idx on public.instructors (slug);

-- ── Hilos del foro ──────────────────────────────────────────────────────────
alter table public.conversation_threads add column if not exists slug text;

update public.conversation_threads t
   set slug = left(base.s, 60) || '-' || left(t.id::text, 6)
  from (select id, nullif(public.slugify(title), '') as s from public.conversation_threads) base
 where t.id = base.id
   and t.slug is null
   and base.s is not null;

-- El sufijo del id va SIEMPRE en los hilos (y no solo ante choque): los títulos
-- los escriben los alumnos, se repiten mucho ("Duda de la clase 3") y un slug
-- que cambia de dueño según quién publicó primero sería peor que el UUID.
update public.conversation_threads
   set slug = 'hilo-' || left(id::text, 8)
 where slug is null;

create unique index if not exists conversation_threads_slug_idx
  on public.conversation_threads (slug);

-- ── Evaluaciones ────────────────────────────────────────────────────────────
alter table public.evaluations add column if not exists slug text;

update public.evaluations e
   set slug = base.s || case when base.rn = 1 then '' else '-' || base.rn::text end
  from (
    select id,
           nullif(public.slugify(title), '') as s,
           row_number() over (partition by public.slugify(title) order by created_at, id) as rn
      from public.evaluations
  ) base
 where e.id = base.id
   and e.slug is null
   and base.s is not null;

update public.evaluations set slug = 'evaluacion-' || left(id::text, 8) where slug is null;

-- Los títulos de evaluación son largos ("Quiz de clase — Panorama del mercado
-- inmobiliario en Chile"), y un slug de 90 caracteres no arregla nada: sigue
-- siendo ilegible, solo que en español. Se recorta al último guion antes de 52
-- y se cierra con sufijo del id, que además garantiza unicidad sin tener que
-- numerar contra el resto de la tabla (numerar solo entre los recortados choca
-- con los que ya estaban cortos: pasó al aplicarla).
update public.evaluations
   set slug = regexp_replace(left(slug, 52), '-[^-]*$', '') || '-' || left(id::text, 6)
 where length(slug) > 60;

create unique index if not exists evaluations_slug_idx on public.evaluations (slug);

comment on column public.instructors.slug is
  'Slug legible para /classroom/<cohorte>/docente/<slug> (0090). El UUID sigue siendo la clave real.';
comment on column public.conversation_threads.slug is
  'Slug legible del hilo, con sufijo del id porque los títulos se repiten (0090).';
comment on column public.evaluations.slug is
  'Slug legible para /classroom/quiz/<slug> (0090).';
