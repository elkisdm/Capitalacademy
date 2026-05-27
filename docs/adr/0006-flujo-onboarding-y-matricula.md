# ADR-0006: Flujo de onboarding, invitacion y matricula automatica

- **Status:** proposed
- **Date:** 2026-05-27
- **Deciders:** Eduardo Daza
- **Tags:** auth, onboarding, email, csv-import, payments, data-model

## Contexto

Capital Academy es una plataforma de educacion ejecutiva donde el admin crea las cuentas de los alumnos (no hay self-registration — ver [ADR-0004](0004-modelo-permisos-rbac-por-cohorte.md)). Hoy el flujo de alta es manual e incompleto:

1. **Sin email de invitacion:** el admin crea un usuario via `/admin/users`, le asigna una contrasena temporal y se la comunica por WhatsApp o verbalmente. No hay email automatizado con credenciales ni enlace directo a la plataforma.
2. **Sin completacion de perfil obligatoria:** el campo `profiles` tiene `full_name`, `phone` y `avatar_url`, pero no hay mecanismo que fuerce al alumno a completar datos clave (RUT, empresa, cargo) en su primer ingreso. Esto dificulta la emision de certificados y el reporte a SENCE.
3. **Sin importacion masiva:** para cada cohorte (20-40 alumnos), el admin debe crear uno a uno manualmente. En la cohorte 2S-2026 esto tomo ~3 horas.
4. **Sin auto-registro post-pago:** cuando alguien paga el diplomado via Flow/Fintoc, recibe un email de confirmacion de pago (`lib/email/payment-confirmation.ts`) pero su cuenta se crea manualmente despues. Hay una ventana de 24-48 horas donde el alumno ya pago pero no tiene acceso.

### Tres caminos de entrada, un solo destino

Existen tres formas de que un alumno llegue a la plataforma:

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  Admin crea uno  │   │  Admin importa   │   │  Pago aprobado   │
│  desde el panel  │   │  CSV con 20-40   │   │  (Flow/Fintoc    │
│                  │   │  alumnos         │   │   webhook)       │
└────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘
         │                      │                       │
         ▼                      ▼                       ▼
   ┌─────────────────────────────────────────────────────────┐
   │  auth.users + profiles + enrollment + cohort_role       │
   │  + email de invitacion via Resend                       │
   └──────────────────────────┬──────────────────────────────┘
                              │
                              ▼
   ┌──────────────────────────────────────────────────────────┐
   │  Alumno llega → login → /onboarding/complete-profile    │
   │  (si onboarding_completed_at IS NULL)                   │
   └──────────────────────────────────────────────────────────┘
```

Los tres caminos DEBEN converger en el mismo resultado: un usuario con auth, perfil, enrollment, cohort_role, y un email de invitacion en su bandeja.

### Restricciones

- **Resend ya esta configurado** en `lib/resend/client.ts` (`RESEND_API_KEY` + `FROM_EMAIL`). Hay un patron probado de envio HTML+texto plano en `lib/email/payment-confirmation.ts`.
- **El admin panel de usuarios existe** en `app/(admin)/admin/users/` con crear, editar, asignar roles a cohorte.
- **La creacion de usuario usa contrasena** (`admin.auth.admin.createUser({ email, password, email_confirm: true })` en `app/api/admin/users/route.ts`). No se usa magic link.
- **El webhook de pago existe** en `app/api/flow/webhook/route.ts` — ya maneja la transicion `pending → succeeded` y envia email de confirmacion, pero NO crea usuario ni enrollment.
- **El modelo RBAC ya tiene** `system_role` en profiles + `cohort_roles` + trigger de sync enrollments → cohort_roles (ADR-0004).

## Decision

### 1. Extension del schema de `profiles`

Agregar columnas para datos del alumno que hoy no se capturan:

```sql
-- Migracion: add_onboarding_profile_fields.sql

alter table public.profiles
  add column rut text,
  add column company text,
  add column job_title text,
  add column linkedin_url text,
  add column bio text,
  add column address text,
  add column emergency_contact_name text,
  add column emergency_contact_phone text,
  add column onboarding_completed_at timestamptz;

-- Indice parcial para detectar perfiles incompletos rapidamente
create index profiles_onboarding_pending_idx
  on public.profiles (id)
  where onboarding_completed_at is null;

