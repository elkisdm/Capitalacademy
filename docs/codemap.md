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
| `lib/payments/provider.ts` | Resuelve el provider activo (`PAYMENT_PROVIDER`) | — | — |
| `scripts/generate-cobro-link.mjs` | Genera enlaces de cobro firmados (hasta tener página admin) | — | — |

## Mensajería / Marketing

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `scripts/whatsapp-submit-template.mjs` | Submitea/lista plantilla MARKETING en Meta (Cloud API); sube el brochure vía Resumable Upload para el header DOCUMENT | `--list` / `--submit` | — |
| `scripts/send-diplomado-whatsapp.mjs` | Envío masivo de la plantilla `diplomado_4ta_gen_captacion` a la base externa (dry-run, throttle, idempotente) | `--send` | — |
| `docs/marketing/telefonos-bd-externa.csv` | Base externa Diplomado 4ª gen: 169 teléfonos E.164 (canal WhatsApp) | — | — |
| `scripts/send-test-brevo.mjs` | Envío de prueba del correo (Brevo transaccional); el blast masivo va por dashboard Brevo | — | — |

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
| `lib/classroom/access.ts` | Gate de acceso al classroom: matrícula activa **o** rol staff (admin/ops) sin matrícula | — | 0004 |
| `lib/supabase/middleware.ts` | Whitelist de rutas públicas (incl. set-password genérico y branded) | — | — |
| `app/auth/confirm/route.ts` | Verifica OTP de invitación/recovery y redirige al `next` (branded por entorno) | `/auth/confirm` | — |
| `lib/classroom/enroll-from-payment.ts` | Matrícula + onboarding branded del comprador del Diplomado (link a `/onboarding/diplomado/set-password`) | — | — |

## Calendario / Sesiones

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/(admin)/admin/cohorts/[cohortId]/sesiones/` | Editor admin del calendario de la cohorte (crear/editar/eliminar sesiones, lista o calendario) | `/admin/cohorts/[cohortId]/sesiones` | 0008 |
| `app/api/admin/sessions/route.ts` · `[sessionId]/route.ts` | CRUD de sesiones de clase de una cohorte | `POST/PATCH/DELETE /api/admin/sessions` | 0008 |
| `app/api/admin/session-resources/route.ts` | Recursos asociados a una sesión (material de clase) | `/api/admin/session-resources` | 0008 |
| `app/api/admin/enrollment-segment/route.ts` | Asignación manual del segmento "Capital Inteligente" a una matrícula | `/api/admin/enrollment-segment` | 0008 |
| `components/admin/segment-toggle.tsx` | Toggle admin del segmento de un alumno | — | 0008 |
| `app/(classroom)/classroom/[cohortSlug]/calendario/` | Calendario de clases del alumno (vista lista + mes, recursos por sesión) | `/classroom/[cohortSlug]/calendario` | 0008 |
| `components/classroom/month-calendar.tsx` | Vista de mes del calendario del alumno (a11y, chips por sesión) | — | 0008 |

## Recordatorios / Cron

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/api/cron/session-reminders/route.ts` | Endpoint que envía recordatorios de clase próximos (gateado por `CRON_SECRET`) | `POST /api/cron/session-reminders` | 0008 |
| `netlify/functions/session-reminders-cron.mjs` | Netlify Scheduled Function (`*/30`) que invoca el endpoint de recordatorios | — | 0008 |
| `lib/email/` | Correos transaccionales (Resend): `invitation`, `diplomado-invitation`, `payment-confirmation`, `session-reminder`, `certificate` | — | — |

