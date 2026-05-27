# PRD — Roles, Permisos y Control de Acceso

> Product Requirements Document para el sistema de RBAC multi-tenant de Capital Academy.

- **Autor:** Equipo Capital Academy
- **Fecha:** 2026-05-27
- **Estado:** Draft
- **Épicas relacionadas:** E1 (Auth), transversal a todas las épicas
- **Prerequisitos:** [PRD-classroom](PRD-classroom.md), [ROADMAP](ROADMAP.md)

---

## 1. Problema

Capital Academy tiene cuatro roles definidos en el schema (`student`, `teacher`, `ops`, `admin`), pero el control de acceso actual es rudimentario:

1. **Rol global en `profiles.role`:** un usuario tiene UN rol fijo. No puede ser profesor en una cohorte y alumno en otra.
2. **Guards manuales por ruta:** cada layout y API route reimplementa la verificación de rol con `if (!["ops", "admin"].includes(profile.role))`. No hay abstracción centralizada.
3. **Sin scoping por cohorte para teachers:** un profesor con acceso de staff puede ver el progreso de TODOS los alumnos de TODAS las cohortes, cuando deberia ver solo los de sus modulos.
4. **Sin UI de gestion de usuarios:** el admin crea usuarios directamente en Supabase Dashboard. No hay flujo interno para crear, editar o asignar roles.

A medida que se agregan modulos (evaluaciones, asistencia, tareas, certificaciones), la complejidad de permisos crece exponencialmente. Sin un sistema centralizado, cada modulo reinventara su propia logica de acceso.

## 2. Objetivo

Implementar un sistema de control de acceso basado en roles por cohorte (multi-tenant RBAC) que:

1. Permita que un mismo usuario tenga roles distintos en cohortes distintas.
2. Centralice la logica de autorizacion en helpers y middleware reutilizables.
3. Provea una UI para que el admin gestione usuarios y asignaciones.
4. Escale a todos los modulos actuales y futuros sin reescribir permisos por cada uno.

## 3. No-scope (MVP)

- Permisos granulares a nivel de accion individual (ej. "puede editar lecciones" vs "puede crear lecciones"). En MVP los permisos son por rol, no configurables por accion.
- Self-registration de usuarios. El admin crea todas las cuentas.
- Roles personalizados mas alla de los cuatro definidos.
- Jerarquia formal de roles (admin hereda de ops, ops hereda de teacher). Se implementa como logica explicita, no como herencia generica.
- OAuth / SSO / Google Sign-In (backlog V1.5).
- Audit log de cambios de permisos (cubierto por E15, Sprint 9).

---

## 4. Roles y definiciones

### 4.1 Taxonomia de roles

| Rol | Scope | Descripcion |
|---|---|---|
| **admin** | Global | Acceso total a la plataforma. Crea usuarios, programas, cohortes. Configura parametros del sistema. |
| **ops** | Global | Operaciones del dia a dia. Gestiona contenido, matriculas, reportes. No puede configurar el sistema ni eliminar datos criticos. |
| **teacher** | Por cohorte + modulo | Ve y gestiona los modulos que le fueron asignados dentro de una cohorte. Ve el progreso de los alumnos de esos modulos. Califica. |
| **student** | Por cohorte | Consume contenido, ve su progreso, entrega tareas, rinde evaluaciones. Solo ve su propia cohorte. |

### 4.2 Regla fundamental: rol por cohorte

Un usuario puede tener multiples asignaciones:

```
Maria Lopez:
  - Cohorte "Diplomado 4G": teacher (Modulo 1, Modulo 3)
  - Cohorte "Diplomado 5G": student
  - Cohorte "Liderazgo 1E": teacher (Modulo 2)
```

Los roles `admin` y `ops` son GLOBALES (no se asignan por cohorte). Los roles `teacher` y `student` son POR COHORTE.

---

## 5. Matriz de permisos

### 5.1 Modulo: Classroom (VOD)

| Accion | student | teacher | ops | admin |
|---|:---:|:---:|:---:|:---:|
| Ver lecciones de su cohorte | Si | Si (sus modulos) | Si (todas) | Si (todas) |
| Reproducir video | Si | Si | Si | Si |
| Ver su propio progreso de video | Si | - | - | - |
| Ver progreso de alumnos de su modulo | - | Si | - | - |
| Ver progreso de alumnos de cualquier modulo | - | - | Si | Si |
| Subir video a leccion | - | - | Si | Si |
| Reemplazar video de leccion | - | - | Si | Si |
| Gestionar recursos (crear/editar) | - | Si (sus modulos) | Si | Si |
| Eliminar recursos | - | - | Si | Si |

### 5.2 Modulo: Admin Panel

| Accion | student | teacher | ops | admin |
|---|:---:|:---:|:---:|:---:|
| Acceder al panel admin | - | - | Si | Si |
| CRUD programas | - | - | Leer | CRUD |
| CRUD cohortes | - | - | Leer + Editar | CRUD |
| CRUD modulos | - | - | CRUD | CRUD |
| CRUD lecciones | - | - | CRUD | CRUD |
| Ver reportes de progreso | - | - | Si | Si |
| Exportar reportes | - | - | Si | Si |

