# ADR-0004: Modelo de permisos RBAC multi-tenant por cohorte

- **Status:** proposed
- **Date:** 2026-05-27
- **Deciders:** Eduardo Daza
- **Tags:** auth, rbac, data-model, rls, security

## Contexto

Capital Academy necesita un modelo de permisos que refleje la realidad operativa: **un mismo usuario puede tener roles distintos en distintas cohortes**. Ejemplo concreto: un profesional que es docente del módulo de Tributaria en la cohorte 2S-2026, pero se matricula como alumno en el diplomado de Finanzas Corporativas de la cohorte 1S-2027.

### Estado actual

El modelo actual es plano y global:

```sql
-- enum global
create type user_role as enum ('student', 'teacher', 'ops', 'admin');

-- un solo campo role en profiles
create table public.profiles (
  id uuid primary key references auth.users(id),
  role user_role not null default 'student',
  -- ...
);
```

Esto genera tres problemas concretos:

1. **Conflicto de roles:** si un usuario es teacher en una cohorte y student en otra, hay que elegir UN role global. No hay forma de expresar ambos.
2. **Teacher sin scope:** un teacher con `role = 'teacher'` puede ver TODOS los módulos de TODAS las cohortes, porque las RLS policies actuales filtran por `role in ('ops', 'admin', 'teacher')` sin restricción de cohorte (ver `0006_classroom.sql`, policies `video_progress_staff_select`, `lesson_resources_staff_insert`, etc.).
3. **Acoplamiento frontend-DB:** los layout guards (`app/(classroom)/layout.tsx`, linea 46) hacen `profile?.role === "admin"` directamente. Cambiar el modelo requiere actualizar estos guards.

Adicionalmente:
- `enrollments` ya modela la relación student-cohorte, pero no existe equivalente para teachers.
- `program_modules.teacher_id` asigna un teacher a un modulo del PROGRAMA, no de la cohorte (global).
- Las RLS policies de `0006_classroom.sql` tratan a `teacher` como staff global.

### Restricciones

- Admin crea usuarios (no hay self-registration en MVP).
- El volumen es bajo (25-40 usuarios por cohorte, 2-3 cohortes concurrentes). No se necesitan optimizaciones extremas.
- Debe haber retrocompatibilidad: la migración no puede romper las sesiones activas ni las inscripciones existentes.

## Decisión

Implementar un **modelo híbrido** con dos niveles de permisos:

1. **`system_role`** en `profiles`: para acceso a nivel de plataforma (admin, ops). Estos roles NO están atados a ninguna cohorte.
2. **`cohort_roles`** (tabla nueva): para roles contextuales dentro de una cohorte (student, teacher, assistant). Un usuario puede tener un cohort_role distinto en cada cohorte.

### Principio rector

> **Los permisos de contenido académico se resuelven SIEMPRE contra `cohort_roles`.
> Los permisos de administración de la plataforma se resuelven contra `system_role`.**

### Schema

#### 1. Nuevo enum `system_role` y renombrado en `profiles`

```sql
-- Nuevo enum para roles de plataforma (solo admin y ops necesitan acceso global)
create type system_role as enum ('user', 'ops', 'admin');

-- Renombrar columna y migrar valores
alter table public.profiles
  add column system_role system_role not null default 'user';

-- Migrar datos existentes:
-- admin  -> admin
-- ops    -> ops
-- student, teacher -> user  (su rol académico vivirá en cohort_roles)
update public.profiles set system_role = 'admin' where role = 'admin';
update public.profiles set system_role = 'ops'   where role = 'ops';
update public.profiles set system_role = 'user'  where role not in ('admin', 'ops');
```

El campo `profiles.role` (enum `user_role`) se mantiene temporalmente para retrocompatibilidad y se elimina en una migración posterior cuando todos los consumers estén migrados.

#### 2. Tabla `cohort_roles`

```sql
create type cohort_role_kind as enum ('student', 'teacher', 'assistant');

create table public.cohort_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  role cohort_role_kind not null,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),

  unique (user_id, cohort_id, role)
);

create index cohort_roles_user_idx on public.cohort_roles(user_id);
create index cohort_roles_cohort_idx on public.cohort_roles(cohort_id);
create index cohort_roles_cohort_role_idx on public.cohort_roles(cohort_id, role);

alter table public.cohort_roles enable row level security;
```

**Nota sobre la constraint `unique (user_id, cohort_id, role)`:** se permite que un usuario tenga MULTIPLES roles en la misma cohorte. Ejemplo: un teacher que tambien es student (caso real planteado). La unicidad es sobre la combinacion triple, no sobre `(user_id, cohort_id)`.

#### 3. Funciones helper para RLS