## Classroom (alumno)

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/(classroom)/classroom/page.tsx` | Dashboard del alumno: sus cohortes/programas | `/classroom` | — |
| `app/(classroom)/classroom/[cohortSlug]/page.tsx` | Home del programa: módulos + timeline de lecciones | `/classroom/[cohortSlug]` | — |
| `app/(classroom)/classroom/[cohortSlug]/[moduleSlug]/page.tsx` | Lista de lecciones del módulo | `/classroom/[cohortSlug]/[moduleSlug]` | — |
| `app/(classroom)/classroom/[cohortSlug]/[moduleSlug]/[lessonSlug]/page.tsx` | Reproductor de lección: video Mux, transcripción, resumen, comentarios y progreso | `…/[lessonSlug]` | — |
| `app/(classroom)/classroom/profile/page.tsx` | Perfil editable del alumno (foto, RUT, cumpleaños) | `/classroom/profile` | — |
| `components/classroom/` | UI del classroom: `video-player`, `sidebar`, `comment-section`, `transcript-panel`, `summary-card`, `quiz-*`, `collapsible-playlist` | — | — |
| `lib/classroom/queries.ts` · `admin-queries.ts` | Lecturas de módulos/lecciones/progreso (alumno y admin) | — | — |
| `lib/classroom/progress.ts` · `use-video-progress.ts` | Tracking granular de progreso de video | — | — |
| `lib/classroom/resolve-slugs.ts` | Resuelve slugs legibles ↔ UUIDs (compat retroactiva) | — | — |
| `lib/classroom/verify-enrollment.ts` | Verifica matrícula activa para gating de contenido | — | 0004 |
| `app/api/classroom/{progress,comments,transcript,summary,avatar}/route.ts` | Endpoints del alumno: progreso, comentarios, transcripción, resumen, avatar | — | — |

## Quiz & Certificación

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/api/admin/evaluations/route.ts` · `[evaluationId]/route.ts` | CRUD de evaluaciones por clase (final/módulo/lección): crear con seguridad de tenant, listar por programa, editar config/activar, borrar (guard de intentos) | `GET/POST/PATCH/DELETE /api/admin/evaluations` | — |
| `lib/classroom/quiz-question-schema.ts` | Validación zod del payload de pregunta por tipo + `payloadToDbFields` (compartido por la API admin) | — | — |
| `components/admin/quiz/question-draft.ts` · `question-editor.tsx` | Borrador editable de pregunta (4 tipos, N opciones) + editor UI dinámico, reusado por `add-question-form` y `question-card` | — | — |
| `components/admin/quiz/lesson-quiz-panel.tsx` | Panel embebido en el editor de lección: crea/gestiona la evaluación `scope='lesson'` (preguntas, activar, borrar) | en `/admin/lessons/[lessonId]` | — |
| `app/api/classroom/quiz/route.ts` | Estado/gating del quiz del alumno (locked/ready/passed); NO entrega preguntas | `GET /api/classroom/quiz` | — |
| `app/api/classroom/quiz/start/route.ts` | Inicia/reanuda intento: persiste `questions_presented` server-side (ancla anti-bypass) | `POST /api/classroom/quiz/start` | — |
| `app/api/classroom/quiz/submit/route.ts` | Cierra el intento y puntúa sobre el set persistido (cierra el bypass de certificación); el final lee config de `evaluations(scope='final')` | `POST /api/classroom/quiz/submit` | — |
| `app/api/classroom/evaluation/{route,start,submit}/route.ts` | Flujo del alumno para quizzes FORMATIVOS por clase (estado/iniciar/enviar): anti-bypass por evaluación, puntúa con `scoreAnswer`, sin certificado ni gate de completitud | `GET/POST /api/classroom/evaluation*` | — |
| `lib/classroom/evaluation-access.ts` | Resuelve acceso del alumno a una evaluación (activa + matrícula activa); compartido por los 3 endpoints formativos | — | — |
| `components/classroom/evaluation/evaluation-runner.tsx` · `question-input.tsx` | Runner formativo (intro→en curso→resultado) + input por tipo; embebido al final de la lección | en `…/[lessonSlug]` | — |
| `lib/classroom/quiz-question-schema.ts` | Validación zod del payload de pregunta por tipo + `payloadToDbFields` | — | — |
| `lib/classroom/quiz-runtime.ts` | Helpers server del quiz: completitud, selección/rehidratación (por programa y por evaluación), y `scoreAnswer` por tipo (single/multiple/true_false/short_answer) | — | — |
| `db/migrations/0033_evaluations.sql` | Tabla `evaluations` (quiz por alcance final/módulo/lección) + tipos de pregunta en `quiz_questions` (`question_type`/`correct_answer`) + `evaluation_id` en `quiz_attempts`; migra el final a `scope='final'` | — | — |
| `app/(classroom)/classroom/[cohortSlug]/quiz/page.tsx` · `components/classroom/quiz-runner.tsx` | Página del alumno para rendir el quiz + cliente máquina-de-estados | `/classroom/[cohortSlug]/quiz` | — |
| `app/(classroom)/classroom/[cohortSlug]/certificado/page.tsx` | Certificado del alumno | `/classroom/[cohortSlug]/certificado` | — |
| `app/api/classroom/certificate/route.ts` · `certificate/retry/route.ts` | Emisión y reintento del certificado | — | — |
| `app/verificar/[code]/page.tsx` · `app/api/verify/[code]/route.ts` | Verificación pública del certificado (página + API) | `/verificar/[code]` | — |
| `lib/certificates/` | Generación del PDF + emisión con QR de verificación | — | — |