-- RUT tiene formato chileno (ej: 12.345.678-9). No se enforza formato en DB
-- (se valida en el frontend con rutlib), pero si se requiere unicidad.
create unique index profiles_rut_unique_idx
  on public.profiles (rut)
  where rut is not null;

-- Marcar como completados los perfiles de admin/ops existentes
-- (no se les va a pedir completar onboarding)
update public.profiles
  set onboarding_completed_at = now()
  where system_role in ('ops', 'admin');
```

**Campos requeridos en primer login:** `full_name` (ya existe), `phone` (ya existe), `rut` (nuevo).

**Campos opcionales (completar despues):** `avatar_url` (ya existe), `company`, `job_title`, `linkedin_url`, `bio`, `address`, `emergency_contact_name`, `emergency_contact_phone`.

**`onboarding_completed_at`:** `NULL` hasta que el alumno complete el formulario de primer login. El middleware usa este campo para forzar la redireccion.

### 2. Estrategia de invitacion: contrasena temporal + email via Resend

Se decide enviar un email con **contrasena temporal** (no magic link). Razones:

- El flujo actual del admin panel ya crea usuarios con contrasena (`createUser({ password })`) y funciona.
- El alumno puede ingresar cuando quiera — no depende de que el email tenga un link con expiracion.
- Al hacer login por primera vez, el guard de onboarding lo redirige a cambiar contrasena y completar perfil.

**Flujo del email:**

```
Admin crea usuario (con contrasena generada automaticamente)
  → POST /api/admin/users (ya existe, se extiende)
    → Supabase Auth createUser
    → Upsert en profiles
    → POST /api/admin/send-invitation (nuevo)
      → Resend: email HTML branded con:
        - Nombre del programa/cohorte
        - Email del alumno (como usuario)
        - Contrasena temporal
        - Boton CTA: "Ingresar a Capital Academy" → /login
        - Instruccion: "Al ingresar, te pediremos completar tu perfil"
```

**Generacion de contrasena temporal:**

```typescript
// lib/auth/temp-password.ts
import { randomBytes } from "crypto";

/** 12 chars, mix de letras y numeros, sin caracteres ambiguos */
export function generateTempPassword(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes)
    .map((b) => charset[b % charset.length])
    .join("");
}
```

### 3. Importacion masiva por CSV

**Flujo:**

```
Admin → /admin/users → "Importar CSV"
  → Upload zona (drag & drop o click)
  → Parseo client-side con Papa Parse
  → Columnas requeridas: email, nombre_completo
  → Columnas opcionales: telefono, rut
  → Seleccion de cohorte destino (dropdown)
  → Vista previa en tabla:
    - Verde: usuario nuevo (se creara)
    - Azul: usuario existente (solo se asignara a la cohorte)
    - Rojo: error (email invalido, duplicado en CSV, ya inscrito en esa cohorte)
  → Boton "Confirmar importacion"
  → POST /api/admin/users/bulk
    → Procesamiento secuencial (no paralelo, para manejar errores por fila)
    → Por cada fila valida:
      1. Si el email NO existe en auth.users:
         - Generar contrasena temporal
         - createUser en Supabase Auth
         - Upsert en profiles
      2. Crear enrollment + cohort_role (student) via trigger de sync
      3. Encolar email de invitacion
    → Response: { created: N, assigned: N, errors: [{ row, email, reason }] }
  → UI muestra resumen + errores descargables
```

**Limites del endpoint bulk:**

- Maximo 50 filas por request (suficiente para cohortes de 20-40).
- Timeout del endpoint: 60 segundos (configurar en Next.js route config).
- Si un email falla, la fila se marca como error pero el resto continua.

**Validaciones client-side (antes de enviar):**

| Regla | Ejemplo de error |
|---|---|
| Email con formato valido | `"juanmail.cl"` → formato invalido |
| Sin emails duplicados en el CSV | `maria@x.cl` aparece 2 veces |
| Nombre no vacio | Fila 5 sin nombre |
| Si incluye RUT, formato valido | `"123"` → RUT invalido |

**Validaciones server-side (durante procesamiento):**

| Regla | Comportamiento |
|---|---|
| Email ya existe en la cohorte destino | Se omite con warning, no es error fatal |
| Email ya existe en auth.users | Se crea solo enrollment + cohort_role, no se recrea auth user |
| Falla de Supabase Auth | La fila se marca como error; las demas continuan |

### 4. Auto-registro post-pago (webhook)

Cuando el webhook de Flow/Fintoc confirma un pago exitoso, el sistema crea automaticamente la cuenta del alumno si no existe.

**Extension del webhook actual** (`app/api/flow/webhook/route.ts`):

```typescript
// Despues de confirmar status === "succeeded" && !wasAlreadyPaid:

