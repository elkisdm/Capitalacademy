-- 0089 — Código legible de reunión para las clases en vivo (ADR-0031).
--
-- Hasta ahora la clase se abría con su UUID en la URL
-- (/clase/ffffffff-0000-0000-0000-0000000000aa): imposible de dictar por
-- teléfono, de leer en voz alta o de reconocer en un correo. Este código es del
-- estilo que usa Meet —tres bloques de letras minúsculas, `xkw-mqtd-abn`— para
-- que el enlace de una clase se pueda compartir como se comparte cualquier otro.
--
-- SOLO letras, sin dígitos: evita de raíz la confusión entre 0/O y 1/l/I, que es
-- justo lo que hace ilegible a un UUID.

create or replace function public.generate_meeting_code()
returns text
language plpgsql
volatile
as $$
declare
  letras constant text := 'abcdefghijklmnopqrstuvwxyz';
  candidato text;
  intento int := 0;
begin
  loop
    candidato := '';
    -- Patrón 3-4-3, el mismo de Meet: 10 letras = 26^10 combinaciones.
    for i in 1..3 loop candidato := candidato || substr(letras, 1 + floor(random() * 26)::int, 1); end loop;
    candidato := candidato || '-';
    for i in 1..4 loop candidato := candidato || substr(letras, 1 + floor(random() * 26)::int, 1); end loop;
    candidato := candidato || '-';
    for i in 1..3 loop candidato := candidato || substr(letras, 1 + floor(random() * 26)::int, 1); end loop;

    exit when not exists (select 1 from public.class_sessions where code = candidato);

    -- Con 26^10 el espacio es enorme, pero si alguna vez chocara 10 veces
    -- seguidas es que algo está muy mal: mejor fallar que colgarse en el loop.
    intento := intento + 1;
    if intento >= 10 then
      raise exception 'no se pudo generar un código de reunión único';
    end if;
  end loop;

  return candidato;
end;
$$;

alter table public.class_sessions add column if not exists code text;

-- Backfill de las clases que ya existen, para que TODAS tengan enlace legible y
-- no queden dos formatos conviviendo según la antigüedad de la sesión.
update public.class_sessions
   set code = public.generate_meeting_code()
 where code is null;

create unique index if not exists class_sessions_code_idx
  on public.class_sessions (code);

-- El default va DESPUÉS del backfill: así las filas nuevas lo traen solo, sin
-- depender de que quien inserte se acuerde de generarlo.
alter table public.class_sessions
  alter column code set default public.generate_meeting_code();

alter table public.class_sessions
  alter column code set not null;

comment on column public.class_sessions.code is
  'Código legible de la reunión (formato Meet: abc-defg-hij). Es lo que va en la URL de la sala; el UUID sigue existiendo pero no se expone.';