## Admin (panel)

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/(admin)/admin/users/` + `[userId]/` | Gestión de usuarios y roles por cohorte (RBAC) | `/admin/users` | 0004 |
| `app/(admin)/admin/cohorts/[cohortId]/` | Detalle de cohorte (info, roster, accesos al calendario) | `/admin/cohorts/[cohortId]` | — |
| `app/(admin)/admin/lessons/` + `[lessonId]/` | Editor de lecciones: crear/editar metadatos (título, descripción, tipo, `unlock_at`)/eliminar + upload Mux, transcripción, capítulos, resumen IA | `/admin/lessons` | — |
| `app/api/admin/lessons/route.ts` · `[lessonId]/route.ts` | CRUD de lecciones (POST crear, PATCH editar metadatos, DELETE con guard de progreso) | `POST/PATCH/DELETE /api/admin/lessons` | — |
| `app/api/admin/modules/route.ts` · `[moduleId]/route.ts` | CRUD de módulos (GET por cohorte, POST crear, PATCH editar, DELETE con guard de progreso) | `GET/POST/PATCH/DELETE /api/admin/modules` | — |
| `app/api/admin/lessons/reorder/route.ts` · `components/admin/lesson-reorder-list.tsx` | Reordenar lecciones de un módulo (RPC atómico `reorder_lessons`, flechas arriba/abajo) | `POST /api/admin/lessons/reorder` | — |
| `components/admin/lesson-edit-form.tsx` · `add-lesson-button.tsx` · `module-edit-form.tsx` · `add-module-button.tsx` | UI del editor de clases (crear/editar/eliminar módulos y lecciones) | — | — |
| `lib/utils/slug.ts` | `slugify` + `uniqueSlug` para URLs legibles del classroom | — | — |
| `app/(admin)/admin/{resources,quizzes,progress}/page.tsx` | Recursos, quizzes y reporte de progreso por cohorte | `/admin/…` | — |
| `app/api/admin/users/` (`route`·`bulk`·`template`·`[userId]`) | CRUD de usuarios + importación CSV masiva | — | — |
| `app/api/admin/cohort-roles/route.ts` | Asignación de roles por cohorte | — | 0004 |
| `app/api/admin/send-invitation/route.ts` | Envío/reenvío de invitación por email | — | — |
| `app/api/admin/mux/upload/route.ts` | Crea upload directo a Mux para una lección | — | — |
| `app/api/admin/resources/upload-url/route.ts` | Signed upload URL para subir archivo de recurso directo a Storage (bucket privado, ≤50 MB) | `POST /api/admin/resources/upload-url` | — |
| `app/api/admin/{generate-summary,generate-chapters,generate-quiz,correct-transcript,transcript-segments}/route.ts` | Generación de contenido por IA (resumen, capítulos, quiz, transcripción) | — | — |
| `app/api/admin/{modules,resources,quiz-config,quiz-questions,quiz-attempts,certificates}/route.ts` | CRUD admin de módulos/recursos/quiz/certificados | — | — |
| `components/admin/` | UI admin: `user-drawer`, `progress-table`, `quiz-manager`, `mux-uploader`, `resource-manager`, `csv-import-modal`, `transcript-review` | — | — |
| `lib/admin/user-queries.ts` | Lecturas de usuarios/segmento para el admin | — | — |
| `lib/admin/session-module.ts` | Valida que el módulo de una sesión pertenezca al programa de la cohorte (POST/PATCH de sesiones) | — | — |
| `lib/auth/authorize-admin.ts` · `roles.ts` | Autorización admin/staff unificada y modelo de roles | — | 0004 |

## Landing (público)

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/page.tsx` | Landing del Diplomado (hero, programas, syllabus, comparador, FAQ, contacto) | `/` | — |
| `components/landing/` | Secciones de la landing (Hero, Programas, Comparador, Syllabus, FAQ, Formulario, …) | — | — |
| `lib/landing/` | Contenido de la landing: `programs`, `faq`, `team`, `constants`, `images` | — | — |
| `app/api/leads/route.ts` | Captura de leads del formulario de contacto | `POST /api/leads` | — |

## Video / Mux

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/api/webhooks/mux/route.ts` | Webhook de Mux (asset ready) con firma HMAC verificada | `POST /api/webhooks/mux` | — |
| `app/api/video-proxy/route.ts` | Proxy de video con validación de enrollment | — | — |
| `lib/mux/client.ts` | Cliente Mux (gestión de assets/uploads) | — | — |
| `components/classroom/video-player.tsx` | Player premium (controles custom, CC, capítulos, velocidad, PiP, atajos) | — | — |

## Auth (core)

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `app/(auth)/forgot-password/page.tsx` · `app/api/auth/forgot-password/route.ts` | Recuperación de contraseña (email branded vía Resend) | `/forgot-password` | — |
| `app/auth/callback/route.ts` | Callback de sesión de Supabase | `/auth/callback` | — |
| `app/api/auth/signout/route.ts` | Cierre de sesión | `POST /api/auth/signout` | — |
| `lib/supabase/{client,server,admin}.ts` | Clientes Supabase: browser / server / service-role | — | — |

## Infra compartida

| Path | Responsabilidad | Rutas / entrypoints clave | ADR |
|------|-----------------|---------------------------|-----|
| `lib/resend/client.ts` | Cliente Resend (envío de correos) | — | — |
| `lib/coupons/` | Validación de cupones de descuento (`validate`, `types`) | — | — |
| `lib/pricing.ts` | Cálculo de precios y planes del Diplomado | — | — |
| `lib/rate-limit.ts` | Rate limiting de rutas API | — | — |
| `lib/api/base-url.ts` | Resuelve la base URL canónica de la app | — | — |
| `lib/utils/` | Utilidades: `cn`, `rut`, `phone` (formato CL), `url` (normaliza https://), `zod` (UUID no-RFC), `use-focus-trap` | — | — |
| `db/migrations/` | Migraciones SQL versionadas (`0001`–`0034`) | — | — |
| `scripts/` | Scripts de operación: Mux (upload/link/status), transcripciones IA, invitaciones, brochures, cobro | — | — |