```sql
-- Verifica si el usuario actual tiene un system_role especifico o superior
create or replace function public.is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and system_role in ('ops', 'admin')
  );
$$;

-- Verifica si el usuario actual es admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and system_role = 'admin'
  );
$$;

-- Obtiene el cohort_role del usuario en una cohorte especifica
-- Retorna NULL si no tiene ningun rol en esa cohorte
create or replace function public.get_cohort_role(p_cohort_id uuid)
returns cohort_role_kind
language sql
stable
security definer
set search_path = public
as $$
  select role from public.cohort_roles
  where user_id = auth.uid()
    and cohort_id = p_cohort_id
  limit 1;
$$;

-- Verifica si el usuario tiene CUALQUIER rol en una cohorte
create or replace function public.has_cohort_access(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cohort_roles
    where user_id = auth.uid()
      and cohort_id = p_cohort_id
  );
$$;

-- Verifica si el usuario es teacher o assistant en una cohorte especifica
create or replace function public.is_cohort_staff(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cohort_roles
    where user_id = auth.uid()
      and cohort_id = p_cohort_id
      and role in ('teacher', 'assistant')
  );
$$;
```

Todas las funciones son `security definer` con `search_path = public` para evitar ataques de schema poisoning, y `stable` porque no modifican datos (permite al planificador de Postgres optimizar).

### Modelo de autorizacion por recurso

| Recurso | Lectura | Escritura | Eliminacion |
|---------|---------|-----------|-------------|
| `profiles` | El propio usuario + platform staff | El propio usuario (nombre, avatar) + platform staff | Solo admin |
| `cohorts` | Cualquiera con `cohort_roles` en esa cohorte + platform staff | Platform staff | Admin |
| `program_modules` | Cualquiera con acceso a la cohorte + platform staff | Platform staff | Admin |
| `lessons` | Alumno inscrito en la cohorte + teacher de la cohorte + platform staff | Teacher de la cohorte (recursos) + platform staff | Platform staff |
| `video_progress` | El propio alumno + teacher de la cohorte (reportes) + platform staff | El propio alumno | -- |
| `lesson_resources` | Cualquiera con acceso a la cohorte | Teacher de la cohorte + platform staff | Platform staff |
| `enrollments` | El propio alumno + teacher de la cohorte + platform staff | Platform staff (crear/modificar) | Admin |
| `cohort_roles` | Platform staff + el propio usuario (solo su registro) | Admin (ops puede proponer, admin confirma) | Admin |

### Ejemplo: RLS policies reescritas para `video_progress`

Las policies actuales se reemplazan por versiones que usan `cohort_roles`:

```sql
-- DROP policies existentes
drop policy if exists video_progress_student_select on public.video_progress;
drop policy if exists video_progress_student_insert on public.video_progress;
drop policy if exists video_progress_student_update on public.video_progress;
drop policy if exists video_progress_staff_select on public.video_progress;

-- Alumno: lee/escribe SU propio progreso (via enrollment)
create policy video_progress_own_select on public.video_progress
  for select using (
    enrollment_id in (
      select e.id from public.enrollments e
      inner join public.cohort_roles cr
        on cr.user_id = auth.uid() and cr.cohort_id = e.cohort_id and cr.role = 'student'
      where e.student_id = auth.uid()
    )
  );

create policy video_progress_own_insert on public.video_progress
  for insert with check (
    enrollment_id in (
      select e.id from public.enrollments e
      where e.student_id = auth.uid()
    )
  );

create policy video_progress_own_update on public.video_progress
  for update using (
    enrollment_id in (
      select e.id from public.enrollments e
      where e.student_id = auth.uid()
    )
  );

-- Teacher/assistant de la cohorte: lee progreso de SUS alumnos (reportes)
create policy video_progress_cohort_staff_select on public.video_progress
  for select using (
    enrollment_id in (
      select e.id from public.enrollments e
      where public.is_cohort_staff(e.cohort_id)
    )
  );

-- Platform staff (ops/admin): lee todo
create policy video_progress_platform_staff_select on public.video_progress
  for select using (public.is_platform_staff());
```

### Ejemplo: RLS policies reescritas para `lesson_resources`

```sql
drop policy if exists lesson_resources_authenticated_select on public.lesson_resources;
drop policy if exists lesson_resources_staff_insert on public.lesson_resources;
drop policy if exists lesson_resources_staff_update on public.lesson_resources;
drop policy if exists lesson_resources_staff_delete on public.lesson_resources;

-- Lectura: cualquiera con acceso a la cohorte que contiene esa leccion
create policy lesson_resources_cohort_select on public.lesson_resources
  for select using (
    exists (
      select 1 from public.lessons l
      inner join public.program_modules pm on pm.id = l.module_id
      inner join public.cohorts c on c.program_id = pm.program_id
      where l.id = lesson_resources.lesson_id
        and public.has_cohort_access(c.id)
    )
    or public.is_platform_staff()
  );

-- Escritura: teacher de la cohorte correspondiente o platform staff
create policy lesson_resources_write on public.lesson_resources
  for insert with check (
    exists (
      select 1 from public.lessons l
      inner join public.program_modules pm on pm.id = l.module_id
      inner join public.cohorts c on c.program_id = pm.program_id
      where l.id = lesson_resources.lesson_id
        and public.is_cohort_staff(c.id)
    )
    or public.is_platform_staff()
  );

-- Eliminacion: solo platform staff
create policy lesson_resources_delete on public.lesson_resources
  for delete using (public.is_platform_staff());
```

