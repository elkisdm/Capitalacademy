# Code Map — Capitalacademy

> Índice de **dónde vive cada cosa** en este proyecto. Es una PISTA para encontrar
> archivos rápido — verifica siempre contra el código real antes de confiar en una fila.
> El mapa deriva; el código no.
>
> **Mantenimiento automático:** el git post-commit hook detecta cambios estructurales
> (archivos agregados/borrados/renombrados) y deja una nota en `.git/codemap-pending/`.
> Al iniciar la próxima sesión, el agente reconcilia este archivo. `spec-flow` también
> lo actualiza al cerrar cada cambio. No lo edites a mano salvo que quieras corregir algo.
>
> Distinto de: los **ADR** (`docs/adr/`) cuentan el PORQUÉ; este mapa cuenta el DÓNDE.

## Pagos

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/pago/` | Checkout del Diplomado (form + planes/cupones) | `/pago`, `/pago/resultado`, `/pago/gracias` | — |
| `app/pago/liderazgo/` | Inscripción del Programa de Liderazgo (Flow, cuotas + código lanzamiento) | `/pago/liderazgo` | — |
| `app/api/pago/liderazgo/checkout/route.ts` | Inicia checkout Flow de Liderazgo; computa monto server-side | `POST /api/pago/liderazgo/checkout` | — |
| `lib/programs/liderazgo.ts` | Config de Liderazgo: planes (normal/lanzamiento), código, schema, labels | — | — |
| `app/pago/cobro/` | Cobro genérico de monto firmado (HMAC) vía Flow | `/pago/cobro?monto=&sig=` | — |
| `app/(admin)/admin/cobros/` | Generador admin de links de cobro firmados (gateado por rol) | `/admin/cobros?monto=` | — |
| `app/api/pago/checkout/route.ts` | Inicia checkout del Diplomado (Flow/Fintoc) | `POST /api/pago/checkout` | — |
| `app/api/pago/cobro/route.ts` | Inicia cobro genérico; re-verifica firma del monto | `POST /api/pago/cobro` | — |
| `app/api/pago/cupon/route.ts` | Valida cupones de descuento | `POST /api/pago/cupon` | — |
| `app/api/flow/webhook/route.ts` | Confirma pago Flow vía getStatus + email confirmación | `POST /api/flow/webhook` | — |
| `lib/flow/` | Cliente Flow: `createFlowCheckout` (acepta `amountOverride`/`subjectOverride`), firma HMAC, status | — | — |
| `lib/fintoc/` | Schema de form del checkout (aún importado en la ruta de pago) | — | — |
| `lib/cobro/sign.ts` | Firma/verifica el monto del cobro genérico (HMAC-SHA256) | — | — |
| `lib/cobro/plans.ts` | Planes de cuotas del cobro (factor de recargo contado/6/12) + `resolveCobroAmount` | — | — |
| `lib/payments/invoice.ts` | Boleta/factura del checkout: schema de datos de facturación (jsonb), `invoiceExtension` y `refineInvoice` compartidos por Diplomado y Liderazgo | — | — |
| `lib/payments/provider.ts` | Resuelve el provider activo (`PAYMENT_PROVIDER`) | — | — |
| `scripts/generate-cobro-link.mjs` | Genera enlaces de cobro firmados (hasta tener página admin) | — | — |

## Mensajería / Marketing

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `scripts/whatsapp-submit-template.mjs` | Submitea/lista plantilla MARKETING en Meta (Cloud API); sube el brochure vía Resumable Upload para el header DOCUMENT | `--list` / `--submit` | — |
| `scripts/send-diplomado-whatsapp.mjs` | Envío masivo de la plantilla `diplomado_4ta_gen_captacion` a la base externa (dry-run, throttle, idempotente) | `--send` | — |
| `docs/marketing/telefonos-bd-externa.csv` | Base externa Diplomado 4ª gen: 169 teléfonos E.164 (canal WhatsApp) | — | — |
| `scripts/send-test-brevo.mjs` | Envío de prueba del correo (Brevo transaccional); el blast masivo va por dashboard Brevo | — | — |
| `scripts/send-novedades-alumnos.mjs` | Envío one-off por Resend del correo de novedades (2026-07-12) a alumnos activos, segmentado por programa; idempotente vía log local | `--list` / `--dry-run` / `preview` / `send` | — |
| `scripts/send-encuesta-ia.mjs` | Envío one-off de la encuesta de diagnóstico de IA (2026-07-22) a alumnos activos por programa; idempotente vía log local | `--list` / `--dry-run` / `preview` / `send` | — |
| `scripts/send-encuesta-feedback-clase-ia.mjs` | Envío one-off de la encuesta ANÓNIMA de feedback post-clase de IA (2026-07-22); correo personalizado, formulario sin identificador | `--list` / `--dry-run` / `preview` / `send` | — |
| `scripts/export-class-planning-context.mjs` | Snapshot sanitizado para planificación docente (sin transcripciones completas ni IDs de alumnos), hacia `../capital-context/academia/snapshots` | `--out-dir` | — |

## Comunicaciones (correos masivos)

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `db/migrations/0082_email_campaigns.sql` | `email_campaigns` (mensaje + audiencia) y `email_campaign_recipients` (bitácora por destinatario) + RLS solo-lectura para staff | — | 0026, 0020 |
| `lib/email/layout.ts` | Shell de correo compartido (`emailShell`/`emailButton`/`emailGreeting`), con acento por entorno desde `lib/programs/registry.ts`. Las 4 plantillas previas siguen con su `shell()` propio | — | 0026 |
| `lib/email/markdown.ts` | Subset Markdown → HTML email-safe con estilos inline (+ versión texto); escapa HTML y limita enlaces a http/https/mailto | — | 0026 |
| `lib/email/campaign.ts` | `buildCampaignEmail`: arma el comunicado (saludo, cuerpo Markdown, CTA opcional) sin enviarlo | — | 0026 |
| `lib/campaigns/audience.ts` | `resolveAudience`: alumnos por programa/cohorte/estado/segmento; excluye staff (`profiles.role`) y deduplica por correo | — | 0026 |
| `lib/campaigns/send.ts` | `sendEmailCampaign`: reclamo atómico → bitácora → `sendEmailBatch` → estado terminal solo sin fallos | — | 0026, 0020 |
| `app/api/admin/campaigns/route.ts` · `[campaignId]/route.ts` | CRUD de campañas; PATCH/DELETE dan 409 sobre una campaña ya enviada | `GET/POST/PATCH/DELETE /api/admin/campaigns` | 0026 |
| `app/api/admin/campaigns/[campaignId]/send/route.ts` | Dispara el envío real (idempotente por bitácora) | `POST /api/admin/campaigns/[id]/send` | 0026 |
| `app/api/admin/campaigns/[campaignId]/test/route.ts` | Correo de prueba a la casilla del equipo (`CAMPAIGN_TEST_EMAIL`) + copia al autor; destinos limitados a cuentas ops/admin (no es un relay) y omite dominios sin MX (`capitalacademy.cl`) | `POST /api/admin/campaigns/[id]/test` | 0026 |
| `app/api/admin/campaigns/audience/route.ts` | Conteo de destinatarios previo al envío + muestra corta | `GET /api/admin/campaigns/audience` | 0026 |
| `app/(admin)/admin/comunicaciones/` · `components/admin/comunicaciones/campaigns-manager.tsx` | Panel: lista, editor Markdown, conteo de audiencia en vivo, prueba y confirmación de envío | `/admin/comunicaciones` | 0026 |

## Encuestas (federadas con capital-admin/hclp)

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `db/migrations/0083_survey_campaigns.sql` | `survey_campaigns` (envío + enlace al motor remoto, sin FK) y `survey_campaign_recipients` (bitácora, canal email/whatsapp) | — | 0026 |
| `lib/surveys/config.ts` | Credenciales cruzadas por capacidad (`create`/`enroll`/`results`) y `SurveysNotConfiguredError` → 503 nombrando la variable faltante | — | 0026 |
| `lib/surveys/questions.ts` | Tipos y schema Zod de pregunta (subset del contrato de capital-admin) + `toRemoteQuestions` | — | 0026 |
| `lib/surveys/remote.ts` | Los 3 contratos remotos: crear (service_role al Supabase compartido), enrolar (ingesta de hclp) y leer resultados (API externa Bearer) | — | 0026 |
| `lib/surveys/send.ts` | `sendSurveyCampaign`: anónima → Resend propio con enlace idéntico (`assertAnonymousUrl`); identificada → delega en hclp (correo + WhatsApp) | — | 0026, 0020 |
| `lib/email/survey-invitation.ts` | Invitación branded a una encuesta ANÓNIMA; nunca concatena identificador a la URL | — | 0026 |
| `app/api/admin/surveys/route.ts` | Lista encuestas + estado de configuración; POST crea primero en el motor remoto y luego la campaña local | `GET/POST /api/admin/surveys` | 0026 |
| `app/api/admin/surveys/[campaignId]/send/route.ts` · `results/route.ts` | Envío idempotente; resultados leídos al vuelo (en modo anónimo solo el conteo, nunca el detalle por persona) | `/api/admin/surveys/[id]/{send,results}` | 0026 |
| `app/(admin)/admin/encuestas/` · `components/admin/encuestas/{surveys-manager,question-editor}.tsx` | Panel: editor de preguntas (escala/opción/texto/NPS/separador), modo anónimo o identificado, envío y resultados | `/admin/encuestas` | 0026 |

## Acceso / Onboarding

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `lib/programs/registry.ts` | Registro de identidad por entorno (marca/acento/copy/paths) keyed por slug; helpers `getBrandBySlug`/`getBrandByProgramId`/`loginPath`/`onboardingSetPasswordPath` | — | — |
| `app/(auth)/login/login-screen.tsx` | Pantalla de login branded (compartida genérico + por entorno) | — | — |
| `app/(auth)/login/page.tsx` | Login genérico (marca Capital Academy) | `/login` | — |
| `app/(auth)/login/[programa]/page.tsx` | Login branded por entorno | `/login/diplomado`, `/login/workshop`, `/login/liderazgo` | — |
| `app/onboarding/set-password/` | Set-password genérico (canjea invitación, branding por prop) | `/onboarding/set-password` | — |
| `app/onboarding/[programa]/set-password/page.tsx` | Set-password branded por entorno | `/onboarding/<slug>/set-password` | — |
| `app/(onboarding)/onboarding/complete-profile/` | Complete-profile genérico; deriva la marca desde la matrícula del usuario | `/onboarding/complete-profile` | — |
| `app/(onboarding)/onboarding/[programa]/complete-profile/page.tsx` | Complete-profile branded por slug | `/onboarding/<slug>/complete-profile` | — |
| `lib/classroom/access.ts` | Gate de acceso al classroom: matrícula activa, rol staff (admin/ops), o docente/asistente (`cohort_roles`) de esa cohorte, todos sin matrícula | — | 0004, 0013 |
| `lib/supabase/middleware.ts` | Whitelist de rutas públicas (incl. set-password genérico y branded) | — | — |
| `app/auth/confirm/route.ts` | Verifica OTP de invitación/recovery y redirige al `next` (branded por entorno) | `/auth/confirm` | — |
| `lib/classroom/enroll-from-payment.ts` | Matrícula + onboarding branded del comprador del Diplomado (link a `/onboarding/diplomado/set-password`) | — | — |

## Calendario / Sesiones

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/(admin)/admin/cohorts/[cohortId]/sesiones/` | Editor admin del calendario de la cohorte (crear/editar/eliminar sesiones, lista o calendario) | `/admin/cohorts/[cohortId]/sesiones` | 0008 |
| `app/api/admin/sessions/route.ts` · `[sessionId]/route.ts` | CRUD de sesiones de clase de una cohorte | `POST/PATCH/DELETE /api/admin/sessions` | 0008 |
| `app/api/admin/session-resources/route.ts` · `upload-url/route.ts` | Recursos de una sesión: link o **archivo subido** (≤50MB, bucket privado `lesson-resources`); DELETE limpia el objeto; gateado por `requireSessionStaff` (staff o docente de esa cohorte) | `/api/admin/session-resources` | 0008, 0013 |
| `components/admin/session-resources-panel.tsx` | UI de material de la clase (subir/enlazar/borrar recurso); extraído de `sessions-manager-client.tsx` para reusarlo en el panel del profesor | — | 0013 |
| `components/admin/session-delete-dialog.tsx` | Confirmación de borrado de una sesión: lista la cascada real (asistencia, repetición/Mux, recursos, quiz) antes de eliminar | — | — |
| `app/api/admin/enrollment-segment/route.ts` | Asignación manual del segmento "Capital Inteligente" a una matrícula | `/api/admin/enrollment-segment` | 0008 |
| `components/admin/segment-toggle.tsx` | Toggle admin del segmento de un alumno | — | 0008 |
| `app/(classroom)/classroom/[cohortSlug]/calendario/` | Calendario de clases del alumno (vista lista + mes, recursos por sesión, CTA "Responder quiz" si la sesión tiene evaluación `scope='session'` activa) | `/classroom/[cohortSlug]/calendario` | 0008 |
| `components/classroom/month-calendar.tsx` | Vista de mes del calendario (a11y, chips por sesión); renderiza sobre `lib/calendar/month-grid.ts`, la usan el alumno y `/admin/calendario` | — | 0008 |
| `lib/calendar/month-grid.ts` | Grilla del mes como función pura: `dayKeyOf` (día en hora de Chile, fuente única), `groupByDay`, `buildMonthCells` (las celdas de relleno traen sus sesiones), `toWeeks` | — | — |

