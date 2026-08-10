-- 0093 — Que las URLs legibles sigan siendo legibles mañana.
--
-- La 0090 hizo el backfill de `slug` en hilos, evaluaciones y fichas de docente,
-- pero —a diferencia de la 0089, que dejó `alter column code set default
-- generate_meeting_code()`— no dejó DEFAULT ni trigger. Resultado: toda fila
-- creada DESPUÉS de la migración nace con `slug = NULL`, el listado cae al
-- fallback `slug ?? id` y la URL vuelve a ser el UUID que la 0090 existía para
-- eliminar. Silenciosamente, sin error en ninguna parte.
--
-- Un trigger y no un DEFAULT porque el slug se deriva de OTRA columna de la
-- misma fila (el título, el nombre) y un DEFAULT no puede leerlas.
--
-- El segundo arreglo es el doble guion: la 0090 arma el slug del hilo como
-- `left(slugify(title), 60) || '-' || left(id, 6)`. Si el carácter 60 del título
-- ya slugificado es un guion, el corte deja `…-` y el resultado tiene `--`, que
-- `SLUG_RE` de `lib/classroom/ref.ts` rechaza: el hilo da 404 desde su propia
-- entrada del listado, sin forma de llegar a él. `rtrim(..., '-')` lo cierra en
-- origen. Hoy en producción no hay ninguno afectado; el riesgo es el próximo
-- hilo de título largo, o cualquier entorno nuevo donde el backfill vuelva a
-- correr.

-- ── Hilos del foro ──────────────────────────────────────────────────────────

-- Misma forma que usó el backfill de la 0090, ahora en un solo lugar y sin el
-- doble guion. El sufijo del id va SIEMPRE (los títulos los escriben los
-- alumnos y se repiten mucho), así que no hace falta resolver choques.
create or replace function public.thread_slug(titulo text, id uuid)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(rtrim(left(public.slugify(titulo), 60), '-'), '') || '-' || left(id::text, 6),
    'hilo-' || left(id::text, 8)
  );
$$;

create or replace function public.set_thread_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null then
    new.slug := public.thread_slug(new.title, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists conversation_threads_slug_trg on public.conversation_threads;
create trigger conversation_threads_slug_trg
  before insert on public.conversation_threads
  for each row execute function public.set_thread_slug();

-- Repara los hilos ya guardados con `--` (ninguno en prod hoy; sí posible en
-- entornos donde el backfill corrió con otros títulos).
update public.conversation_threads
   set slug = regexp_replace(slug, '-{2,}', '-', 'g')
 where slug like '%--%';

-- ── Evaluaciones y fichas de docente ────────────────────────────────────────

-- Acá el slug NO lleva sufijo del id: se busca el legible (`/docente/paola-vicuna`)
-- y el sufijo aparece solo cuando hay choque, que es como quedó el backfill.
-- El bucle es la única forma de respetar el índice único sin depender de que el
-- llamador reintente.
create or replace function public.slug_unico(
  base text,
  tabla regclass,
  fallback text
)
returns text
language plpgsql
as $$
declare
  raiz text := nullif(rtrim(left(public.slugify(base), 60), '-'), '');
  candidato text;
  intento int := 0;
  existe boolean;
begin
  if raiz is null then
    return fallback;
  end if;

  loop
    candidato := case when intento = 0 then raiz else raiz || '-' || (intento + 1)::text end;
    execute format('select exists (select 1 from %s where slug = $1)', tabla)
      into existe
      using candidato;
    exit when not existe;
    intento := intento + 1;
    -- Cinturón: con un puñado de choques ya se resolvió; si no, cae al fallback
    -- en vez de girar para siempre.
    if intento > 50 then
      return fallback;
    end if;
  end loop;

  return candidato;
end;
$$;

create or replace function public.set_evaluation_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null then
    new.slug := public.slug_unico(
      new.title,
      'public.evaluations'::regclass,
      'evaluacion-' || left(new.id::text, 8)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists evaluations_slug_trg on public.evaluations;
create trigger evaluations_slug_trg
  before insert on public.evaluations
  for each row execute function public.set_evaluation_slug();

create or replace function public.set_instructor_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null then
    new.slug := public.slug_unico(
      new.full_name,
      'public.instructors'::regclass,
      'docente-' || left(new.id::text, 8)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists instructors_slug_trg on public.instructors;
create trigger instructors_slug_trg
  before insert on public.instructors
  for each row execute function public.set_instructor_slug();

-- Repara las filas que la 0090 dejó sin slug entre esa migración y esta.
update public.conversation_threads
   set slug = public.thread_slug(title, id)
 where slug is null;