### 5.3 Modulo: Gestion de usuarios (NUEVO)

| Accion | student | teacher | ops | admin |
|---|:---:|:---:|:---:|:---:|
| Ver lista de usuarios | - | - | Si (solo su alcance) | Si |
| Crear usuario | - | - | - | Si |
| Editar perfil de usuario | - | - | - | Si |
| Desactivar usuario | - | - | - | Si |
| Asignar rol a cohorte | - | - | - | Si |
| Revocar rol de cohorte | - | - | - | Si |
| Matricular alumno (enrollment) | - | - | Si | Si |
| Ver alumnos de una cohorte | - | Si (sus modulos) | Si | Si |

### 5.4 Modulo: Pagos

| Accion | student | teacher | ops | admin |
|---|:---:|:---:|:---:|:---:|
| Realizar pago (checkout publico) | Publico | Publico | Publico | Publico |
| Ver transacciones | - | - | Si | Si |
| Crear/editar cupones | - | - | - | Si |
| Ver reportes de ingresos | - | - | Si | Si |

### 5.5 Modulo: Evaluaciones (futuro)

| Accion | student | teacher | ops | admin |
|---|:---:|:---:|:---:|:---:|
| Rendir evaluacion | Si | - | - | - |
| Ver sus resultados | Si | - | - | - |
| Crear evaluacion | - | Si (sus modulos) | Si | Si |
| Calificar evaluacion | - | Si (sus modulos) | Si | Si |
| Ver resultados de todos los alumnos | - | Si (sus modulos) | Si | Si |
| Configurar ponderaciones | - | - | - | Si |

### 5.6 Modulo: Asistencia QR (futuro)

| Accion | student | teacher | ops | admin |
|---|:---:|:---:|:---:|:---:|
| Marcar asistencia (scan QR) | Si | - | - | - |
| Ver su % de asistencia | Si | - | - | - |
| Generar QR de sesion | - | Si (sus sesiones) | Si | Si |
| Corregir asistencia | - | Si (sus sesiones) | Si | Si |
| Ver reporte de asistencia por cohorte | - | Si (sus modulos) | Si | Si |

### 5.7 Modulo: Tareas/Assignments (futuro)

| Accion | student | teacher | ops | admin |
|---|:---:|:---:|:---:|:---:|
| Ver tareas asignadas | Si | - | - | - |
| Entregar tarea | Si | - | - | - |
| Crear tarea | - | Si (sus modulos) | Si | Si |
| Revisar/aprobar tarea | - | Si (sus modulos) | Si | Si |
| Ver dashboard de cumplimiento SLA | - | - | Si | Si |

### 5.8 Modulo: Certificaciones (futuro)

| Accion | student | teacher | ops | admin |
|---|:---:|:---:|:---:|:---:|
| Ver sus certificados | Si | - | - | - |
| Descargar certificado | Si | - | - | - |
| Aprobar elegibilidad | - | - | Si | Si |
| Generar certificados | - | - | Si | Si |
| Configurar criterios de certificacion | - | - | - | Si |

### 5.9 Modulo: Notificaciones (futuro)

| Accion | student | teacher | ops | admin |
|---|:---:|:---:|:---:|:---:|
| Recibir notificaciones | Si | Si | Si | Si |
| Marcar como leida | Si | Si | Si | Si |
| Enviar notificacion masiva a cohorte | - | - | Si | Si |
| Configurar canales de notificacion | - | - | - | Si |

---

## 6. User Stories

### 6.1 Admin

**US-R01: Crear un usuario nuevo**
> Como admin, quiero crear una cuenta de usuario en la plataforma para que pueda acceder con sus credenciales.

Criterios de aceptacion:
- Ingreso email, nombre completo, telefono (opcional), y una contrasena temporal.
- El sistema crea el usuario en Supabase Auth + el registro en `profiles`.
- El usuario recibe un email de bienvenida con instrucciones para cambiar su contrasena.
- Si el email ya existe, el sistema muestra un error claro.
- El usuario queda creado sin rol por cohorte hasta que se le asigne uno.

**US-R02: Asignar un rol a un usuario en una cohorte**
> Como admin, quiero asignar a un usuario el rol de teacher o student en una cohorte especifica.

Criterios de aceptacion:
- Selecciono un usuario existente, una cohorte, y un rol (`teacher` o `student`).
- Si el rol es `teacher`, tambien selecciono uno o mas modulos del programa de esa cohorte.
- Si el usuario ya tiene una asignacion en esa cohorte con el mismo rol, el sistema muestra un error.
- Un usuario PUEDE tener el rol de `teacher` y `student` en la misma cohorte (edge case valido).
- La asignacion se guarda en la tabla `cohort_roles`.
- Para `student`, tambien se crea o activa el `enrollment` correspondiente.

**US-R03: Ver y gestionar todos los usuarios**
> Como admin, quiero ver una lista de todos los usuarios con sus roles activos para gestionar el acceso.

Criterios de aceptacion:
- Tabla paginada con: nombre, email, roles activos (badges por cohorte), fecha de creacion.
- Barra de busqueda por nombre o email.
- Filtro por rol global (admin/ops) y por cohorte.
- Click en un usuario abre su ficha con todas sus asignaciones.