## Recordatorios / Cron

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/api/cron/session-reminders/route.ts` | Endpoint que envía recordatorios de clase próximos (gateado por `CRON_SECRET`) y detecta inasistencias (`processAbsenceAlerts`) | `POST /api/cron/session-reminders` | 0008, 0013 |
| `netlify/functions/session-reminders-cron.mjs` | Netlify Scheduled Function (`*/30`) que invoca el endpoint de recordatorios | — | 0008 |
| `lib/classroom/recording-notifications.ts` | Dispatch en dos fases (reserva→completado) del aviso "grabación disponible" (genérico y follow-up CAP-CI), reconciliable por el cron ante crash a mitad del envío | — | — |
| `app/api/cron/recording-notifications/route.ts` | Cron de reconciliación: reintenta notificaciones de grabación cuya reserva quedó sin completar | `GET/POST /api/cron/recording-notifications` | — |
| `netlify/functions/recording-notifications-cron.mjs` | Netlify Scheduled Function que invoca el cron de reconciliación de notificaciones de grabación | — | — |
| `lib/api/cron-auth.ts` | `authorizeCron`: valida el header `Authorization: Bearer <CRON_SECRET>` (timing-safe) para los endpoints de cron | — | — |
| `lib/email/recording-available.ts` | Correo "grabación disponible" al publicarse la repetición de una clase en vivo (todo programa salvo CAP-CI) | — | — |
| `lib/email/` | Correos transaccionales (Resend): `invitation`, `diplomado-invitation`, `payment-confirmation`, `session-reminder`, `certificate`, `capacitacion-emails` (recordatorios + follow-up del ciclo CAP-CI), `attendance-warning` (alerta de inasistencias, brandeada por entorno) | — | 0013 |

## Clases en vivo (LiveKit)

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `infra/livekit/` | Imagen del servidor LiveKit autoalojado en Railway (Dockerfile + entrypoint que arma la config). El medio va por UDP; NO fijar `node_ip` a la IP del TCP Proxy | — | 0031 |
| `lib/livekit/config.ts` | Credenciales (`LIVEKIT_URL/API_KEY/API_SECRET`) con error tipado que nombra la variable faltante → 503 | — | 0031 |
| `lib/livekit/token.ts` | Firma **pura** del JWT HS256 de acceso (`node:crypto`, sin SDK). El token ES la autorización: LiveKit no consulta nada más | — | 0031 |
| `lib/livekit/access.ts` | Decisión **pura** de acceso a la sala: modalidad en vivo, cohorte, matrícula/staff, ventana (−30/+120 min) y grants. La sala se deriva del id de sesión, nunca del cliente | — | 0031 |
| `app/api/classroom/clase/[sessionId]/token/route.ts` | Emite el token del participante. Deriva cohorte y sala de la sesión; el nombre visible sale del perfil. 10/min por usuario | `POST /api/classroom/clase/[sessionId]/token` | 0031 |
| `lib/livekit/room-state.ts` | Lógica **pura** de la pantalla: mensajes por estado de conexión y traducción de los rechazos del token | — | 0031 |
| `components/classroom/live/live-class-room.tsx` | Sala embebida del alumno. El interior lo pone `<VideoConference />` de `@livekit/components-react` (pantalla compartida, chat, grilla paginada, dispositivos); tematizado con `.ca-live-room` en `globals.css`. El token se pide al pulsar "Entrar", no al montar | en `/classroom/[cohortSlug]/clase/[sessionId]` | 0031 |
| `lib/security/csp.ts` | CSP y Permissions-Policy del sitio, fuera de `next.config.ts` para poder testearlos: un origen que falta no rompe el build ni los tests, solo la función en producción | — | 0031 |

## Asistencia (QR)

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/asistencia/[sessionId]/` | Página **pública** de check-in por QR: valida matrícula, redirige a login branded, muestra estado de la ventana (abre/abierto/expirado) y registra asistencia (page + Server Action `checkin-action` + client) | `/asistencia/[sessionId]` | 0013 |
| `lib/asistencia/checkin.ts` | Lógica **pura** de decisión del check-in (`evaluateCheckin`: sesión→matrícula→ventana→registro); la Server Action la envuelve | — | — |
| `lib/asistencia/window.ts` | Ventana temporal válida (20 min antes / 30 después) y `getWindowState` (`before`/`open`/`closed`) | — | 0013 |
| `lib/asistencia/queries.ts` | Reportería de asistencia + marcado/desmarcado manual (service_role) + `getStudentsAtAbsenceThreshold` (conteo de inasistencias para el cron) | — | 0013 |
| `db/migrations/0054_attendance_alerts.sql` | Bitácora idempotente de correos de alerta de inasistencia (`unique student+cohort+kind`) | — | 0013 |
| `app/api/admin/sessions/[sessionId]/attendance/route.ts` | GET reporte · POST marcar · DELETE desmarcar (gateado por `requireSessionStaff`: staff o docente/asistente de esa cohorte) | `/api/admin/sessions/[sessionId]/attendance` | 0013 |
| `app/api/admin/sessions/[sessionId]/attendance/bulk/route.ts` | Marca o quita, en un solo round-trip, la asistencia de varios alumnos a la vez | `POST /api/admin/sessions/[sessionId]/attendance/bulk` | 0013 |
| `components/admin/session-qr.tsx` | QR imprimible por sesión para el PPT del docente (admin) | — | — |
| `components/admin/session-attendance-panel.tsx` | Reportería + toggle de marcado manual en el editor de sesión | — | — |
| `components/admin/session-attendance-button.tsx` | Botón + modal que monta `SessionAttendancePanel` on-demand (patrón `SessionQrButton`) desde la card de la sesión, sin entrar a Editar | — | — |
| `scripts/test-asistencia-e2e.mjs` | E2E autolimpiante del check-in (datos de prueba efímeros contra la BD real) | — | — |

