# Migraciones

Las migraciones SQL viven aquí en orden numérico. El plan es ejecutarlas con la
[Supabase CLI](https://supabase.com/docs/guides/local-development) cuando se
inicialice el proyecto remoto.

## Cronograma sugerido

| # | Archivo | Épica(s) | Estado |
|---|---|---|---|
| 0001 | `0001_init_core.sql` | E1, E2, E3, E4, E5 | esqueleto |
| 0002 | `0002_attendance.sql` | E6 | pendiente |
| 0003 | `0003_evaluations.sql` | E7 | pendiente |
| 0004 | `0004_assignments.sql` | E8 | pendiente |
| 0005 | `0005_grading.sql` | E10 | pendiente |
| 0006 | `0006_certification.sql` | E11 | pendiente |
| 0007 | `0007_notifications.sql` | E12 | pendiente |
| 0008 | `0008_comments_resources.sql` | E13 | pendiente |
| 0009 | `0009_audit.sql` | E15 | pendiente |
| 0010 | `0010_rls_policies.sql` | transversal | pendiente |

## Ejecutar localmente

```bash
pnpm dlx supabase start
pnpm dlx supabase db reset
```
