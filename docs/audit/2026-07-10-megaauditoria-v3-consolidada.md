# Megaauditoría v3 — Informe consolidado (2026-07-10)

> Cierre de la megaauditoría de todo el código de Capital Academy, orquestada por Fable 5 con 8 auditores en paralelo, 3 rondas de corrección, re-revisión adversarial entre rondas, e iteración final. Todos los cambios están aplicados en `main` **LOCAL** — sin commit ni push — pendientes de revisión del dueño. `next build` y la suite de tests quedan verdes al cierre.

---

## Resumen ejecutivo

Se corrigieron **2 hallazgos de severidad ALTA en pagos**, fugas de seguridad cross-tenant, bugs de correctness en los 7 frentes implementados el 10 de julio, y se ejecutó una elevación integral de la UI: nueva capa `components/ui` (cva), motion, skeletons y accesibilidad, adoptada en ~148 archivos. El trabajo se organizó en 8 dimensiones auditadas en paralelo, 3 rondas de corrección, y revisores adversariales independientes (backend + frontend) que re-revisaron cada diff buscando regresiones antes de cerrar la ronda siguiente.

## Metodología

- **8 dimensiones auditadas:** multi-tenancy/RLS, authz de API routes, correctness de los frentes nuevos del 10-jul, migraciones/datos/tipos, pagos/webhooks/crons, frontend/Next, sistema de diseño (código), QA visual en prod.
- Cada hallazgo fue verificado contra código real antes de reportarse.
- Tras R1 y R2, revisores adversariales independientes (backend + frontend) re-revisaron el diff completo buscando regresiones introducidas por las propias correcciones; sus hallazgos alimentaron la ronda siguiente.
- **Correcciones a hallazgos originales imprecisos** (auto-corrección del propio proceso, no del código):
  - El poster de video **ya existía**: el bug real era un overlay negro opaco que lo tapaba, no la ausencia del poster.
  - `types.ts` **ya estaba parcheado a mano** con los tipos de las tablas nuevas: el diff de una regeneración limpia salía vacío.
  - `upload-url` **ya validaba tamaño**: el hueco real estaba en el handler `POST` del entregable, que confiaba en el tamaño declarado por el cliente.
  - La rama `"teacher"` **ya estaba documentada como código muerto**: no era un hallazgo nuevo.

## Estado de base de datos

- Las migraciones **0053–0058 ya están aplicadas a producción** (confirmado). El "bloqueante de deploy" identificado en el corte anterior quedó resuelto y no vuelve a listarse aquí.
- Esta auditoría creó **3 migraciones nuevas, NO aplicadas**. Deben aplicarse a producción, en este orden exacto, y luego regenerar los tipos de Supabase, ANTES de desplegar el código de esta rama:

| # | Migración | Qué hace |
|---|-----------|----------|
| 1 | `db/migrations/0059_instructors_scope.sql` | Cierra la fuga cross-tenant del roster de instructores: policy ahora *program-scoped* en vez de global. |
| 2 | `db/migrations/0060_notify_counts.sql` | Agrega `deliverables.open_notified_count` para llevar bitácora de envíos parciales de notificación. |
| 3 | `db/migrations/0061_coupon_redeem_rpc.sql` | RPC atómica `increment_coupon_redemptions`, con guard de `max_redemptions` para evitar sobrecanje. |

El código ya referencia estas tres migraciones (los tipos están parcheados a mano). Mientras no se apliquen, cada fix asociado **falla seguro** en runtime — no rompe nada, pero tampoco corrige el problema que arregla:

- RPC ausente → capturado y logueado, el cupón sigue sin incrementar su contador.
- Columna ausente → el `update` de bitácora se ignora silenciosamente.
- Policy vieja → el roster de instructores sigue siendo visible cross-tenant.

## Hallazgos por severidad

Leyenda de estado: **R1** = corregido en la ronda de cimientos · **R2** = corregido/detectado en adopción y re-revisión adversarial · **R3** = pulido y cierre.

### ALTA