## Panel docente

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/(docente)/layout.tsx` | Layout dedicado del panel (sin `ClassroomSidebar`); gate: platform staff o docente/asistente (`cohort_roles`) en cualquier cohorte | — | 0013 |
| `app/(docente)/docente/page.tsx` · `docente-panel-client.tsx` | Panel de solo lectura: SUS sesiones (próximas/pasadas) con asistencia y material por clase; link a Conversaciones por programa | `/docente` | 0013 |
| `app/(docente)/error.tsx` | Error boundary del panel: pantalla de recuperación en vez de la de error global | — | 0013 |
| `lib/docente/queries.ts` | Lecturas por service-role: `getTeacherCohorts`/`getTeacherSessions`, siempre partiendo de `cohort_roles` del propio usuario | — | 0013 |

## Classroom (alumno)

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/(classroom)/classroom/page.tsx` | Landing del alumno: 1 matrícula→redirect directo, 2+→selector de programas (tarjetas); staff→entorno activo | `/classroom` | — |
| `app/(classroom)/classroom/[cohortSlug]/page.tsx` | Home del programa: módulos + timeline de lecciones | `/classroom/[cohortSlug]` | — |
| `components/classroom/module-accordion.tsx` | Acordeón de temario (server component) de la home del alumno: módulos colapsables con clases, estado y progreso | — | — |
| `app/(classroom)/classroom/[cohortSlug]/[moduleSlug]/page.tsx` | Lista de lecciones del módulo | `/classroom/[cohortSlug]/[moduleSlug]` | — |
| `app/(classroom)/classroom/[cohortSlug]/[moduleSlug]/[lessonSlug]/page.tsx` | Reproductor de lección: video Mux, transcripción, resumen, comentarios y progreso | `…/[lessonSlug]` | — |
| `app/(classroom)/classroom/[cohortSlug]/clase/[sessionId]/page.tsx` | Pantalla de una clase EN VIVO: cabecera (fecha/docente/modalidad), **repetición** (reusa `LessonVideoSection` con la lección `recorded` enlazada), material y quiz de la sesión. Entrada desde la lista de clases del módulo | `/classroom/[cohortSlug]/clase/[sessionId]` | 0041 |
| `components/classroom/class-material.tsx` · `class-transcript-panel.tsx` | Material y transcripción de la pantalla de clase en vivo: `ClassMaterial` lista los recursos con acciones Ver (visor in-app) y Descargar; `ClassTranscriptPanel` es el drawer de transcripción sin sidebar de playlist (a diferencia de `CollapsiblePlaylist`) | en `…/clase/[sessionId]` | — |
| `components/classroom/document-viewer.tsx` · `lib/classroom/resource-viewer.ts` | Visor de documentos in-app: PDF con render propio (`pdf.js`) y Office (ppt/word/excel) vía Microsoft Office Online; `detectViewerKind` decide el modo por extensión y nunca renderiza HTML/SVG inline (se degrada a descarga forzada, por seguridad) | — | — |
| `app/(classroom)/classroom/[cohortSlug]/docente/[instructorId]/page.tsx` | Ficha del docente que ve el alumno: foto, titular, reseña y redes. La RLS (`instructors_program_scoped_select`, 0059) exige que el docente dicte en el programa del alumno, así que NO es una página abierta a internet | `/classroom/[cohortSlug]/docente/[instructorId]` | 0028 |
| `lib/instructors/queries.ts` · `types.ts` | Lectura de fichas docentes con guard de UUID; puente `profiles.id`→`instructors.id` para enlazar la card "Profesor" del módulo. Relanza los fallos de infraestructura en vez de disfrazarlos de 404 | — | 0028 |
| `lib/instructors/social.ts` | Normaliza y valida las URLs de redes: exige `https://` (bloquea `javascript:`/`data:`) y deja el valor en la forma que exige el CHECK de la 0086 | — | 0028 |
| `components/classroom/tour/guided-tour.tsx` | Tour guiado del alumno: componente propio (`createPortal` + `useFocusTrap`), sin dependencias externas. Cierra con `Esc` o clic en el fondo | montado en `/classroom/[cohortSlug]` | 0030 |
| `lib/tour/steps.ts` · `position.ts` · `start.ts` · `types.ts` | Guion del tour como datos, geometría del foco como funciones puras y `resolveTourStart` (falla CERRADO si no se puede leer el estado, para no dispararlo a toda la matrícula) | — | 0030 |
| `app/api/classroom/tour/route.ts` | Persiste `profiles.tour_completed_at` / `tour_outcome` con el cliente del usuario (bajo `profiles_update_own`), nunca con service_role | `POST /api/classroom/tour` | 0030 |
| `components/classroom/actividad-tracker.tsx` · `lib/classroom/use-actividad-tracker.ts` | Latido de presencia del alumno montado en el layout del classroom; se detiene cuando la pestaña deja de estar visible y degrada en silencio si el endpoint falla | — | 0029 |
| `app/api/classroom/actividad/route.ts` | Recibe el latido. El cuerpo NO lleva segundos: el incremento lo deriva la base. Limitado a 40/min por usuario | `POST /api/classroom/actividad` | 0029 |
| `lib/classroom/actividad.ts` | Helpers puros del día calendario de Chile y clasificación de riesgo por inactividad | — | 0029 |
| `app/(classroom)/classroom/profile/page.tsx` | Perfil editable del alumno (foto, RUT, cumpleaños) | `/classroom/profile` | — |
| `app/api/classroom/profile/route.ts` | Actualización PARCIAL del perfil (editor inline campo por campo); a diferencia de onboarding, full_name/phone/rut son opcionales | `PATCH /api/classroom/profile` | — |
| `app/(classroom)/classroom/[cohortSlug]/recursos/page.tsx` | Centro de recursos del programa: reúne el material de clases grabadas y en vivo | `/classroom/[cohortSlug]/recursos` | — |
| `app/api/classroom/resources/[id]/url/route.ts` | Firma signed URLs frescas al clic para recursos de lección/sesión con gate por tenant | `GET /api/classroom/resources/[id]/url` | — |
| `app/(classroom)/classroom/guia/page.tsx` · `guia/[slug]/page.tsx` | Centro de ayuda: índice con buscador + página por tema, tres audiencias (alumno/profesor/equipo) según `visibleAudiences`; `lib/guide/content.tsx` es el barrel que compone `lib/guide/articles/{student,teacher,team}.tsx` (tipos en `types.ts`, categorías en `categories.ts`) | `/classroom/guia`, `/classroom/guia/[slug]` | 0025 |
| `lib/guide/audience.ts` | `visibleAudiences({isStaff, isTeacher})`: pestañas visibles del Centro de Ayuda como capacidades del espectador, no roles excluyentes | — | 0025 |
| `lib/guide/pdf.ts` · `app/api/guia/profesor/pdf/route.ts` | `buildGuidePdf`: arma la guía del profesor en PDF al vuelo desde `articlesByAudience("teacher")` con `pdf-lib`/`StandardFonts` (sin fontkit, sin leer archivos); la ruta gatea staff/docente (403 a un alumno) y descarga directa sin Storage | `GET /api/guia/profesor/pdf` | 0025 |
| `components/classroom/guide/guide-index-client.tsx` · `support-card.tsx` | Índice de ayuda (buscador/categorías/CTA de descarga del PDF en la pestaña de profesor) + tarjeta de soporte (mensaje + adjuntos) | — | — |
| `app/api/support/route.ts` · `lib/email/support-request.ts` | Soporte in-app: recibe mensaje + adjuntos y los envía por correo al equipo | `POST /api/support` | — |
| `components/classroom/mark-complete-button.tsx` · `resource-list.tsx` | Botón "marcar completada" y grilla de materiales (descarga con URL firmada + acción "Ver" con visor in-app `document-viewer`) | — | — |
| `components/classroom/` | UI del classroom: `video-player`, `sidebar`, `comment-section`, `transcript-panel`, `summary-card`, `quiz-*`, `collapsible-playlist` | — | — |
| `components/classroom/comment-section.tsx` | Comentarios de lección: 1 nivel de respuesta, edición propia ("(editado)"), moderación (staff borra comentarios ajenos), badge Profesor/Equipo, timestamps `mm:ss` clicables que saltan el video (`onSeek`), linkify, paginación "cargar más" | — | 0014 |
| `app/(classroom)/classroom/go/thread/[threadId]/page.tsx` · `go/lesson/[lessonId]/page.tsx` | Rutas neutras de redirección: resuelven `program_id` del hilo/lección → cohorte del viewer con acceso (matrícula, teacher/assistant o admin/ops) → `redirect()` a la URL real, o `notFound()`. Único mecanismo para los enlaces de campana y correo (foro y lección), evita 404 cross-programa/cross-cohorte | `/classroom/go/thread/[id]`, `/classroom/go/lesson/[id]` | 0014 |
| `lib/classroom/resolve-viewer-cohort.ts` | `resolveViewerCohortForProgram`: dado un `programId`, resuelve una cohorte donde el viewer tenga acceso (matrícula active/completed → docente/asistente → staff transversal), sin distinguir "no existe" de "sin acceso"; usado por las rutas `classroom/go/*` | — | 0014 |
| `lib/notifications/lesson-comment.ts` | `notifyLessonComment`: notifica (campana + correo, admin client) respuestas y comentarios nuevos de lección — `lesson_reply` al autor del padre, `lesson_comment_new` a los docentes/asistentes del programa; cooldown de correo de 1h por usuario/lección | — | 0014 |
| `lib/profiles/program-staff.ts` | `getProgramStaffIds`: resuelve el set de `user_id` staff de un programa (`cohort_roles` teacher/assistant + admin/ops transversal), para overlayar el badge "Profesor/Equipo" sobre `getPublicAuthorsMap` | — | 0014 |
| `lib/classroom/queries.ts` · `admin-queries.ts` | Lecturas de módulos/lecciones/progreso (alumno y admin); `getModulesWithLessons` excluye del playlist las lecciones-repetición de clases en vivo; `getSessionForStudent` arma la pantalla de clase | — | — |
| `lib/classroom/progress.ts` · `use-video-progress.ts` | Tracking granular de progreso de video | — | — |
| `lib/classroom/resolve-slugs.ts` | Resuelve slugs legibles ↔ UUIDs (compat retroactiva) | — | — |
| `lib/classroom/verify-enrollment.ts` | Verifica matrícula activa para gating de contenido | — | 0004 |
| `lib/classroom/staff-preview.ts` | Resuelve el cohorte que el staff previsualiza en "Ver como Alumno": el del entorno activo del switcher, no su matrícula (usado por `/classroom` y el layout) | — | — |
| `lib/profiles/public-authors.ts` | Resuelve el "autor público" (solo id/nombre/avatar) por service-role para foro y comentarios; la policy de `profiles` está cerrada a dueño+staff (0045) para no exponer PII | — | 0045 |
| `app/api/classroom/{progress,comments,transcript,summary,avatar}/route.ts` | Endpoints del alumno: progreso, comentarios, transcripción, resumen, avatar | — | — |
| `app/api/classroom/transcript-content/route.ts` | Contenido VTT de la transcripción, con carga diferida (fuera del HTML de la lección) y gate anti-IDOR por matrícula/cohorte | `GET /api/classroom/transcript-content` | — |

