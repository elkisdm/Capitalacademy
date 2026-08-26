# Cuentas internas + alerta de inasistencias recurrente

**Clasificación**: `feat` + `fix` · large · **riesgo alto** · known ·
toca `db/migrations/`, `lib/profiles/`, `lib/classroom/`, `lib/admin/`, `lib/campaigns/`, `app/api/cron/`
**Tier**: 3 — Full (data model transversal, borrado irreversible, envío de correos a personas reales)
**Fecha**: 2026-08-26

## Objetivo

Dos cosas encadenadas:

1. **Etiquetar cuentas que no son alumnos reales** (staff, cuentas personales de prueba,
   basura de QA) para que dejen de entrar en comunicaciones y métricas y dejen de
   ensuciar los datos de cada cohorte.
2. **Reactivar la alerta de inasistencias** del Diplomado con avisos recurrentes en vez
   de un aviso único, que se gastó el 11-jul con datos incompletos.

El orden importa: sin (1), reactivar (2) manda correos de inasistencia a la cuenta
`Administrador` y a las cuentas personales del equipo.

## Hallazgos de la exploración

- **No existe ningún flag** de cuenta interna. `profiles.role` y `profiles.system_role`
  son de permisos, y `enrollments.segment` es de marketing (`capital_inteligente` son
  alumnas REALES).
- **Ya existe `isStaffEnrollment(system_role)`** en `lib/admin/actividad-queries.ts:84`,
  pero se usa en UN solo consumidor (el panel de actividad) y solo detecta
  `system_role in ('admin','ops')`. No atrapa `elkisdm@gmail.com` ni `vicunapaola1@gmail.com`
  ni las 11 cuentas `@test.local` — todas con `system_role='user'`.
  Es el patrón meta ya detectado en la auditoría del 17-jul: defensa escrita y no propagada.
- **La detección por heurística no sirve.** El dominio no basta: muchas alumnas reales
  usan `@capitalinteligente.cl`. El rol tampoco: dos personas del equipo usan Gmail.
  Tiene que ser una etiqueta explícita.
- **`profiles` NO tiene FK hacia `auth.users`**: borrar un perfil deja la cuenta de
  login viva y huérfana. El borrado va en dos lugares.
- Contaminación actual: Workshop 10/280 · Diplomado G4 3/24 · Ciclo CI 1/243 · Liderazgo 0/3.

## Decisiones de diseño

**Dónde vive la etiqueta: `profiles.account_type`**, no `enrollments`.
La condición de "interno" es de la persona, no de una matrícula puntual, y hoy no existe
ningún caso de alguien que sea staff en una cohorte y alumno real en otra. Si aparece,
se agrega un override en `enrollments` sin migrar nada de lo anterior — es barato de
revertir, así que no justifica complejidad hoy.

Valores: `'real'` (default) · `'staff'` · `'test'`. No es un booleano porque las dos
poblaciones ya existen y tienen destinos distintos: `test` es basura borrable,
`staff` son personas del equipo que se quedan. El filtro es el mismo (`<> 'real'`).

**La etiqueta NO quita acceso.** Una cuenta interna sigue entrando al aula, al quiz y a
la sala — solo desaparece de correos y de reportes. Por eso los ~20 consumidores de
`enrollments` que resuelven permisos no se tocan.

**La alerta recurrente usa marca de agua, no niveles.** La fila única existente guarda el
conteo del último aviso; solo se reenvía cuando el conteo real lo supera. El anti-ráfaga
sale gratis: un alumno que salta de 2 a 16 recibe UN correo que dice 16.
Esto blinda contra el próximo backfill masivo de asistencia.

## Supuestos (corrígeme si alguno está mal)

- Cuentas internas confirmadas contigo: `admin@capitalacademy.cl`, `edaza@capitalinteligente.cl`,
  `elkisdm@gmail.com`, `academia@capitalinteligente.cl`, `camilagonzalezm10@gmail.com`,
  `mpgonzalezf@capitalinteligente.cl`, `pvicuna@capitalinteligente.cl` y `vicunapaola1@gmail.com`.
  Las dos últimas son la misma persona (Paola Vicuña) con dos cuentas.
- Las cuentas internas quedan fuera de los paneles admin sin interruptor para verlas.
  Si se necesitan revisar, están en `/admin/usuarios`.
- No cambio el copy del correo de inasistencias, ni el umbral (2), ni el máximo tolerado (3).
- No enciendo la alerta en ningún otro programa. El Ciclo CI sigue apagado a propósito.
- No toco `isStaffEnrollment` como concepto: se reemplaza su uso por el helper nuevo,
  que es un superconjunto.

## Criterios de aceptación

### Etiquetado
- [ ] Una cuenta `staff`/`test` no aparece en el roster de `/admin/alumnos` ni en sus totales.
- [ ] Una cuenta `staff`/`test` no recibe recordatorio de clase, aviso de repetición lista,
      apertura de entregable, campaña de comunicaciones ni alerta de inasistencia.