// 1. Determinar cohort activa del programa
const { data: activeCohort } = await supabase
  .from("cohorts")
  .select("id")
  .eq("program_id", DIPLOMADO_PROGRAM_ID)
  .eq("status", "active")
  .order("start_date", { ascending: false })
  .limit(1)
  .single();

// 2. Verificar si el usuario ya existe
const { data: existingUsers } = await admin.auth.admin.listUsers();
const existingUser = existingUsers.users.find(
  (u) => u.email === existing.email
);

if (existingUser) {
  // Solo crear enrollment + cohort_role si no existe
  await ensureEnrollment(supabase, existingUser.id, activeCohort.id);
} else {
  // Crear usuario completo
  const tempPassword = generateTempPassword();
  const { data: newAuth } = await admin.auth.admin.createUser({
    email: existing.email,
    password: tempPassword,
    email_confirm: true,
  });

  await supabase.from("profiles").upsert({
    id: newAuth.user.id,
    email: existing.email,
    full_name: `${existing.firstname} ${existing.lastname}`,
    phone: existing.phone,
    rut: existing.rut,
    system_role: "user",
  });

  await ensureEnrollment(supabase, newAuth.user.id, activeCohort.id);

  // Enviar email de bienvenida con credenciales
  await sendInvitationEmail({
    email: existing.email,
    firstname: existing.firstname,
    tempPassword,
    cohortName: "Diplomado Ejecutivo en Ventas",
  });
}
```

**Funcion `ensureEnrollment`:** crea enrollment + deja que el trigger de ADR-0004 genere el `cohort_role`. Usa `ON CONFLICT DO NOTHING` para ser idempotente.

**Edge case: el email del pago no coincide con un usuario existente pero SI existe en `profiles` con otro email.**
Esto no se maneja automaticamente. El pago queda registrado con el email del formulario de pago, y si ese email no matchea ningun auth.users, se crea uno nuevo. Si el admin detecta duplicados, los fusiona manualmente (backlog).

### 5. Guard de primer login: completar perfil obligatorio

**Implementacion: layout guard en el grupo `(classroom)`.**

Se elige layout guard sobre middleware por dos razones:
1. El middleware (`lib/supabase/middleware.ts`) ya maneja auth + rutas publicas. Agregar logica de perfil ahora lo haria demasiado complejo.
2. El guard solo aplica a rutas autenticadas dentro del classroom. Las rutas admin/ops no lo necesitan (sus perfiles ya estan marcados como completados).

```typescript
// app/(classroom)/layout.tsx — agregar despues de verificar auth

const { data: profile } = await supabase
  .from("profiles")
  .select("onboarding_completed_at, system_role")
  .eq("id", user.id)
  .single();

// Solo forzar onboarding para usuarios regulares (no staff)
if (
  profile &&
  profile.system_role === "user" &&
  profile.onboarding_completed_at === null
) {
  redirect("/onboarding/complete-profile");
}
```

**Pagina `/onboarding/complete-profile`:**

```
┌──────────────────────────────────────────────────────────┐
│  Capital Academy                                          │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                                                     │  │
│  │  Bienvenido a Capital Academy                       │  │
│  │                                                     │  │
│  │  Antes de comenzar, necesitamos algunos datos       │  │
│  │  para tu perfil academico.                          │  │
│  │                                                     │  │
│  │  Nombre completo *                                  │  │
│  │  ┌───────────────────────────────────────────────┐  │  │
│  │  │ Maria Lopez Gonzalez                          │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  │                                                     │  │
│  │  Telefono *                                         │  │
│  │  ┌───────────────────────────────────────────────┐  │  │
│  │  │ +56 9 1234 5678                               │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  │                                                     │  │
│  │  RUT *                                              │  │
│  │  ┌───────────────────────────────────────────────┐  │  │
│  │  │ 12.345.678-9                                  │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  │                                                     │  │
│  │  --- Opcionales (puedes completar despues) ---      │  │
│  │                                                     │  │
│  │  Empresa                                            │  │
│  │  ┌───────────────────────────────────────────────┐  │  │
│  │  │                                               │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  │                                                     │  │
│  │  Cargo                                              │  │
│  │  ┌───────────────────────────────────────────────┐  │  │
│  │  │                                               │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  │                                                     │  │
│  │           [ Completar perfil y continuar ]          │  │
│  │                                                     │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Al enviar el formulario:**