## Conversaciones

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `db/migrations/0044_conversaciones.sql` | Tablas threads/comments/reactions + helpers has_program_access/is_program_staff + RLS por programa | — | 0010 |
| `db/migrations/0046`–`0048_*.sql` | Reacciones con emoji, guardados (bookmarks) y notificaciones/menciones del foro | — | 0011 |
| `db/migrations/0057_teacher_panel.sql` | Redefine `has_program_access` para incluir `is_program_staff` (docente/asistente sin matrícula) | — | 0013 |
| `db/migrations/0065`–`0067_*.sql` | Endurecimiento: soft delete + `edited_at` en `lesson_comments`/`conversation_*`, freeze de columnas de sistema vía triggers (cierra la fuga cross-tenant del `WITH CHECK` de threads), policy `UPDATE` en `conversation_reactions`, RLS docente en `lesson_comments`, y generalización de `conversation_notifications` para comentarios de lección (`lesson_reply`/`lesson_comment_new`) | — | 0014 |
| `lib/conversaciones/queries.ts` · `access.ts` | Lecturas del feed por programa + gate | — | 0010 |
| `lib/conversaciones/categories.ts` · `reactions.ts` · `linkify.tsx` | Catálogo de categorías del feed, emojis de reacción permitidos, y auto-enlazado de URLs en comentarios | — | 0010 |
| `app/api/classroom/conversaciones/{route,[threadId],comments,reactions,bookmarks,members,notifications}/route.ts` | CRUD threads/comentarios/reacciones + guardados, miembros para menciones (@) y notificaciones; comentarios y threads soportan edición (`PATCH`, `edited_at`) y soft delete; `notifications` GET calcula `href`/`title` server-side (vía `/classroom/go/*`) para foro y lección, POST acepta `{id}`/`{ids}`/`{all}` | — | 0010, 0014 |
| `app/(classroom)/classroom/[cohortSlug]/conversaciones/{page,[threadId]/page}.tsx` | Feed + detalle del hilo | `/classroom/[cohortSlug]/conversaciones`, `/classroom/[cohortSlug]/conversaciones/[threadId]` | 0010 |
| `components/classroom/conversaciones/` | thread-list, thread-composer, thread-detail (edición, moderación de comentarios ajenos por staff), reaction-button, notification-bell (campana global con contador + Realtime; consume `href`/`title`/`type` ya resueltos por el servidor — cubre también `lesson_reply`/`lesson_comment_new`, no solo el foro) | — | 0010, 0014 |
| `lib/email/conversacion-notification.ts` | Correo de aviso por respuesta o mención en el foro, y por respuesta/comentario nuevo en una lección (`lesson_reply`/`lesson_comment_new`) | — | 0011, 0014 |