**US-R04: Promover un usuario a ops o admin**
> Como admin, quiero asignar el rol global de ops o admin a un usuario.

Criterios de aceptacion:
- Solo un admin puede hacer esto.
- El rol global se guarda en `profiles.role` (se mantiene el campo actual para compatibilidad).
- Un usuario con rol global `admin` u `ops` tiene acceso al panel admin sin necesidad de asignacion por cohorte.
- Se muestra una confirmacion antes de aplicar el cambio.

**US-R05: Revocar un rol de una cohorte**
> Como admin, quiero remover el acceso de un usuario a una cohorte especifica.

Criterios de aceptacion:
- Selecciono la asignacion a revocar.
- El sistema cambia el estado de la asignacion a `revoked`.
- Si era un `student`, el enrollment pasa a `suspended`.
- Si era un `teacher`, pierde acceso a los modulos de esa cohorte.
- El usuario pierde acceso inmediatamente (sin cache de permisos).

### 6.2 Ops

**US-R06: Matricular alumnos en una cohorte**
> Como ops, quiero matricular uno o mas alumnos en una cohorte existente.

Criterios de aceptacion:
- Puedo matricular de a uno (seleccionar usuario + cohorte).
- Puedo matricular por CSV (columnas: email, nombre).
- Si el usuario no existe, el sistema lo crea con contrasena temporal y envia email de bienvenida.
- Se crea el enrollment + la asignacion de rol `student` en `cohort_roles`.
- Si el usuario ya esta matriculado, el sistema muestra advertencia y omite el duplicado.

**US-R07: Ver alumnos de una cohorte con sus roles**
> Como ops, quiero ver la lista de alumnos y profesores de una cohorte para verificar que las asignaciones son correctas.

Criterios de aceptacion:
- Vista por cohorte con dos tabs: Alumnos y Profesores.
- Alumnos: nombre, email, estado de enrollment, fecha de matricula.
- Profesores: nombre, email, modulos asignados.
- Puedo filtrar por estado de enrollment.

### 6.3 Teacher

**US-R08: Ver mi contexto de cohorte**
> Como teacher, quiero ver las cohortes donde estoy asignado y los modulos que tengo a cargo.

Criterios de aceptacion:
- Al hacer login, veo mis cohortes activas como teacher.
- En cada cohorte, veo los modulos que tengo asignados con su estado.
- Si tengo mas de una cohorte, puedo cambiar de contexto desde un selector.

**US-R09: Ver el progreso de MIS alumnos**
> Como teacher, quiero ver el progreso de video de los alumnos en los modulos que tengo a cargo.

Criterios de aceptacion:
- Solo veo alumnos de las cohortes donde estoy asignado como teacher.
- Solo veo el progreso de los modulos que me corresponden.
- Tabla con: alumno, % de avance por modulo, ultima actividad.
- No veo el progreso de modulos de otros profesores.

### 6.4 Student

**US-R10: Acceder a mi cohorte**
> Como student, quiero ver el contenido de la cohorte donde estoy matriculado.

Criterios de aceptacion:
- Al hacer login, el sistema me lleva al classroom de mi cohorte activa.
- Si tengo multiples cohortes activas, veo un selector.
- Solo veo contenido (modulos, lecciones, recursos) de mis cohortes.
- No veo contenido de cohortes donde no estoy matriculado.

**US-R11: Cambiar de cohorte**
> Como student con multiples matriculas, quiero cambiar entre mis cohortes.

Criterios de aceptacion:
- Selector visible en el sidebar cuando tengo mas de una cohorte activa.
- Cada cohorte muestra: nombre del programa, nombre de la cohorte, mi progreso general.
- El cambio es inmediato, sin recarga de pagina completa.

---

## 7. Modelo de datos

### 7.1 Cambios al schema

#### Nueva tabla: `cohort_roles`

Esta tabla es el CORE del sistema multi-tenant. Reemplaza la dependencia de `profiles.role` para teacher y student.

```sql
create type cohort_role_status as enum ('active', 'revoked');

create table public.cohort_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  role user_role not null,  -- reutiliza el enum existente, pero aqui solo 'student' o 'teacher'
  status cohort_role_status not null default 'active',
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  
  -- Un usuario puede tener multiples roles en la misma cohorte (teacher + student)
  -- pero no puede tener el mismo rol duplicado
  unique (user_id, cohort_id, role)
);

create index cohort_roles_user_idx on public.cohort_roles(user_id);
create index cohort_roles_cohort_idx on public.cohort_roles(cohort_id);
create index cohort_roles_active_idx on public.cohort_roles(user_id, status)
  where status = 'active';
```

#### Nueva tabla: `teacher_module_assignments`

Conecta un teacher con los modulos que tiene a cargo dentro de una cohorte.

```sql
create table public.teacher_module_assignments (
  id uuid primary key default gen_random_uuid(),
  cohort_role_id uuid not null references public.cohort_roles(id) on delete cascade,
  module_id uuid not null references public.program_modules(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  
  unique (cohort_role_id, module_id)
);

create index teacher_module_assignments_module_idx
  on public.teacher_module_assignments(module_id);
```

#### Campo existente: `profiles.role`