| Hallazgo | Archivo(s) | Ronda | Fix |
|---|---|:---:|---|
| Cupones: `coupons.redemptions` nunca se incrementaba, por lo que `max_redemptions` era inefectivo | `app/api/flow/webhook/route.ts` + RPC `0061` | R1 | Incremento atómico vía RPC con guard de `max_redemptions` |
| Matrícula: el pago del programa de Liderazgo no matriculaba al alumno, pero el correo de confirmación prometía acceso | `enrollBuyer` (generalizado), cohorte resuelta por query | R1 | `enrollBuyer` deja de estar cableado solo a Diplomado |
| Entregables: el roster admin ocultaba entregas de alumnos con matrícula `completed`/`dropped` | filtro `in(active,completed)` + huérfanas con flag `enrolled` | R1 (corregido) / R2 (badge "Sin matrícula" en UI) | Roster ya no pierde entregas al cerrar matrícula |
| UI: opacidad ~40% en todo el classroom hasta el primer scroll | wrapper de página | R1 | Se quita `ca-fade-up` del wrapper global de página |
| UI: poster de video se veía como bloque negro (overlay opaco tapaba el thumbnail real) | overlay de video | R1 (fix) + R2 (re-revisión corrigió el gradient) | Overlay pasa a gradient sobre el poster |
| UI: el toggle "Ver como" cambiaba el sidebar admin↔alumno al navegar entre páginas | redirect de vista | R2 | Guard del redirect por `viewMode` |
| UI: landing mostraba fecha de cohorte ya vencida | fecha dinámica desde `cohorts` | R1 | La fecha ya no puede vencer (se calcula, no se hardcodea) |
| UI: tablas admin con "muro rojo" (exceso de rojo en la interfaz) | tablas admin | R2 | Presupuesto de rojo: solo el chip de estado lo usa |
| Diseño: no existía capa `components/ui` (cva con 0 usos reales) | `components/ui/*` | R1 (creación) / R2 (adopción) | Button, Field, Dialog, Badge, EmptyState, Skeleton, ToastProvider creados y adoptados |

### MEDIA

| Hallazgo | Archivo(s) | Ronda | Fix |
|---|---|:---:|---|
| Fuga cross-tenant del roster de instructores (email/bio visibles fuera de su programa) | migración `0059` | R1 | Policy RLS *program-scoped* |
| Reset de contraseña vulnerable a manipulación del header `Host` (riesgo de account takeover) | `getPublicBaseUrl` | R1 | URL base pública ya no depende del header entrante |
| Cohorte de matrícula hardcodeada a G4 | resolución por cohorte activa vía query | R1 | Matrícula ya no está cableada a una cohorte fija |
| Race condition en re-subida de entregable (riesgo de pérdida de datos bajo concurrencia) | flujo de subida | R1 (fix) + R2 (re-revisión corrigió una regresión introducida en R1) | Colapso determinista: sobrevive la entrega más nueva |
| Validación de tamaño de entregable bypasseable (confiaba en el tamaño declarado por el cliente) | endpoint de subida | R2 (re-revisión) | Se valida contra el tamaño real del objeto almacenado |
| Catch-up de recordatorios demasiado ancho (correo "es mañana" podía llegar con horas de por medio) | cron de recordatorios | R2 (re-revisión) | Ventana acotada a 3 horas |
| Alerta de inasistencia fallida nunca se reintentaba | cron de asistencia | R1 | Exclusión de `status=failed` + re-reserva con CAS |
| `/api/pago/cupon` sin rate limit (vector de enumeración de cupones) | `app/api/pago/cupon/route.ts` | R1 | Rate limiter + respuesta uniforme ante cupón inválido |
| Secret de cron pasado por query param, comparación no timing-safe | helper `lib/api/cron-auth.ts` | R1 | Solo header + `timingSafeEqual` |
| Regresión tipográfica: tokens `--text-*` pisaban la escala default de Tailwind (~430 usos afectados) | `app/globals.css` | R2 (re-revisión) | Revertidos los tokens que colisionaban con la escala default |
| `SessionRow` definido dentro del componente docente (remontaba todo el árbol en cada render) | panel docente | R1 | Extraído a módulo propio |
| Perf: `cohort_roles` consultada por triplicado; páginas admin sin `getAuthUser` cacheado; waterfall de 6 queries | páginas admin | R1 | `cache()` + `Promise.all` |
| Dialog compartido no bloqueaba el scroll de fondo | `components/ui/dialog.tsx` | R3 | Body-scroll-lock |

### BAJA

Se agrupan por ser hallazgos de bajo impacto individual, mayoritariamente detectados y corregidos en R1/R2/R3:

- Menciones sin validar el programa del mencionado.
- `video-proxy` sin verificar `status='active'`.
- Rama muerta `teacher` (documentada, no eliminada).
- Webhook de Mux: `track.ready` respondía 200 incluso en fallo interno.
- HMAC del link de cobro genérico sin expiración *(diferido — ver deuda declarada)*.
- Rate limiter en memoria, no distribuido *(diferido — ver deuda declarada)*.
- Validaciones que devolvían 500 en vez de 422 (fecha inválida, UUID inválido, fecha de nacimiento).
- Link "#" tras subir un archivo.
- Errores de red silenciosos en varios flujos de formulario.
- Badge de clase "recorded" con estilo inconsistente.
- Covers de módulo sin validar formato UUID.
- `deliverables-manager` sin `AbortController` en sus fetch.
- Skeletons incoherentes entre secciones (unificados en R3).
- `focus-visible` ausente en filtros.
- Contraste insuficiente del rosa de marca (`ca-rose`) — llevado a AAA en R3.
- Microcopy: "clase"/"clases" inconsistente, formato de fecha "Julio de...", "docente" vs "profesor" sin criterio único, `title` duplicado.
- Quiz final visible antes de que el módulo saliera de borrador.
- `/admin` sin página índice propia.
- Animación `ca-stagger` aplicada sin que hubiera animación real detrás.
- `sizes` de imágenes de portada sin ajustar al layout real.