## Entregables

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `db/migrations/0053_entregables.sql` | Bucket privado `deliverables` + tablas `deliverables` (tarea, program-scoped) y `deliverable_submissions` (1 fila = 1 archivo) + RLS con has_program_access/is_program_staff. No aplicada a prod en este ciclo | — | — |
| `lib/deliverables/file-types.ts` | Categorías de archivo permitidas (pdf/word/excel/image), `extensionAllowed`, labels | — | — |
| `lib/deliverables/storage.ts` | Firma en lote las URLs de descarga de entregas (bucket privado `deliverables`) | — | — |
| `lib/deliverables/notify.ts` | `notifyDeliverableOpen`: correo de apertura idempotente (reserva `open_notified_at` antes de enviar) | — | — |
| `lib/email/deliverable-open.ts` | Correo "Ya puedes subir: <título>" al abrirse la ventana de un entregable | — | — |
| `lib/email/deliverable-received.ts` | Correo de confirmación al alumno al recibirse su archivo de entrega | — | — |
| `app/api/admin/deliverables/route.ts` · `[deliverableId]/route.ts` · `[deliverableId]/submissions/route.ts` | CRUD admin de entregables + roster de entregas por programa (con URLs firmadas) | `GET/POST/PATCH/DELETE /api/admin/deliverables` | — |
| `app/api/classroom/deliverables/upload-url/route.ts` · `route.ts` | Subida del alumno: signed upload URL (valida matrícula/ventana/tipo/tamaño) + persistencia de la entrega | `POST /api/classroom/deliverables*` | — |
| `app/api/cron/deliverable-openings/route.ts` · `netlify/functions/deliverable-openings-cron.mjs` | Cron (`*/30 min`) que notifica aperturas futuras de entregables pendientes | `POST /api/cron/deliverable-openings` | — |
| `app/(admin)/admin/deliverables/page.tsx` · `components/admin/deliverables/deliverables-manager.tsx` | Panel admin: crear/editar/eliminar entregables y ver quién entregó | `/admin/deliverables` | — |
| `app/(classroom)/classroom/[cohortSlug]/entregables/page.tsx` · `components/classroom/deliverables/deliverable-card.tsx` | Pantalla del alumno: sube/reemplaza sus archivos dentro de la ventana de cada tarea | `/classroom/[cohortSlug]/entregables` | — |