```sql
-- PATCH /api/onboarding/complete-profile
update public.profiles
set
  full_name = $1,
  phone = $2,
  rut = $3,
  company = $4,        -- nullable
  job_title = $5,      -- nullable
  onboarding_completed_at = now()
where id = auth.uid()
  and onboarding_completed_at is null;  -- idempotente
```

Despues del update exitoso, redirige a `/classroom` (que a su vez redirige a la cohorte activa del alumno).

### 6. Tabla `invitation_log` para tracking

Se necesita un registro de invitaciones enviadas para auditar reenvios, detectar rebotes y saber que alumnos nunca abrieron su email.

```sql
create table public.invitation_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  resend_message_id text,          -- ID retornado por Resend para tracking
  sent_at timestamptz not null default now(),
  sent_by uuid references public.profiles(id) on delete set null,
  source text not null default 'manual',  -- 'manual' | 'csv_import' | 'payment_webhook'
  cohort_id uuid references public.cohorts(id) on delete set null
);

create index invitation_log_user_idx on public.invitation_log(user_id);
alter table public.invitation_log enable row level security;

-- Solo staff puede ver/crear invitaciones
create policy invitation_log_staff_all on public.invitation_log
  for all using (public.is_platform_staff());
```

### 7. Resumen de cambios por componente

| Componente | Tipo | Cambio |
|---|---|---|
| `profiles` (tabla) | ALTER | +8 columnas (rut, company, job_title, linkedin_url, bio, address, emergency_contact_name, emergency_contact_phone, onboarding_completed_at) |
| `invitation_log` (tabla) | CREATE | Nueva tabla para tracking de emails enviados |
| `POST /api/admin/users` | EXTEND | Despues de crear usuario, encolar envio de email de invitacion |
| `POST /api/admin/users/bulk` | CREATE | Nuevo endpoint para importacion masiva CSV |
| `POST /api/admin/send-invitation` | CREATE | Nuevo endpoint para enviar/reenviar email de invitacion |
| `app/api/flow/webhook/route.ts` | EXTEND | Crear auth user + profile + enrollment si pago exitoso |
| `app/(classroom)/layout.tsx` | EXTEND | Guard: redirigir a complete-profile si onboarding_completed_at IS NULL |
| `app/onboarding/complete-profile/` | CREATE | Nueva pagina con formulario de completacion de perfil |
| `PATCH /api/onboarding/complete-profile` | CREATE | Endpoint para guardar datos de perfil + marcar onboarding como completado |
| `lib/auth/temp-password.ts` | CREATE | Funcion generadora de contrasenas temporales |
| `lib/email/invitation.ts` | CREATE | Template de email de invitacion HTML + texto plano |
| `app/(admin)/admin/users/[userId]` | EXTEND | Mostrar estado de onboarding (pendiente/completado) con fecha |

## Opciones consideradas

### Opcion A — Contrasena temporal + email via Resend (elegida)

El admin crea al usuario con una contrasena generada, Resend envia un email branded con las credenciales y un enlace directo a `/login`. Al entrar, el guard de onboarding fuerza la completacion de perfil.

- **Pros:**
  - Reutiliza el flujo existente de creacion de usuario (ya usa `createUser({ password })`).
  - El alumno puede ingresar en cualquier momento — no hay link con expiracion.
  - Se puede reenviar el email con un click desde el panel admin.
  - El template de email sigue el patron ya probado en `payment-confirmation.ts`.

- **Contras:**
  - La contrasena viaja en el email. Si el email es interceptado, hay riesgo. **Mitigacion:** la contrasena es temporal; al completar el onboarding, el alumno la cambia. Ademas, el volumen de usuarios es bajo (25-40 por cohorte) y todos son profesionales del sector inmobiliario (bajo perfil de ataque).
  - Requiere que el alumno cambie la contrasena manualmente. **Mitigacion:** el flujo de onboarding incluye cambio de contrasena como paso opcional en MVP; obligatorio en V1.5.

### Opcion B — Magic link via Supabase Auth

Supabase Auth genera un magic link que se envia al email del alumno. Al hacer click, queda autenticado automaticamente.

- **Pros:**
  - No hay contrasena temporal que pueda ser interceptada.
  - Experiencia de "un click" para el primer acceso.