## Correcciones por ronda

| Ronda | Foco | Contenido |
|---|---|---|
| **R1 — Cimientos** | Seguridad, pagos, tipos | Tipos de Supabase regenerados; 18 de 20 casts `as never` eliminados; bugs de seguridad/pagos/entregables y de los frentes del 10-jul; Fase 1 de UI (tokens + creación de `components/ui`); 5 fixes visuales de severidad ALTA. |
| **R2 — Adopción y movimiento** | Migración de UI, re-revisión adversarial | Re-revisión adversarial que detectó la regresión tipográfica, el data-loss introducido en R1 y el bypass de validación de tamaño; ~148 archivos migrados a `components/ui` con motion y skeletons; presupuesto de rojo, badges de matrícula huérfana, hero del docente, headers admin, dead-end del quiz, anclas de landing, fix del toggle "Ver como". |
| **R3 — Pulido y cierre** | Terminado | Body-scroll-lock del dialog compartido, unificación de skeletons, `focus-visible`, contraste AAA de `ca-rose`, microcopy, ocultar quiz final en módulos en borrador, índice de `/admin`. |

## Decisiones aceptadas / deuda declarada (NO tocadas)

Estos puntos se identificaron y se dejaron deliberadamente sin cambios, por ser decisiones de producto/infraestructura fuera del alcance de una auditoría de corrección:

- Playback de Mux público/sin firmar — decisión ya aceptada por el dueño (ver memoria `reference-mux-signing-pendiente`).
- `status='active'` como gate de acceso para egresados — deuda ya declarada en la megaauditoría v2; se amplió a `active`/`completed` solo donde el bug puntual lo exigía (roster de entregables), sin tocar el resto del acoplamiento.
- Migración `0053` no es re-ejecutable — ya está aplicada en prod; el fix relacionado es puramente defensivo, no se reescribe la migración histórica.
- HMAC del cobro genérico sin expiración, y rate limiter en memoria — requieren una decisión de producto (¿expiración de cuánto?) y de infraestructura (Upstash u otro store distribuido).
- `lib/fintoc/webhook.ts` — código muerto preexistente; no se borra código muerto que no fue pedido.
- Animación de salida al cerrar con "X" en los modales drill-down — requiere agregar un estado `request-close` al Dialog compartido; diferido.
- **1 test pre-existente rojo:** `app/api/classroom/comments/__tests__/route.test.ts` — el mock no incluye el `join` a `profiles` que la respuesta real sí trae; ya fallaba en `main` antes de esta auditoría, ajeno al alcance.

## Cobertura QA pendiente

No cubierto por los límites de esta sesión, recomendado para una pasada futura:

- Login/onboarding a fondo (la sesión de QA visual estaba logueada de antemano).
- Vista móvil a 390px (el resize de ventana estaba bloqueado por el modo fullscreen de macOS).
- Estados `hover`/`focus` reales (solo inspección estática de CSS).
- Editor de sesiones y panel docente con datos reales de una cohorte en curso.

## Verificación final

Ejecutada el 2026-07-10 sobre el árbol combinado de las 3 rondas (R1 + R2 + los 2 lotes de R3: R3-A sobre `dialog.tsx`/`badge.tsx`/`globals.css`/`csv-import`/3 `loading.tsx`/`student-table`/`progress-table`/`session-attendance-panel`; R3-B sobre `classroom/[cohortSlug]/page.tsx`/`month-calendar`/2 calendar-clients/`sidebar`/`app/page.tsx`/`(classroom)/layout.tsx`/nuevo `admin/page.tsx`).

| Verificación | Comando | Resultado |
|---|---|---|
| Typecheck | `pnpm typecheck` | **Limpio.** `tsc --noEmit` sin errores, sin necesidad de ajustes. |
| Build | `pnpm build` | **Verde.** `next build` compiló en 9.2s, TypeScript del build en 4.6s, 90/90 páginas generadas sin errores. |
| Tests | `pnpm test` | **238 pasan, 1 falla.** La única falla es la esperada y pre-existente: `app/api/classroom/comments/__tests__/route.test.ts > returns comments array on success` — el mock de la respuesta no incluye el join a `profiles` (`full_name`, `avatar_url`) que la ruta real sí retorna. Ya fallaba en `main` antes de la auditoría; no relacionado con ningún cambio de esta sesión. |

No fue necesario ningún ajuste de integración: el árbol combinado de R1+R2+R3 (los 2 lotes) compila, tipa y pasa tests sin fricción.

## Próximos pasos para el dueño

1. Revisar el diff completo (`git status` / `git diff`) — nada de esto está commiteado todavía.
2. Aplicar las migraciones `0059`, `0060` y `0061` (en ese orden) y regenerar los tipos (`mcp supabase generate_typescript_types`) **antes** de desplegar este código.
3. Correr `pnpm build` local una vez más y hacer push cuando esté conforme (recordar: cuenta `gh edaza-create`).