### RLS para la tabla `cohort_roles`

```sql
-- Solo platform staff puede ver todos los roles
create policy cohort_roles_staff_select on public.cohort_roles
  for select using (
    public.is_platform_staff()
    or user_id = auth.uid()  -- cada usuario ve sus propios roles
  );

-- Solo admin puede crear/modificar roles
create policy cohort_roles_admin_insert on public.cohort_roles
  for insert with check (public.is_admin());

create policy cohort_roles_admin_update on public.cohort_roles
  for update using (public.is_admin());

create policy cohort_roles_admin_delete on public.cohort_roles
  for delete using (public.is_admin());
```

## Opciones consideradas

### Opcion A — Modelo hibrido: `system_role` + `cohort_roles` (elegida)

Dos niveles: plataforma (admin/ops es global) y cohorte (student/teacher es contextual).

- **Pros:**
  - Modela la realidad exacta: un usuario puede ser teacher en cohorte A y student en cohorte B.
  - `system_role` es un shortcut eficiente para admin/ops que necesitan acceso a TODO.
  - Las queries RLS son simples: primero se verifica `is_platform_staff()`, luego se verifica `cohort_roles`.
  - `enrollments` se mantiene intacta (sigue siendo la tabla de matricula con metadata de pago, estado, etc.). `cohort_roles` es complementaria, no la reemplaza.
  - Escalable: agregar nuevos roles (assistant, tutor, mentor) es un `alter type cohort_role_kind add value`.

- **Contras:**
  - Duplicacion conceptual: un student tiene registro en `enrollments` Y en `cohort_roles`. Ambas tablas expresan "este usuario esta en esta cohorte".
  - Hay que mantener consistencia entre ambas (mitigacion: trigger o check constraint).

### Opcion B — Solo `cohort_roles`, sin `system_role`

Todos los roles viven en `cohort_roles`. Admin/ops tendrian un "cohort virtual" que representa la plataforma.

- **Pros:**
  - Un solo modelo para todo.
  - No hay duplicacion.

- **Contras:**
  - Admin/ops NO operan dentro de una cohorte. Forzar un "cohort virtual" es una abstraccion que no refleja la realidad y contamina las queries.
  - Cada query RLS para platform staff tendria que buscar el cohort virtual: mas complejo, mas lento.
  - Cuando admin necesita ver datos cross-cohorte, tendria que tener un registro en CADA cohorte. Insostenible.

### Opcion C — JSONB de roles en `profiles`

Un campo `roles jsonb` en profiles tipo `{"cohort-uuid-1": ["teacher"], "cohort-uuid-2": ["student"]}`.

- **Pros:**
  - Un solo campo, no tablas extra.

- **Contras:**
  - No se puede usar en RLS policies de forma eficiente (Postgres no puede indexar paths JSONB arbitrarios para joins con `auth.uid()`).
  - No hay integridad referencial (si se borra una cohorte, el JSON queda huerfano).
  - No hay auditoria (quien asigno el rol, cuando).
  - Antipattern clasico de meter datos relacionales en JSON.

## Consecuencias

### Positivas

- **Resuelve el caso de uso central:** un usuario puede ser teacher en cohorte A y student en cohorte B sin conflicto.
- **Teacher ve solo lo suyo:** las RLS policies restringen el teacher al contenido de SU cohorte. Se elimina el acceso global accidental que tenia el modelo anterior.
- **Queries claras:** `is_platform_staff()` y `is_cohort_staff(cohort_id)` encapsulan la logica. El codigo de aplicacion no necesita conocer la estructura interna de permisos.
- **Auditoria de asignacion:** `cohort_roles.granted_by` y `granted_at` registran quien y cuando asigno cada rol.
- **Extensible:** agregar roles como `assistant` o `tutor` es un cambio de enum, no de arquitectura.

### Negativas