- [ ] Una cuenta `staff` conserva TODO su acceso: entra al aula, rinde quiz, entra a la sala.
- [ ] Los contadores de matrícula de cada cohorte reflejan solo alumnos reales.
- [ ] Las 11 cuentas de QA quedan borradas de `public.profiles` Y de `auth.users`.

### Alerta recurrente
- [ ] Un alumno cuyo conteo sube de 2 a 3 recibe un correo nuevo que dice 3.
- [ ] Un alumno cuyo conteo no subió desde el último aviso no recibe nada.
- [ ] Un alumno que salta de 2 a 16 recibe UN correo, no 14.
- [ ] Dos corridas simultáneas del cron nunca producen dos correos al mismo alumno.
- [ ] Un envío `failed` se reintenta; un `pending` colgado >10 min se recupera.
- [ ] Las 19 filas infladas del G4 quedan borradas y las 6 correctas conservadas.

## Archivos y rutas a tocar — *verificado contra código: sí*

### Fase 1 — Etiquetado (habilitante, no envía ningún correo)
| Archivo | Acción | Qué cambia |
|---|---|---|
| `db/migrations/0104_profiles_account_type.sql` | nuevo | Columna + check + índice parcial; backfill de las 8 internas; borrado de las 11 de QA en `public` |
| `scripts/borrar-cuentas-qa.mjs` | nuevo | Borra los 11 `auth.users` vía Admin API (no va en SQL) |
| `lib/profiles/account-type.ts` | nuevo | Helper único: constante de columnas, predicado `isInternalAccount`, filtro reusable |

### Fase 2 — Comunicaciones (6 puntos de envío)
| Archivo | Acción |
|---|---|
| `lib/classroom/session-recipients.ts` | recordatorios de clase |
| `lib/classroom/recording-notifications.ts` | 2 puntos (líneas ~101 y ~309) |
| `lib/deliverables/notify.ts` | apertura de entregables |
| `lib/campaigns/audience.ts` | campañas de `/admin/comunicaciones` |
| `lib/asistencia/queries.ts::getStudentsAtAbsenceThreshold` | alerta de inasistencias |

### Fase 3 — Métricas y reportes
| Archivo | Acción |
|---|---|
| `lib/admin/student-panel-queries.ts` | roster de `/admin/alumnos` |
| `lib/admin/actividad-queries.ts` | reemplaza `isStaffEnrollment` por el helper |
| `lib/asistencia/queries.ts::getSessionAttendance` | reporte de asistencia por sesión |
| `lib/classroom/admin-queries.ts` | contadores de cohorte |

### Fase 4 — Alerta recurrente
| Archivo | Acción |
|---|---|
| `db/migrations/0105_attendance_alerts_recurrentes.sql` | borra las 19 filas infladas (criterio SQL, con guardia por fecha) |
| `app/api/cron/session-reminders/route.ts` | `processAbsenceAlerts`: dedup por `absences_count`, reserva vía UPDATE condicional atómico |
| `docs/adr/0037-cuentas-internas-y-alerta-recurrente.md` | reemplaza el punto 2 del ADR-0013 |

**Sin cambios**: `lib/asistencia/window.ts`, `lib/email/attendance-warning.ts` y los ~20
consumidores de `enrollments` que resuelven acceso o permisos.

## Tests

- `lib/profiles/__tests__/account-type.test.ts` — predicado y filtro (happy path + nulls).
- Un test por punto de envío de la Fase 2: una cuenta interna no entra en la lista de destinatarios.
- Un test por reporte de la Fase 3: una cuenta interna no entra en los totales.
- `app/api/cron/session-reminders/__tests__/route.test.ts` — un test por cada criterio de
  aceptación de la alerta, incluidos concurrencia y reintento (son los que protegen contra
  el incidente de 239 correos duplicados del 21-jul).
- Cobertura: no baja. Los correos son ruta crítica (ADR-0012).

## Fuera de alcance

- Encender la alerta en Liderazgo, Workshop o Ciclo CI.
- Cambiar el texto del correo, los umbrales o el máximo tolerado.
- Interruptor "ver cuentas internas" en los paneles admin.
- Unificar las cuentas duplicadas de una misma persona (Paola, Elkis, Camila).

## Tareas

1. Migración 0104 + helper + script de `auth.users` (Fase 1).
2. Aplicar 0104 a prod y verificar los conteos por cohorte. **Punto de control antes del borrado.**
3. Fase 2 (comunicaciones) con sus tests.
4. Fase 3 (métricas) con sus tests.
5. Migración 0105 + `processAbsenceAlerts` + tests (Fase 4).
6. **Punto de control**: revisar la lista final de destinatarios antes de que salga el primer correo.
7. ADR-0037 + codemap + changelog.