- **Contras:**
  - **El magic link expira** (por defecto 1 hora en Supabase). Si el alumno no abre el email inmediatamente, tiene que solicitar uno nuevo. Esto genera friction y tickets de soporte.
  - **Requiere acceso al email en el momento exacto del primer login.** Si el alumno esta en una sesion presencial y quiere entrar a la plataforma, necesita abrir su email. Con contrasena temporal, puede haberla anotado previamente.
  - La creacion via admin panel tendria que usar `admin.auth.admin.generateLink()` en vez de `createUser()`, cambiando el flujo existente.
  - El patron de magic link no existe en el codebase actual. Implementarlo requiere configurar el redirect de Supabase Auth, manejar el callback, etc.

### Opcion C — Self-registration con aprobacion

Los alumnos se registran ellos mismos y un admin aprueba cada registro antes de darle acceso.

- **Pros:**
  - Menor carga operativa para el admin al no tener que crear cada cuenta.

- **Contras:**
  - **Contradice la decision de ADR-0004:** Capital Academy opera con un modelo admin-managed. Los alumnos no eligen inscribirse; son matriculados por el equipo despues de confirmar el pago.
  - Introduce un estado "pendiente de aprobacion" que agrega complejidad sin valor.
  - No aplica al flujo de pago automatico (el alumno ya pago, no deberia esperar aprobacion).

## Consecuencias

### Positivas

- **Flujo end-to-end automatizado:** desde que el admin crea el usuario (o el pago se confirma) hasta que el alumno accede, todo esta conectado sin pasos manuales intermedios.
- **Datos de perfil completos para certificados:** al forzar RUT, nombre y telefono en el primer login, se asegura que los datos necesarios para SENCE y certificados estan disponibles.
- **Importacion masiva en <5 minutos:** en vez de 3 horas creando usuarios uno a uno.
- **Trazabilidad:** `invitation_log` registra cada email enviado, por quien, y desde que flujo. Util para soporte ("no me llego el email").
- **Auto-matricula post-pago:** elimina la ventana de 24-48 horas donde el alumno ya pago pero no tiene acceso.

### Negativas

- **Contrasena en email:** riesgo moderado de seguridad. Aceptable dado el contexto (plataforma educativa, no bancaria) y el volumen bajo.
- **Complejidad del webhook de pago:** el webhook de Flow ya tiene logica de monto, cupones y emails. Agregar creacion de usuario + enrollment lo hace mas complejo. **Mitigacion:** extraer la logica de auto-registro a una funcion reutilizable `lib/onboarding/auto-register.ts` que se invoque desde el webhook.
- **Dependencia de Resend para el primer acceso:** si Resend falla, el alumno no recibe sus credenciales. **Mitigacion:** el admin puede ver la contrasena temporal en el log y reenviar manualmente. Tambien se puede resetear la contrasena desde el panel admin (boton ya existe en la UI).

### Riesgos

- **Alumno no completa el onboarding:** si entra, ve el formulario y se va, queda en limbo (`onboarding_completed_at = null`). **Mitigacion:** un cron job o reporte semanal que liste alumnos con enrollment activo pero onboarding pendiente, para que ops los contacte.
- **Email de invitacion cae en spam:** Resend tiene buena reputacion de deliverability, pero el dominio de envio debe estar correctamente configurado (SPF, DKIM, DMARC). **Mitigacion:** ya esta configurado para el email de confirmacion de pago; la invitacion usa el mismo dominio.
- **CSV con datos sucios:** emails invalidos, RUTs mal formateados, encoding de caracteres incorrecto (Windows-1252 en vez de UTF-8). **Mitigacion:** validacion client-side + server-side; el parseo con Papa Parse maneja encoding; se muestra preview antes de confirmar.

## Referencias

- [ADR-0004](0004-modelo-permisos-rbac-por-cohorte.md) — Modelo RBAC multi-tenant (define `system_role`, `cohort_roles`, trigger de sync).
- Creacion actual de usuario: `app/api/admin/users/route.ts`.
- Asignacion de rol: `app/api/admin/cohort-roles/route.ts`.
- Email de confirmacion de pago: `lib/email/payment-confirmation.ts`.
- Webhook de Flow: `app/api/flow/webhook/route.ts`.
- Resend client: `lib/resend/client.ts`.
- Panel admin de usuarios: `app/(admin)/admin/users/`.
- Middleware de auth: `lib/supabase/middleware.ts`.