- **Dualidad `enrollments` / `cohort_roles`:** para students, ambas tablas expresan "pertenece a esta cohorte". Hay que mantenerlas sincronizadas. Mitigacion: un trigger que cree automaticamente el `cohort_role` de student al insertar un enrollment.
- **Migracion de RLS policies:** hay que reescribir TODAS las policies existentes. El riesgo principal es dejar una policy vieja que use `profiles.role` y otorgue acceso indebido.
- **Mas joins en queries RLS:** las policies ahora hacen join con `cohort_roles` en vez de leer un campo plano de `profiles`. Para 25-40 usuarios por cohorte, el impacto es imperceptible.

### Riesgos

- **Inconsistencia `enrollments` ↔ `cohort_roles`:** si se crea un enrollment sin crear el cohort_role correspondiente, el alumno tiene matricula pero no puede acceder al contenido. **Mitigacion:** trigger + constraint + test automatizado.
- **Policy olvidada:** si queda una RLS policy que use `profiles.role = 'teacher'` sin actualizar, un teacher podria mantener acceso global. **Mitigacion:** la migracion debe hacer `DROP POLICY IF EXISTS` explicito para cada policy existente antes de crear las nuevas.
- **Eliminacion del campo `profiles.role`:** se debe hacer en una migracion separada DESPUES de verificar que ningun consumer (frontend, API routes, edge functions) lo use. No hacerlo en la misma migracion.

## Notas de implementacion

### Orden de migracion

La migracion se ejecuta en pasos secuenciales dentro de un solo archivo `db/migrations/0007_rbac_cohort_roles.sql`:

```
Paso 1: Crear tipo system_role, agregar columna profiles.system_role, migrar datos.
Paso 2: Crear tipo cohort_role_kind, crear tabla cohort_roles.
Paso 3: Migrar datos existentes:
        - Cada enrollment (student_id, cohort_id) -> cohort_roles (user_id, cohort_id, 'student').
        - Cada program_modules.teacher_id -> cohort_roles para CADA cohorte activa de ese programa.
Paso 4: Crear funciones helper (is_platform_staff, is_admin, get_cohort_role, has_cohort_access, is_cohort_staff).
Paso 5: DROP policies existentes + crear policies nuevas.
Paso 6: Crear trigger de sincronizacion enrollments -> cohort_roles.
```

### Trigger de sincronizacion

```sql
create or replace function public.tg_sync_enrollment_to_cohort_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.cohort_roles (user_id, cohort_id, role)
    values (NEW.student_id, NEW.cohort_id, 'student')
    on conflict (user_id, cohort_id, role) do nothing;
  end if;

  if TG_OP = 'DELETE' then
    delete from public.cohort_roles
    where user_id = OLD.student_id
      and cohort_id = OLD.cohort_id
      and role = 'student';
  end if;

  return coalesce(NEW, OLD);
end;
$$;

create trigger trg_enrollment_sync_cohort_role
  after insert or delete on public.enrollments
  for each row execute function public.tg_sync_enrollment_to_cohort_role();
```

### Cambios requeridos en el frontend

1. **`app/(classroom)/layout.tsx`:** cambiar `profile?.role === "admin"` por una llamada que verifique `system_role` o un RPC `is_platform_staff()`.
2. **Queries de classroom:** las queries que usen `.eq("role", "teacher")` deben cambiarse por joins con `cohort_roles` o usar las funciones RPC.
3. **Tipos TypeScript:** regenerar `lib/supabase/types.ts` despues de la migracion para que refleje `system_role`, `cohort_roles`, y los nuevos enums.

### Ejemplo de query en frontend (post-migracion)

```typescript
// Verificar si el usuario es teacher en una cohorte especifica
const { data: isTeacher } = await supabase
  .rpc('is_cohort_staff', { p_cohort_id: cohortId });

// Obtener el rol del usuario en una cohorte
const { data: role } = await supabase
  .rpc('get_cohort_role', { p_cohort_id: cohortId });

// Verificar si es platform staff (admin/ops)
const { data: isStaff } = await supabase
  .rpc('is_platform_staff');
```

### Sobre `program_modules.teacher_id`

Este campo se mantiene como **asignacion por defecto** del teacher a un modulo del programa. Cuando se crea una nueva cohorte para ese programa, el sistema puede pre-poblar los `cohort_roles` de teacher basandose en este campo. Sin embargo, la asignacion efectiva de permisos para una cohorte especifica siempre se resuelve via `cohort_roles`, no via `teacher_id`. Esto permite que un modulo tenga un teacher distinto en cohortes diferentes del mismo programa.

## Referencias

- Schema actual: `db/migrations/0001_init_core.sql` (profiles, enrollments, cohorts).
- RLS policies actuales: `db/migrations/0006_classroom.sql`.
- Layout guard actual: `app/(classroom)/layout.tsx:46`.
- [ADR-0002](0002-arquitectura-modulo-classroom.md) — Arquitectura del modulo Classroom.
- [ADR-0003](0003-tracking-progreso-video.md) — Tracking de progreso de video.