## Quiz & Certificación

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/api/admin/evaluations/route.ts` · `[evaluationId]/route.ts` | CRUD de evaluaciones por clase (final/módulo/lección): crear con seguridad de tenant, listar por programa, editar config/activar, borrar (guard de intentos) | `GET/POST/PATCH/DELETE /api/admin/evaluations` | — |
| `lib/classroom/quiz-question-schema.ts` | Validación zod del payload de pregunta por tipo + `payloadToDbFields` (compartido por la API admin) | — | — |
| `components/admin/quiz/question-draft.ts` · `question-editor.tsx` | Borrador editable de pregunta (4 tipos, N opciones) + editor UI dinámico, reusado por `add-question-form` y `question-card` | — | — |
| `components/admin/quiz/lesson-quiz-panel.tsx` | Panel embebido en el editor de lección: crea (si no existe) la evaluación `scope='lesson'` y delega su gestión en `evaluation-panel` | en `/admin/lessons/[lessonId]` | — |
| `lib/admin/evaluation-list.ts` | Helper puro: agrupa evaluaciones por módulo (final primero, "Otras evaluaciones" al final), etiquetas de scope/kind y qué targets ya están tomados (para deshabilitarlos en el modal de creación) | — | 0022 |
| `app/(admin)/admin/evaluaciones/*` | Sección de primer nivel: lista agrupada por módulo (`page.tsx` + `evaluations-list-client.tsx`), modal de creación independiente (`new-evaluation-dialog.tsx`) y pantalla de configuración por evaluación (`[evaluationId]/page.tsx` + `evaluation-detail-client.tsx`), que reusa `evaluation-panel` | `/admin/evaluaciones` · `/admin/evaluaciones/[evaluationId]` | 0022 |
| `components/admin/quiz/evaluation-panel.tsx` | Gestor genérico de UNA evaluación (cualquier scope) en 4 pestañas (Preguntas colapsables · Ajustes · Respuestas · Notas); activar/desactivar, compartir, borrado seguro; reusado por `lesson-quiz-panel`, `session-quiz-panel` y la pantalla de configuración de `/admin/evaluaciones` | — | — |
| `components/admin/quiz/evaluation-settings.tsx` | Pestaña "Ajustes": edita config (intentos, % aprobación, preguntas por intento, tiempo) vía PATCH de la evaluación | — | — |
| `components/admin/quiz/evaluation-attempts.tsx` | Pestaña "Respuestas": intentos de la evaluación + drill-down pregunta a pregunta (respuesta del alumno vs correcta) | — | — |
| `components/admin/quiz/session-quiz-panel.tsx` | Panel embebido en el editor de sesiones: crea (si no existe) la evaluación `scope='session'` ligada a la clase en vivo y delega en `evaluation-panel` | en `/admin/cohorts/[id]/sesiones` | — |
| `app/api/admin/evaluations/[evaluationId]/attempts/route.ts` | Intentos de UNA evaluación + desglose server-side (reusa `scoreAnswer`) para la pestaña Respuestas | `GET /api/admin/evaluations/[id]/attempts` | — |
| `components/admin/quiz/share-quiz-dialog.tsx` | Diálogo de compartir: enlace deep-link + QR (`qrcode`) hacia `/classroom/quiz/[evaluationId]` | — | — |
| `app/api/admin/evaluations/targets/route.ts` | Módulos, lecciones (con flag `isRecording` para repeticiones) y clases en vivo del programa para los selectores de creación de evaluaciones | `GET /api/admin/evaluations/targets` | — |
| `app/api/classroom/quiz/route.ts` | Estado/gating del quiz del alumno (locked/ready/passed); NO entrega preguntas | `GET /api/classroom/quiz` | — |
| `app/api/classroom/quiz/start/route.ts` | Inicia/reanuda intento: persiste `questions_presented` server-side (ancla anti-bypass) | `POST /api/classroom/quiz/start` | — |
| `app/api/classroom/quiz/submit/route.ts` | Cierra el intento y puntúa sobre el set persistido (cierra el bypass de certificación); el final lee config de `evaluations(scope='final')` | `POST /api/classroom/quiz/submit` | — |
| `app/api/classroom/evaluation/{route,start,submit}/route.ts` | Flujo del alumno para quizzes FORMATIVOS por clase (estado/iniciar/enviar): anti-bypass por evaluación, puntúa con `scoreAnswer`, sin certificado ni gate de completitud | `GET/POST /api/classroom/evaluation*` | — |
| `lib/classroom/evaluation-access.ts` | Resuelve acceso del alumno a una evaluación (activa + matrícula activa); compartido por los 3 endpoints formativos | — | — |
| `components/classroom/evaluation/evaluation-runner.tsx` · `question-input.tsx` | Runner formativo (intro→en curso→resultado) + input por tipo; embebido al final de la lección | en `…/[lessonSlug]` | — |
| `lib/classroom/quiz-question-schema.ts` | Validación zod del payload de pregunta por tipo + `payloadToDbFields` | — | — |
| `lib/classroom/quiz-runtime.ts` | Helpers server del quiz: completitud, selección/rehidratación (por programa y por evaluación), y `scoreAnswer` por tipo (single/multiple/true_false/short_answer) | — | — |
| `db/migrations/0033_evaluations.sql` · `0040_evaluations_session_scope.sql` | Tabla `evaluations` (quiz por alcance final/módulo/lección) + tipos de pregunta en `quiz_questions` (`question_type`/`correct_answer`) + `evaluation_id` en `quiz_attempts`; 0040 agrega `scope='session'` + `session_id`→`class_sessions` | — | — |
| `db/migrations/0073_quiz_attempts_readonly_for_students.sql` | Cierra el fraude de certificación (megaauditoría 16-jul, hallazgo C1): la policy del alumno sobre `quiz_attempts` pasa de `FOR ALL` (sin `WITH CHECK`) a `FOR SELECT`, y se revoca INSERT/UPDATE/DELETE a `authenticated`/`anon`; solo `service_role` escribe intentos | — | — |
| `app/(classroom)/classroom/[cohortSlug]/quiz/page.tsx` · `components/classroom/quiz-runner.tsx` | Página del alumno para rendir el quiz + cliente máquina-de-estados | `/classroom/[cohortSlug]/quiz` | — |
| `app/(classroom)/classroom/quiz/[evaluationId]/page.tsx` | Página standalone de una evaluación por enlace/QR compartible (deep-link autenticado): resuelve acceso y monta `evaluation-runner` | `/classroom/quiz/[evaluationId]` | — |
| `app/(classroom)/classroom/[cohortSlug]/certificado/page.tsx` | Certificado del alumno | `/classroom/[cohortSlug]/certificado` | — |
| `app/api/classroom/certificate/route.ts` · `certificate/retry/route.ts` | Emisión y reintento del certificado | — | — |
| `app/verificar/[code]/page.tsx` · `app/api/verify/[code]/route.ts` | Verificación pública del certificado (página + API) | `/verificar/[code]` | — |
| `lib/certificates/` | Generación del PDF + emisión con QR de verificación | — | — |

## Admin (panel)

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/(admin)/admin/users/` + `[userId]/` | Gestión de usuarios y roles por cohorte (RBAC) | `/admin/users` | 0004 |
| `app/(admin)/admin/docentes/page.tsx` · `components/admin/instructor-edit-form.tsx` | Edición del titular, la reseña y las redes de cada docente. Solo edita: el alta sigue viniendo del seed | `/admin/docentes` | 0028 |
| `app/api/admin/instructors/[instructorId]/route.ts` | PATCH de la ficha docente, con `authorizeAdmin()` antes de leer el cuerpo. Acepta además `profile_id` para enlazar la ficha con una cuenta, que es lo que habilita el autoservicio del docente | `PATCH /api/admin/instructors/[instructorId]` | 0028 |
| `components/admin/instructor-link-account.tsx` | Selector con el que operaciones enlaza una ficha a una cuenta (candidatos: quien tenga rol docente/asistente en alguna cohorte) | en `/admin/docentes` | 0028 |
| `app/(docente)/docente/perfil/page.tsx` · `app/api/docente/perfil/route.ts` | El docente edita SU propia ficha. Resuelve siempre por `instructors.profile_id = auth.uid()`, nunca por un id de la URL; escribe con service_role para acotar las columnas editables sin abrir una policy | `/docente/perfil`, `PATCH /api/docente/perfil` | 0028 |
| `lib/instructors/patch.ts` | Validación y normalización compartida por las dos rutas que editan el perfil docente: fija qué campos son editables (nunca identidad ni estado) | — | 0028 |
| `app/(admin)/admin/actividad/` · `lib/admin/actividad-queries.ts` | Panel de actividad por cohorte: tiempo con la plataforma abierta, días activos e inactividad. La última fecha se busca en TODO el historial (no solo en la ventana del rango), la lectura va paginada para no truncarse en silencio y las matrículas de staff (`system_role` ops/admin) quedan fuera del roster y de los promedios | `/admin/actividad` | 0029 |
| `app/(admin)/admin/cohorts/[cohortId]/` | Detalle de cohorte (info, roster, accesos al calendario) | `/admin/cohorts/[cohortId]` | — |
| `components/admin/assign-participant-modal.tsx` | Modal "Agregar participante" del detalle de cohorte: asigna profesor/asistente/alumno por rol (y módulo si aplica) | en `/admin/cohorts/[cohortId]` | — |
| `app/(admin)/admin/calendario/` | Calendario mensual read-only de todas las sesiones del entorno activo (todas las cohortes); cada sesión enlaza al editor de la cohorte | `/admin/calendario` | — |
| `app/(admin)/admin/lessons/` + `[lessonId]/` | Editor de módulo unificado (scope programa+cohorte): lecciones grabadas (crear/editar/reordenar/mover de módulo) + clases en vivo del calendario por módulo; detalle con upload Mux, transcripción, capítulos, resumen IA | `/admin/lessons` | — |
| `app/api/admin/lessons/route.ts` · `[lessonId]/route.ts` | CRUD de lecciones (POST crear, PATCH editar metadatos **y mover de módulo**, DELETE con guard de progreso) | `POST/PATCH/DELETE /api/admin/lessons` | — |
| `app/api/admin/modules/route.ts` · `[moduleId]/route.ts` | CRUD de módulos (GET por cohorte, POST crear, PATCH editar, DELETE con guard de progreso) | `GET/POST/PATCH/DELETE /api/admin/modules` | — |
| `app/api/admin/lessons/reorder/route.ts` · `components/admin/lesson-reorder-list.tsx` | Reordenar lecciones de un módulo (RPC atómico `reorder_lessons`, flechas arriba/abajo) | `POST /api/admin/lessons/reorder` | — |
| `lib/admin/lesson-video-status.ts` | Deriva miniatura y estado del video (Grabada/Procesando/Error/etc.) de una lección para la card del listado admin | — | — |
| `components/admin/lesson-edit-form.tsx` · `add-lesson-button.tsx` · `module-edit-form.tsx` · `add-module-button.tsx` | UI del editor de clases (crear/editar/eliminar módulos y lecciones) | — | — |
| `components/admin/lessons-scope-filter.tsx` · `module-sessions-list.tsx` | Selector programa+cohorte del editor + lista de clases en vivo por módulo (mover de módulo, enlace al calendario) | — | — |
| `lib/utils/slug.ts` | `slugify` + `uniqueSlug` para URLs legibles del classroom | — | — |
| `app/(admin)/admin/{resources,quizzes,progress}/page.tsx` | Recursos, quizzes y reporte de progreso por cohorte | `/admin/…` | — |
| `app/(admin)/admin/alumnos/page.tsx` + `student-table.tsx` + `cohort-filter.tsx` | Panel roster por alumno del entorno activo: asistencia, avance de lecciones y evaluaciones en una tabla, con búsqueda, filtro "en riesgo" y drill-down | `/admin/alumnos` | — |
| `lib/admin/student-panel-queries.ts` | `getStudentPanelReport(programId, cohortId?)`: agrega asistencia/avance/evaluaciones por alumno en consultas bulk (sin N+1), service-role | — | — |
| `components/admin/students/shared.tsx` | Componentes presentacionales compartidos por `/admin/alumnos` y `/admin/progress` (StatStrip, hook `useIsDesktop`, etc.), agnósticos del dominio (props planas, no tipos de queries) | — | — |
| `app/api/admin/users/` (`route`·`bulk`·`template`·`[userId]`) | CRUD de usuarios + importación CSV masiva | — | — |
| `app/api/admin/cohort-roles/route.ts` | Asignación de roles por cohorte | — | 0004 |
| `app/api/admin/send-invitation/route.ts` | Envío/reenvío de invitación por email | — | — |
| `app/api/admin/mux/upload/route.ts` | Crea upload directo a Mux para una lección (`video_quality:basic`); limpia `mux_error`; el cliente sube con UpChunk (chunked + reintentos) vía `mux-uploader` | — | — |
| `app/api/admin/sessions/[sessionId]/recording/route.ts` · `components/admin/session-recording-panel.tsx` | Repetición (grabación Mux) de una clase EN VIVO: crea-si-no-existe una lección `kind='recorded'` bajo el módulo de la sesión y la enlaza vía `class_sessions.lesson_id`; reusa `MuxUploader` + webhook Mux. Panel embebido en el editor de sesiones | `GET/POST/DELETE /api/admin/sessions/[id]/recording` | 0041 |
| `app/api/admin/resources/upload-url/route.ts` | Signed upload URL para subir archivo de recurso directo a Storage (bucket privado, ≤50 MB) | `POST /api/admin/resources/upload-url` | — |
| `app/api/admin/session-resources/upload-url/route.ts` | Signed upload URL para archivos de recursos de clases en vivo (calendario) | `POST /api/admin/session-resources/upload-url` | — |
| `components/admin/lesson-content-editor.tsx` · `app/api/admin/lesson-content/upload-url/route.ts` | Editor de clases de texto/diapositiva (markdown + imágenes intercaladas) y su signed upload URL | `POST /api/admin/lesson-content/upload-url` | — |
| `components/admin/cover-image-field.tsx` · `app/api/admin/covers/route.ts` | Subida/quita de portada (módulo o lección) al bucket público `covers` (service-role); columna `cover_image_url` separada de `thumbnail_url` (Mux) | `POST/DELETE /api/admin/covers` | — |
| `components/admin/program-filter.tsx` | Selector de entorno/programa para scopear recursos y lecciones en el admin | — | — |
| `app/api/admin/{generate-summary,generate-chapters,generate-quiz,correct-transcript,transcript-segments}/route.ts` | Generación de contenido por IA (resumen, capítulos, quiz, transcripción) | — | — |
| `lib/classroom/generate-chapters.ts` · `generate-summary.ts` | Lógica de generación IA de capítulos y resumen de una lección, invocada por su ruta admin y por el pipeline post-procesamiento de Mux | — | — |
| `scripts/backfill-lesson-ai.ts` | Reconciliación one-off: regenera transcripción corregida, resumen/glosario y capítulos solo donde falten (huecos del fire-and-forget del webhook de Mux); reusa las mismas funciones que el webhook | `npx tsx scripts/backfill-lesson-ai.ts [--force]` | — |
| `app/api/admin/{modules,resources,quiz-questions,certificates}/route.ts` | CRUD admin de módulos/recursos/preguntas/certificados (config e intentos del quiz se gestionan por evaluación, no por programa) | — | — |
| `components/admin/` | UI admin: `user-drawer`, `progress-table`, `quiz-manager`, `mux-uploader`, `resource-manager`, `csv-import-modal`, `transcript-review` | — | — |
| `components/admin/collapsible-section.tsx` | Sección colapsable reusable para paneles largos del admin (editor de lección, sesiones de cohorte) | — | — |
| `lib/admin/user-queries.ts` | Lecturas de usuarios/segmento para el admin; `getAdminUsersList(programId?)` scopea por entorno (miembros del programa + staff transversal admin/ops) | — | — |
| `lib/admin/active-env.ts` · `env-actions.ts` | Entorno activo (program_id) + modo de vista (admin/alumno) del staff, en cookies; `resolveProgramScope` (precedencia `?program` > cookie) y server actions `setActiveEnv`/`setViewMode` | — | — |
| `components/admin/env-switcher.tsx` | Selector global de entorno + toggle "Ver como Admin/Alumno" (en el sidebar, solo staff) | — | — |
| `lib/admin/session-module.ts` | Valida que el módulo de una sesión pertenezca al programa de la cohorte (POST/PATCH de sesiones) | — | — |
| `lib/auth/authorize-admin.ts` | Autorización admin/staff unificada y `requireSessionStaff` (gate por-sesión: staff o docente/asistente de la cohorte de esa sesión). El modelo de roles NO se declara acá: los enums `user_role`/`system_role` salen de `lib/supabase/types.ts`, generado desde la base | — | 0004, 0013 |
| `lib/auth/redirects.ts` | Saneamiento del `next` post-autenticación (`safeNextPath`, anti open-redirect) y origen canónico de los enlaces; compartido por `/auth/confirm`, login y set-password | — | — |

## Landing (público)

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/page.tsx` | Landing del Diplomado (hero, programas, syllabus, comparador, FAQ, contacto) | `/` | — |
| `components/landing/` | Secciones de la landing (Hero, Programas, Comparador, Syllabus, FAQ, Formulario, …) | — | — |
| `lib/landing/` | Contenido de la landing: `programs`, `faq`, `team`, `constants`, `images`, `cohort` (fecha de inicio de la próxima cohorte del Diplomado, en vivo desde `cohorts`) | — | — |
| `lib/og/brand.tsx` + `app/**/opengraph-image.tsx` | Tarjetas Open Graph 1200×630 (ImageResponse/Satori): genérica, checkouts Diplomado/Liderazgo y certificado dinámico por código | `/opengraph-image`, `/pago/opengraph-image`, `/verificar/[code]/opengraph-image` | — |
| `app/api/leads/route.ts` | Captura de leads del formulario de contacto y de la calculadora (`source` los distingue) | `POST /api/leads` | — |

## Calculadora de crédito (público)

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/calculadora-credito/` | Página pública del simulador de dividendo (RSC + skeleton + error boundary) | `/calculadora-credito` | 0027 |
| `components/calculadora/` | UI: `CalculadoraCredito` (formulario y estado), `CampoMonto` (input con máscara de miles), `MatrizDividendos` (tabla pie × plazo) | — | 0027 |
| `lib/credito/calculo.ts` | Motor puro portado de la planilla: ingreso reconocido, renta final, dividendo francés, matriz de escenarios, plazo máximo por edad | — | 0027 |
| `lib/credito/constants.ts` | Parámetros del banco: castigos por fuente, renta mínima, carga máxima 25%, tasa, pies, plazos, edad tope | — | 0027 |
| `lib/indicadores/uf.ts` | Valor UF del día desde mindicador.cl, cacheado 12h; el fallback nunca se cachea | — | 0027 |
| `lib/utils/money.ts` | Helper único de formateo CLP/UF y máscara de montos para inputs | — | 0027 |