Se MANTIENE `profiles.role` como "rol global" para admin y ops. La logica de resolucion es:

```
fn resolveEffectiveRole(userId, cohortId):
  if profiles.role IN ('admin', 'ops'):
    return profiles.role  // Global, sin scoping por cohorte
  
  return cohort_roles WHERE user_id = userId 
    AND cohort_id = cohortId 
    AND status = 'active'
```

#### Relacion con `enrollments`

La tabla `enrollments` se mantiene como esta. Cuando se asigna el rol `student` via `cohort_roles`, el sistema tambien crea el enrollment correspondiente. `enrollments` sigue siendo la tabla de referencia para datos academicos (progreso, notas, asistencia). `cohort_roles` gestiona ACCESO, `enrollments` gestiona DATOS ACADEMICOS.

```
cohort_roles (role = 'student')  1:1  enrollments
                                      (cohort_id + student_id)
```

### 7.2 Diagrama de relaciones

```
profiles
  |
  +-- cohort_roles (user_id)
  |     |
  |     +-- teacher_module_assignments (cohort_role_id)
  |     |     |
  |     |     +-- program_modules (module_id)
  |     |
  |     +-- cohorts (cohort_id)
  |           |
  |           +-- programs (program_id)
  |
  +-- enrollments (student_id)
        |
        +-- cohorts (cohort_id)
        +-- video_progress (enrollment_id)
```

---

## 8. Reglas de acceso por ruta

### 8.1 Paginas (App Router)

| Ruta | Roles permitidos | Regla adicional |
|---|---|---|
| `/login` | Publico | Redirige a home si ya autenticado |
| `/pago/**` | Publico | Checkout de pago |
| `/classroom` | Autenticado | Redirige a la cohorte activa del usuario |
| `/classroom/[cohortId]` | student, teacher, ops, admin | student/teacher: solo si tiene `cohort_roles` activo en esa cohorte. ops/admin: todas. |
| `/classroom/[cohortId]/[moduleId]` | student, teacher, ops, admin | teacher: solo si tiene ese modulo asignado. student: solo si esta en esa cohorte. |
| `/classroom/[cohortId]/[moduleId]/[lessonId]` | student, teacher, ops, admin | Mismas reglas que moduleId. |
| `/admin` | ops, admin | Redirige a `/admin/dashboard` |
| `/admin/dashboard` | ops, admin | - |
| `/admin/lessons/**` | ops, admin | - |
| `/admin/resources/**` | ops, admin, teacher | teacher: solo sus modulos |
| `/admin/progress/**` | ops, admin | - |
| `/admin/users` (NUEVO) | admin | - |
| `/admin/users/[userId]` (NUEVO) | admin | - |
| `/admin/enrollments` (NUEVO) | ops, admin | - |
| `/teacher` (NUEVO) | teacher | Redirige a la cohorte activa como teacher |
| `/teacher/[cohortId]` (NUEVO) | teacher | Solo si tiene `cohort_roles` activo |
| `/teacher/[cohortId]/progress` (NUEVO) | teacher | Solo ve sus modulos |

### 8.2 API Endpoints

| Endpoint | Metodo | Roles permitidos | Regla adicional |
|---|---|---|---|
| `POST /api/auth/signout` | POST | Autenticado | - |
| `POST /api/admin/mux/upload` | POST | ops, admin | - |
| `POST /api/admin/resources` | POST | ops, admin, teacher | teacher: solo para sus modulos |
| `DELETE /api/admin/resources` | DELETE | ops, admin | - |
| `GET /api/admin/progress` | GET | ops, admin | - |
| `PATCH /api/classroom/progress` | PATCH | student | Solo su propio enrollment |
| `POST /api/pago/checkout` | POST | Publico | - |
| `POST /api/pago/cupon` | POST | Publico | - |
| `POST /api/leads` | POST | Publico | - |
| `POST /api/webhooks/mux` | POST | Mux (signature) | Verificacion de firma, no auth de usuario |
| `POST /api/flow/webhook` | POST | Flow (IP + firma) | - |
| `POST /api/admin/users` (NUEVO) | POST | admin | Crear usuario |
| `PATCH /api/admin/users/[userId]` (NUEVO) | PATCH | admin | Editar usuario |
| `GET /api/admin/users` (NUEVO) | GET | admin | Listar usuarios |
| `POST /api/admin/cohort-roles` (NUEVO) | POST | admin | Asignar rol |
| `DELETE /api/admin/cohort-roles/[id]` (NUEVO) | DELETE | admin | Revocar rol |
| `POST /api/admin/enrollments` (NUEVO) | POST | ops, admin | Matricular |
| `POST /api/admin/enrollments/bulk` (NUEVO) | POST | ops, admin | Matricula masiva CSV |
| `GET /api/teacher/[cohortId]/progress` (NUEVO) | GET | teacher | Solo modulos asignados |

---

## 9. Reglas de visibilidad de datos (RLS)

### 9.1 Principios

1. **student** ve solo datos de las cohortes donde tiene enrollment activo.
2. **teacher** ve datos de las cohortes donde tiene `cohort_roles` activo, filtrado a sus modulos.
3. **ops** y **admin** ven todo (via `profiles.role` global).
4. Las RLS policies se evaluan en orden: primero global staff, luego per-cohort.

