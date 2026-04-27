# Capital Academy

Plataforma académica del **Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria**.
Modelo: cohorte + clases pregrabadas + sesiones híbridas (martes/jueves presencial,
miércoles online).

## Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS 4** + shadcn/ui (a integrar)
- **Supabase** (Postgres, Auth, Storage, RLS)
- **React Hook Form** + **Zod**
- **Resend** (email transaccional)
- **Slack Web API** (canal oficial por cohorte)
- **Mux** (video pregrabado)
- **Google Drive API** (entregas de tareas)
- **Sentry** (monitoreo, pendiente de wizard)

## Requisitos

- Node ≥ 22
- pnpm ≥ 10
- Acceso a proyecto Supabase, workspace Slack, cuenta Resend, cuenta Mux, Google
  Workspace con service account.

## Setup local

```bash
pnpm install
cp .env.example .env.local   # completar valores
pnpm dev
```

La app queda en `http://localhost:3000`.

## Scripts

| Script | Descripción |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Build de producción |
| `pnpm start` | Servidor de producción |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm typecheck` | `tsc --noEmit` |

## Estructura

```
app/
  (auth)/login          # E1 - login
  (student)/dashboard   # alumno
  (teacher)/dashboard   # docente
  (ops)/dashboard       # operación académica
  (admin)/dashboard     # dirección
  api/                  # route handlers
components/
  ui/                   # primitivos (shadcn)
  shared/               # componentes compartidos
lib/
  supabase/             # client/server/admin/middleware
  slack/                # SDK Slack
  resend/               # SDK Resend
  mux/                  # SDK Mux
  drive/                # Google Drive
  auth/                 # roles, permisos
  utils/                # helpers (cn, dates)
db/
  migrations/           # SQL Supabase numerado
  seeds/                # seeds para dev
types/                  # tipos compartidos
config/                 # constantes globales
```

## Documentación interna

- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — cronograma por sprints (15 épicas)
- [`db/migrations/README.md`](./db/migrations/README.md) — orden de migraciones

## Convenciones

- Branch principal: `main`. Desarrollo activo: `claude/setup-capital-academy-mvp-e13yU`.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`).
- Prettier antes de commitear (`pnpm format`).
- RLS habilitado por defecto en Supabase: cada tabla nueva debe incluir su política.

## Sentry (pendiente)

Cuando exista cuenta Sentry, ejecutar el wizard:

```bash
pnpm dlx @sentry/wizard@latest -i nextjs
```