## Video / Mux

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/api/webhooks/mux/route.ts` | Webhook de Mux con firma HMAC: `asset.ready`/`deleted`/`track.ready` + `upload.errored`/`asset.errored` (guarda `lessons.mux_error` para que la UI muestre el fallo en vez de polling infinito) | `POST /api/webhooks/mux` | 0042 |
| `app/api/video-proxy/route.ts` | Proxy de video con validación de enrollment | — | — |
| `lib/mux/client.ts` | Cliente Mux (gestión de assets/uploads) | — | — |
| `lib/mux/smart-thumbnail.ts` | Selección por IA de visión del frame más atractivo para la miniatura de un video (usada por el webhook asset.ready; fallback al default de Mux) | — | — |
| `components/classroom/video-player.tsx` | Player premium (controles custom, CC, capítulos, velocidad, PiP, atajos) | — | — |

## Auth (core)

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/(auth)/forgot-password/page.tsx` · `app/api/auth/forgot-password/route.ts` | Enlace de acceso único: activa la cuenta de quien nunca tuvo contraseña y recupera la olvidada (email branded vía Resend) | `/forgot-password` | — |
| `lib/email/access-link.ts` | Envío del correo de enlace de acceso + registro en `access_email_log`; avisa al equipo si el envío falla | — | — |
| `app/api/webhooks/resend/route.ts` | Webhook de Resend (firma Svix): marca entregado/rebotado/spam sobre `access_email_log` | `POST /api/webhooks/resend` | — |
| `app/(admin)/admin/users/[userId]/access-history.tsx` | Historial de enlaces de acceso de una persona en su ficha de admin | — | — |
| `app/auth/callback/route.ts` | Callback de sesión de Supabase | `/auth/callback` | — |
| `app/api/auth/signout/route.ts` | Cierre de sesión | `POST /api/auth/signout` | — |
| `lib/supabase/{client,server,admin}.ts` | Clientes Supabase: browser / server / service-role | — | — |
| `lib/supabase/auth.ts` | `getAuthUser` con React `cache()`: dedup de `getUser` por request (páginas + layout comparten una sola llamada) | — | — |