### 9.2 Helpers SQL

```sql
-- Verifica si el usuario es staff global
create or replace function public.is_global_staff()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role in ('admin', 'ops')
  );
$$;

-- Verifica si el usuario es admin
create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'admin'
  );
$$;

-- Verifica si el usuario tiene un rol activo en una cohorte
create or replace function public.has_cohort_role(p_cohort_id uuid, p_role user_role)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.cohort_roles
    where user_id = auth.uid()
    and cohort_id = p_cohort_id
    and role = p_role
    and status = 'active'
  );
$$;

-- Retorna los module_ids asignados a un teacher en una cohorte
create or replace function public.teacher_module_ids(p_cohort_id uuid)
returns setof uuid language sql stable security definer as $$
  select tma.module_id
  from public.teacher_module_assignments tma
  join public.cohort_roles cr on cr.id = tma.cohort_role_id
  where cr.user_id = auth.uid()
  and cr.cohort_id = p_cohort_id
  and cr.role = 'teacher'
  and cr.status = 'active';
$$;
```

### 9.3 Ejemplo de RLS para `video_progress` (actualizado)

```sql
-- Reemplaza las policies actuales

-- Staff global ve todo
create policy video_progress_staff_all on public.video_progress
  for all using (public.is_global_staff());

-- Teacher ve el progreso de alumnos en sus modulos
create policy video_progress_teacher_select on public.video_progress
  for select using (
    exists (
      select 1
      from public.lessons l
      join public.cohort_roles cr on cr.user_id = auth.uid()
        and cr.role = 'teacher'
        and cr.status = 'active'
      join public.teacher_module_assignments tma on tma.cohort_role_id = cr.id
        and tma.module_id = l.module_id
      where l.id = video_progress.lesson_id
    )
  );

-- Student ve y escribe solo su propio progreso (sin cambios)
create policy video_progress_student_select on public.video_progress
  for select using (
    enrollment_id in (
      select id from public.enrollments where student_id = auth.uid()
    )
  );
```

---

## 10. Helpers de autorizacion (Application Layer)

### 10.1 Server-side helper centralizado

Reemplaza los guards manuales que hoy se repiten en cada layout y API route.

```typescript
// lib/auth/authorize.ts

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { UserRole } from "./roles";

interface AuthContext {
  userId: string;
  email: string;
  globalRole: UserRole;
  profile: { full_name: string; role: UserRole };
}

interface CohortAuthContext extends AuthContext {
  cohortId: string;
  cohortRoles: UserRole[];           // roles del usuario en ESA cohorte
  teacherModuleIds: string[];        // modulos asignados si es teacher
}

/**
 * Verifica autenticacion y retorna contexto basico.
 * Redirige a /login si no esta autenticado.
 */
export async function requireAuth(): Promise<AuthContext> { /* ... */ }

/**
 * Verifica que el usuario tenga al menos uno de los roles globales indicados.
 * Redirige a /classroom si no cumple.
 */
export async function requireGlobalRole(
  ...roles: UserRole[]
): Promise<AuthContext> { /* ... */ }

/**
 * Verifica acceso a una cohorte especifica.
 * Retorna los roles del usuario en esa cohorte + modulos si es teacher.
 */
export async function requireCohortAccess(
  cohortId: string,
  ...allowedRoles: UserRole[]
): Promise<CohortAuthContext> { /* ... */ }

/**
 * Verifica que el usuario (teacher) tenga acceso a un modulo especifico.
 */
export async function requireModuleAccess(
  cohortId: string,
  moduleId: string
): Promise<CohortAuthContext> { /* ... */ }
```

### 10.2 API route helper

```typescript
// lib/auth/api-authorize.ts

import { NextResponse } from "next/server";

/**
 * Wrapper para API routes que necesitan autorizacion.
 * Retorna 401/403 con JSON en vez de redirect.
 */
export async function withAuth<T>(
  handler: (ctx: AuthContext) => Promise<NextResponse<T>>
): Promise<NextResponse<T>> { /* ... */ }

export async function withRole<T>(
  roles: UserRole[],
  handler: (ctx: AuthContext) => Promise<NextResponse<T>>
): Promise<NextResponse<T>> { /* ... */ }

export async function withCohortAccess<T>(
  cohortId: string,
  roles: UserRole[],
  handler: (ctx: CohortAuthContext) => Promise<NextResponse<T>>
): Promise<NextResponse<T>> { /* ... */ }
```

### 10.3 Uso en layouts (antes vs despues)

**Antes (actual):**
```typescript
// app/(admin)/layout.tsx
const { data: profile } = await supabase
  .from("profiles")
  .select("full_name, role")
  .eq("id", user.id)
  .single();

if (!profile || !["ops", "admin"].includes(profile.role)) {
  redirect("/classroom");
}
```

**Despues:**
```typescript
// app/(admin)/layout.tsx
const ctx = await requireGlobalRole("ops", "admin");
```

---

## 11. Flujos de gestion de usuarios

### 11.1 Flujo: Crear usuario

```
Admin → /admin/users → Click "Nuevo usuario"
  → Formulario: email*, nombre completo*, telefono, contrasena temporal*
  → Click "Crear"
  → POST /api/admin/users
    → Supabase Admin: auth.admin.createUser({ email, password, email_confirm: true })
    → INSERT profiles (id, email, full_name, phone, role: 'student')
    → Enviar email de bienvenida (Resend)
  → Redirige a /admin/users/[userId] para asignar roles
```

### 11.2 Flujo: Asignar rol a cohorte

```
Admin → /admin/users/[userId] → Seccion "Roles por cohorte"
  → Click "Agregar rol"
  → Modal:
    - Select: cohorte (filtrada por cohortes activas/planned)
    - Select: rol (student / teacher)
    - Si rol == teacher: multi-select de modulos del programa
  → Click "Asignar"
  → POST /api/admin/cohort-roles
    → INSERT cohort_roles
    → Si teacher: INSERT teacher_module_assignments (uno por modulo)
    → Si student: UPSERT enrollments (status: 'active')
  → La tabla de roles se actualiza en la ficha del usuario
```

### 11.3 Flujo: Matricula masiva (ops)

```
Ops → /admin/enrollments → Click "Matricula masiva"
  → Upload CSV (columnas: email, nombre_completo)
  → Select: cohorte destino
  → Preview: tabla con los alumnos a matricular
    - Fila verde: usuario nuevo (se creara)
    - Fila azul: usuario existente (se asignara)
    - Fila roja: error (email duplicado en cohorte, formato invalido)
  → Click "Confirmar matricula"
  → POST /api/admin/enrollments/bulk
    → Para cada fila:
      → Si usuario no existe: crear en Supabase Auth + profiles
      → INSERT cohort_roles (role: 'student')
      → UPSERT enrollments
    → Enviar emails de bienvenida en batch (Resend)
  → Resumen: X creados, Y asignados, Z errores
```

### 11.4 Flujo: Cambio de contexto (usuario multi-rol)

```
Usuario con multiples cohortes → Login
  → El sistema detecta sus cohort_roles activos
  → Si tiene 1 cohorte: redirige directamente
  → Si tiene multiples: muestra selector de cohorte
    - Card por cohorte con: programa, nombre cohorte, rol(es), progreso
  → Selecciona una cohorte
  → Se guarda en cookie/localStorage como "cohorte activa"
  → Navega a /classroom/[cohortId] (si student) o /teacher/[cohortId] (si teacher)
  → El selector de cohorte queda visible en el sidebar para cambiar
```

---

## 12. Wireframes (descripcion textual)

### 12.1 Admin — Lista de usuarios (`/admin/users`)

```
┌─────────────────────────────────────────────────────────────┐
│  Capital Academy Admin       [Avatar] Admin                 │
├──────────┬──────────────────────────────────────────────────┤
│ Sidebar  │  Usuarios                        [+ Nuevo usuario] │
│          │                                                     │
│ Dashboard│  ┌─────────────────────────────────┐                │
│ Lecciones│  │ 🔍 Buscar por nombre o email... │                │
│ Recursos │  └─────────────────────────────────┘                │
│ Progreso │  Filtros: [Todos ▼] [Todas las cohortes ▼]         │
│ ─────────│                                                     │
│ Usuarios │  ┌──────────────────────────────────────────────┐   │
│ Matriculas│ │ Nombre         Email              Roles      │   │
│          │  ├──────────────────────────────────────────────┤   │
│          │  │ Maria Lopez    maria@mail.cl     [Teacher]    │   │
│          │  │                                   Dip.4G M1,M3│  │
│          │  │                                   [Student]    │   │
│          │  │                                   Dip.5G      │   │
│          │  ├──────────────────────────────────────────────┤   │
│          │  │ Juan Perez     juan@mail.cl      [Student]    │   │
│          │  │                                   Dip.4G      │   │
│          │  ├──────────────────────────────────────────────┤   │
│          │  │ Camila Soto    camila@ci.cl      [Ops]        │   │
│          │  │                                   Global      │   │
│          │  └──────────────────────────────────────────────┘   │
│          │  Mostrando 1-10 de 45     [< 1 2 3 4 5 >]          │
└──────────┴─────────────────────────────────────────────────────┘
```