## Infra compartida

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `lib/resend/client.ts` | Cliente Resend (envío de correos) | — | — |
| `lib/coupons/` | Validación de cupones de descuento (`validate`, `types`) | — | — |
| `lib/pricing.ts` | Cálculo de precios y planes del Diplomado | — | — |
| `lib/rate-limit.ts` | Rate limiting de rutas API | — | — |
| `lib/api/base-url.ts` | Resuelve la base URL canónica de la app | — | — |
| `lib/utils/` | Utilidades: `cn`, `rut`, `phone` (formato CL), `url` (normaliza https://), `zod` (UUID no-RFC), `use-focus-trap`, `time-ago` (relativo tipo "hace 2h"), `initials` (iniciales para avatar) | — | — |
| `components/ui/markdown.tsx` | Renderer markdown compartido (contenido de clases de texto, ayuda) | — | — |
| `components/ui/{checkbox,date-picker,file-input,radio,select}.tsx` | Componentes de formulario propios de marca (reemplazan los controles nativos del navegador) | — | — |
| `db/migrations/` | Migraciones SQL versionadas (`0001`–`0080`) | — | — |
| `db/migrations/0043_seed_liderazgo.sql` | Siembra del entorno Liderazgo: programa + 4 módulos (jornada=módulo) + cohorte G1 + 4 sesiones + docente Diego de La Prida | — | 0009 |
| `db/migrations/0049_seed_capacitaciones.sql` | Siembra del entorno Ciclo de Capacitación Comercial CI: programa gratuito interno + cohorte + 5 sesiones presenciales | — | 0012 |
| `db/migrations/0052_prevent_role_self_escalation.sql` | Trigger que bloquea la auto-escalación de `role`/`system_role` en `profiles` (solo staff/service-role puede cambiarlos) | — | — |
| `db/migrations/0069_drop_profiles_rut_unique_idx.sql` | Borra el índice único global de RUT en `profiles`: el RUT identifica a una persona, no a una cuenta, y una misma persona puede tener varias cuentas legítimas (alumna en un programa, profe en otro) | — | 0015 |
| `db/migrations/0074_leads.sql` | Versiona `leads` (megaauditoría 16-jul, hallazgo C3): reproduce la tabla que solo existía en prod (creada por dashboard); RLS habilitada sin policies (deny-all), único escritor es `app/api/leads/route.ts` vía service-role | — | — |
| `db/migrations/0081_session_reminders_72h.sql` | Habilita la ventana de 72h en `session_reminders` (recordatorio de clase 3 días antes) | — | — |
| `db/migrations/0084_access_email_log.sql` | Bitácora de los correos de acceso (enviado/falló/sin cuenta + entrega vía webhook); RLS solo staff | — | — |
| `db/migrations/0079_rls_initplan_optimization.sql` | Corta la recursión RLS entre `video_progress`/`enrollments`/`cohort_roles` (funciones SECURITY DEFINER + policies consolidadas) y cachea `auth.uid()`/`is_platform_staff()` como initplan, cerrando los timeouts 57014 del classroom. No aplicada a prod en este ciclo | — | — |
| `db/migrations/0080_quiz_correct_option_af.sql` | Amplía el CHECK de `quiz_questions.correct_option` de A–D a A–F (o NULL), alineando el esquema con las hasta 6 opciones que ya soporta la UI de preguntas de opción única | — | — |
| `scripts/invite-capacitaciones.mjs` | Invitación masiva de asistentes al ciclo CAP-CI (crea usuario + matrícula + correo branded) | — | 0012 |
| `scripts/reinvite-stuck-capacitaciones.mjs` | Segunda tanda: reenvía invitación solo a quien sigue sin activar cuenta del ciclo CAP-CI (roster 'active' vs `last_sign_in_at` nulo en Admin API) | — | 0012 |
| `scripts/` | Scripts de operación: Mux (upload/link/status), transcripciones IA, invitaciones, brochures, cobro | — | — |