### 12.2 Admin — Ficha de usuario (`/admin/users/[userId]`)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Usuarios    Maria Lopez                                  │
├──────────┬──────────────────────────────────────────────────┤
│ Sidebar  │  ┌─ Datos del perfil ──────────────────────────┐ │
│          │  │ Nombre:  Maria Lopez                         │ │
│          │  │ Email:   maria@mail.cl                       │ │
│          │  │ Telefono: +56 9 1234 5678                    │ │
│          │  │ Rol global: student         [Cambiar ▼]      │ │
│          │  │ Creado:  2026-03-15                           │ │
│          │  │                          [Editar] [Desactivar]│ │
│          │  └──────────────────────────────────────────────┘ │
│          │                                                   │
│          │  ┌─ Roles por cohorte ─────── [+ Agregar rol] ──┐ │
│          │  │                                               │ │
│          │  │  Diplomado 4G (activa)                        │ │
│          │  │  ├ Teacher: Modulo 1, Modulo 3                │ │
│          │  │  └ Asignado: 2026-04-01 por Admin    [Revocar]│ │
│          │  │                                               │ │
│          │  │  Diplomado 5G (activa)                        │ │
│          │  │  ├ Student                                    │ │
│          │  │  └ Asignado: 2026-05-10 por Admin    [Revocar]│ │
│          │  │                                               │ │
│          │  │  Liderazgo 1E (cerrada)                       │ │
│          │  │  ├ Teacher: Modulo 2                          │ │
│          │  │  └ Revocado: 2026-04-20                [----] │ │
│          │  └───────────────────────────────────────────────┘ │
└──────────┴───────────────────────────────────────────────────┘
```

### 12.3 Modal — Asignar rol a cohorte

```
┌────────────────────────────────────────┐
│  Asignar rol a Maria Lopez             │
│                                        │
│  Cohorte:                              │
│  ┌──────────────────────────────────┐  │
│  │ Diplomado 4G — Ventas Inmob.  ▼  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Rol:                                  │
│  ○ Student    ● Teacher                │
│                                        │
│  Modulos a cargo:                      │
│  ☑ Modulo 1: Fundamentos              │
│  ☐ Modulo 2: Tecnicas de venta        │
│  ☑ Modulo 3: Cierre y negociacion     │
│  ☐ Modulo 4: Marketing inmobiliario   │
│                                        │
│           [Cancelar]  [Asignar]        │
└────────────────────────────────────────┘
```

### 12.4 Selector de cohorte (usuario multi-rol)

```
┌─────────────────────────────────────────────────────┐
│  Capital Academy                                     │
│                                                      │
│  Hola, Maria. Selecciona tu programa:                │
│                                                      │
│  ┌─────────────────────────────────┐                 │
│  │  Diplomado en Ventas 4G         │                 │
│  │  Rol: Profesora                 │                 │
│  │  Modulos: Fundamentos, Cierre   │                 │
│  │  Estado: Activa                 │                 │
│  │                      [Entrar →] │                 │
│  └─────────────────────────────────┘                 │
│                                                      │
│  ┌─────────────────────────────────┐                 │
│  │  Diplomado en Ventas 5G         │                 │
│  │  Rol: Alumna                    │                 │
│  │  Progreso: 35%                  │                 │
│  │  Estado: Activa                 │                 │
│  │                      [Entrar →] │                 │
│  └─────────────────────────────────┘                 │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 12.5 Teacher — Dashboard de cohorte (`/teacher/[cohortId]`)

```
┌─────────────────────────────────────────────────────────────┐
│  Capital Academy          Cohorte: [Dip. 4G ▼]  [ML]       │
├──────────┬──────────────────────────────────────────────────┤
│ Sidebar  │  Mis modulos — Diplomado 4G                      │
│          │                                                   │
│ Mis mod. │  ┌─ Modulo 1: Fundamentos ────────────────────┐  │
│ Progreso │  │ 5 lecciones · 3 con video · 12 alumnos     │  │
│ Recursos │  │ Progreso promedio: 68%                      │  │
│          │  │                         [Ver progreso →]     │  │
│          │  └────────────────────────────────────────────┘  │
│          │                                                   │
│          │  ┌─ Modulo 3: Cierre y negociacion ───────────┐  │
│          │  │ 4 lecciones · 2 con video · 12 alumnos     │  │
│          │  │ Progreso promedio: 42%                      │  │
│          │  │                         [Ver progreso →]     │  │
│          │  └────────────────────────────────────────────┘  │
└──────────┴───────────────────────────────────────────────────┘
```

---

## 13. Edge cases

### 13.1 Usuario es teacher Y student en la misma cohorte

**Escenario:** Maria es profesora del Modulo 1, pero esta tomando el Diplomado como alumna tambien (para aprender los otros modulos).

**Solucion:**
- Tiene dos registros en `cohort_roles`: uno como `teacher` y otro como `student`.
- Tiene un `enrollment` como alumna y un `teacher_module_assignment` como profesora.
- En el selector de contexto, ve la cohorte una sola vez, pero con ambos roles indicados.
- En el classroom: puede consumir contenido como alumna (ve todos los modulos, tiene progreso).
- En el teacher panel: ve solo su modulo asignado con el progreso de alumnos.
- Su progreso como alumna en su propio modulo se registra normalmente en `video_progress`.

### 13.2 Admin matriculado como student (testing)

**Escenario:** El admin `edaza@capitalinteligente.cl` quiere probar la experiencia de alumno.

**Solucion:**
- Tiene `profiles.role = 'admin'` (global).
- Tambien tiene un `cohort_roles` como `student` + `enrollment` en la cohorte de prueba.
- En el sidebar ve: acceso al admin panel (por rol global) + acceso al classroom (por enrollment).
- Las RLS policies le dan acceso completo por ser admin, pero la UI del classroom le muestra la experiencia de alumno cuando navega a `/classroom/[cohortId]`.
- El toggle entre "vista admin" y "vista alumno" es implicito por la ruta (no hay un switch manual).

### 13.3 Teacher intenta acceder a modulo de otro teacher

**Escenario:** Profesor A tiene el Modulo 1. Intenta navegar a `/classroom/[cohortId]/[moduleId-del-modulo-2]`.

**Solucion:**
- El helper `requireModuleAccess(cohortId, moduleId)` verifica `teacher_module_assignments`.
- Si el modulo no esta en sus asignaciones, recibe un 403 con redirect a su dashboard de teacher.
- A nivel de RLS, las queries de progreso de alumnos filtran por `teacher_module_ids()`, asi que el profesor no ve datos de otros modulos incluso si altera la URL.

### 13.4 Ops matricula a alguien que ya tiene rol de teacher en la cohorte

**Escenario:** Ops intenta matricular como student a alguien que ya es teacher en esa cohorte.

**Solucion:**
- El sistema permite crear un segundo `cohort_roles` (teacher + student son roles distintos).
- Se crea el enrollment normalmente.
- Se muestra un aviso informativo: "Este usuario ya tiene el rol de Teacher en esta cohorte. Se agregara tambien como Student."

### 13.5 Revocar teacher que tiene calificaciones pendientes

**Escenario:** Admin revoca el rol de teacher a alguien que tiene evaluaciones por calificar.

**Solucion:**
- El sistema revoca el acceso inmediatamente (status = 'revoked').
- Las evaluaciones pendientes quedan asignadas al modulo, no al teacher. Ops o admin pueden calificar.
- Se muestra una advertencia: "Este profesor tiene X evaluaciones pendientes de calificacion en Modulo Y. Al revocar, las evaluaciones quedaran a cargo de operaciones."

### 13.6 Usuario desactivado intenta hacer login

**Escenario:** Un usuario fue desactivado por el admin.

**Solucion:**
- La desactivacion se hace a nivel de Supabase Auth (`auth.admin.updateUserById({ banned: true })`).
- Al intentar login, Supabase retorna error de auth. El usuario ve "Tu cuenta ha sido desactivada. Contacta al administrador."
- Las `cohort_roles` se marcan como `revoked` automaticamente al desactivar.

---

## 14. Migracion del sistema actual

El sistema actual usa `profiles.role` como unica fuente de verdad. La migracion es incremental:

### Fase 1: Coexistencia (Sprint 1-2)

1. Crear las tablas `cohort_roles` y `teacher_module_assignments`.
2. Migrar datos existentes: para cada enrollment activo, crear un `cohort_roles` con role='student'. Para cada `program_modules.teacher_id`, crear el `cohort_roles` + `teacher_module_assignment`.
3. Los helpers nuevos (`requireAuth`, `requireGlobalRole`) coexisten con los guards manuales.
4. `profiles.role` sigue funcionando para admin/ops.

### Fase 2: Adopcion (Sprint 2-3)

5. Reemplazar los guards manuales en layouts y API routes por los helpers centralizados.
6. Actualizar RLS policies para usar `cohort_roles` en lugar de `profiles.role` para teacher.
7. Implementar las rutas `/admin/users` y `/admin/enrollments`.

### Fase 3: Limpieza (Sprint 3-4)

8. `profiles.role` se usa SOLO para admin y ops. Para student y teacher, `cohort_roles` es la fuente de verdad.
9. Eliminar `program_modules.teacher_id` (reemplazado por `teacher_module_assignments`).
10. Agregar las vistas de teacher (`/teacher/**`).

---

## 15. Metricas de exito

| Metrica | Target | Como se mide |
|---|---|---|
| Tiempo para crear un usuario y asignar rol | < 2 min | UX testing manual |
| Guards duplicados en el codebase | 0 | Grep por `includes(profile.role)` en routes/layouts |
| Teacher ve datos de otro modulo | Nunca | Test E2E: teacher navega a modulo ajeno, recibe 403 |
| Matricula masiva de 30 alumnos | < 5 min | UX testing con CSV |
| Tiempo de cambio de contexto entre cohortes | < 1s | Medicion en browser |

---

## 16. Decisiones sobre preguntas abiertas

| # | Pregunta | Decision |
|---|----------|----------|
| 1 | Cuando un teacher sube un recurso, ¿solo puede subirlo a sus modulos asignados o a cualquier modulo de la cohorte? | **Solo sus modulos asignados.** El teacher solo gestiona lo que le corresponde. |
| 2 | ¿Ops puede crear usuarios o solo matricular existentes? | **Ops puede crear alumnos y teachers.** No puede crear otros ops ni admin. Solo admin crea roles de plataforma (ops/admin). |
| 3 | ¿Se necesita un log visible de quien asigno que rol a quien? | **Si, visible en perfil de admin + guardado en DB.** Se muestra como timeline en la ficha del usuario en el panel admin. |
| 4 | ¿Un alumno puede estar en mas de una cohorte del MISMO programa? | **Si, permitir.** Un alumno puede repetir un programa en otra cohorte. No hay constraint de unicidad user+program. |
| 5 | ¿El teacher necesita acceso al admin panel para subir videos, o solo recursos? | **Videos + recursos.** El teacher puede subir videos via Mux y gestionar recursos de sus modulos asignados. |
| 6 | ¿Mantener `program_modules.teacher_id` ademas de `teacher_module_assignments`? | **Mantener ambos.** `teacher_id` queda como "teacher principal" del modulo (para mostrar en UI). La nueva tabla se usa para permisos. Migrar a una sola fuente despues. |
