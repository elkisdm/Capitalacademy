# Comunicaciones masivas y Encuestas — área de gestión de la academia

**Classification**: `feat` · large · **risk high** (correo saliente masivo a alumnos reales + credenciales
cruzadas a otro sistema de la empresa + nuevo modelo de datos) · known · toca `db/migrations`,
`app/(admin)`, `app/api/admin`, `lib/email`, `lib/campaigns`, `lib/surveys`, `components/admin`
**Tier**: 3 — Full
**Fecha**: 2026-07-29
**ADR**: [0026](../adr/0026-comunicaciones-masivas-y-encuestas-federadas.md)

---

## Goal

Dos capacidades nuevas para que admin y operaciones dejen de depender de scripts one-off:

1. **Comunicaciones** — crear y enviar correos masivos a los alumnos desde el panel, con plantilla
   y branding de Capital Academy, segmentando por entorno/cohorte/estado.
2. **Encuestas** — crear una encuesta y enviarla a un grupo de alumnos, reusando el motor de
   encuestas que ya existe en Capital Admin / hclp en vez de construir uno nuevo.

## Decisión de arquitectura (del usuario, 2026-07-29)

**Encuestas = híbrido: Capital Academy orquesta, hclp aloja.** Academy crea la encuesta, segmenta a
los alumnos, dispara el envío y muestra los resultados; el formulario y las respuestas viven en el
Supabase compartido `upygbobjarduunbwzeva`, y el renderer público sigue siendo
`capitalinteligente.com/s/{slug}`. Motivo: el motor remoto ya es maduro (11 tipos de pregunta,
anonimato en 3 capas, lógica condicional, WhatsApp) y duplicarlo sería tirar trabajo hecho.

**Comunicaciones = 100% local.** Resend propio, branding propio, sin dependencias cruzadas.

## Assumptions made (correct me if wrong)

- **v1 es solo correo.** El modelo lleva columna `channel` (para WhatsApp más adelante), pero solo
  se implementa `email`. El WhatsApp de encuestas llega gratis por el endpoint de hclp en modo
  identificado, y se registra en la bitácora tal como hclp lo reporte.
- **Audiencia = alumnos matriculados**, nunca leads. Se filtra `profiles.role = 'student'` igual que
  los scripts one-off, para no mandarle una campaña al equipo interno por accidente.
- **Sin programación diferida en v1.** Se crea borrador → se previsualiza → se envía. Un cron de
  envío programado es v2 (el modelo ya deja `scheduled_at` fuera a propósito para no fingir soporte).
- **Sin unsubscribe.** No existe hoy en el repo y estos son correos operacionales a alumnos
  matriculados, no marketing. Se anota como deuda explícita en el ADR.
- **Las migraciones se escriben en el repo y NO se aplican a prod en esta sesión** sin autorización
  explícita (memoria `feedback-migracion-mcp-no-versiona`).
- **Las credenciales cruzadas de encuestas no están en `.env` local.** El módulo se escribe
  configurable y degrada con un 503 legible; se documentan en `.env.example`.
- La UI del panel NO usa shadcn/ui (no está instalado): se usa `components/ui/` propio.

## Acceptance criteria

### Comunicaciones
- [ ] Admin y ops (y solo ellos) ven `/admin/comunicaciones` y pueden crear un borrador de correo.
- [ ] Al elegir entorno + cohorte + estado de matrícula, la UI muestra **cuántos destinatarios** hay
      antes de enviar.
- [ ] El correo se previsualiza con el branding del entorno (acento por programa) antes de enviarse.
- [ ] Se puede enviar un **correo de prueba a uno mismo** sin tocar a los alumnos.
- [ ] El envío real usa `sendEmailBatch` (ADR-0020), nunca fan-out secuencial.
- [ ] Un reenvío tras fallo parcial **solo va a quien no recibió** (bitácora por destinatario).
- [ ] Una campaña ya enviada no se puede editar ni reenviar entera.
- [ ] El cuerpo acepta Markdown básico (títulos, negrita, cursiva, listas, enlaces) y se renderiza a
      HTML email-safe con estilos inline.

### Encuestas
- [ ] Admin/ops crean una encuesta con preguntas (escala, opción única/múltiple, texto, NPS, sección)
      desde `/admin/encuestas`, eligen modo **anónimo** o **identificado**, y la publican.
- [ ] En modo **anónimo** el enlace es idéntico para todos (sin token ni parámetro por persona) y el
      correo lo envía Capital Academy con su branding.
- [ ] En modo **identificado** el enrolamiento se delega al endpoint de ingesta de hclp, que emite un
      token por persona y envía correo + WhatsApp.
- [ ] Los resultados se leen desde la API externa de capital-admin y se muestran en el panel.
- [ ] Si faltan las credenciales cruzadas, la UI lo dice con claridad (503) en vez de romperse.

## Files & routes to touch

*(verificado contra el código: sí — rutas confirmadas con lectura directa, no inferidas del codemap)*

**Migraciones**
- `db/migrations/0082_email_campaigns.sql` — new — `email_campaigns` + `email_campaign_recipients` (bitácora ADR-0020) + RLS.
- `db/migrations/0083_survey_campaigns.sql` — new — `survey_campaigns` + `survey_campaign_recipients` + RLS.

**Correo — plantilla y branding**
- `lib/email/layout.ts` — new — shell branded compartido (`emailShell`, `emailButton`, `escHtml`), parametrizado por acento de `lib/programs/registry.ts`.
- `lib/email/markdown.ts` — new — subset Markdown → HTML email-safe con estilos inline + versión texto plano.
- `lib/email/campaign.ts` — new — `buildCampaignEmail()` → `EmailContent`.
- `lib/email/survey-invitation.ts` — new — `buildSurveyInvitationEmail()` (modo anónimo).

> No se refactorizan los 4 `shell()` duplicados que ya existen (`capacitacion-emails`,
> `deliverable-open`, `deliverable-received`, `recording-available`). Se deja anotado como deuda.

**Comunicaciones — dominio**
- `lib/campaigns/audience.ts` — new — `resolveAudience()`: alumnos por programa/cohorte/estado/segmento.
- `lib/campaigns/send.ts` — new — `sendEmailCampaign()`: reclamo atómico → bitácora → `sendEmailBatch` → estado terminal solo sin fallos.

**Encuestas — dominio**
- `lib/surveys/config.ts` — new — env cruzadas + cliente del Supabase compartido; `surveysConfigStatus()`.
- `lib/surveys/questions.ts` — new — tipos y schema Zod de pregunta (espejo del contrato de capital-admin).
- `lib/surveys/remote.ts` — new — `createRemoteSurvey`, `enrollRemoteRecipients`, `fetchRemoteResults`.
- `lib/surveys/send.ts` — new — `sendSurveyCampaign()`: anónimo → Resend propio; identificado → ingesta hclp.

**API**
- route `GET/POST /api/admin/campaigns` — new — `app/api/admin/campaigns/route.ts`
- route `GET/PATCH/DELETE /api/admin/campaigns/[campaignId]` — new
- route `POST /api/admin/campaigns/[campaignId]/send` — new
- route `POST /api/admin/campaigns/[campaignId]/test` — new — correo de prueba al propio admin
- route `GET /api/admin/campaigns/audience` — new — conteo de destinatarios
- route `GET/POST /api/admin/surveys` — new
- route `POST /api/admin/surveys/[campaignId]/send` — new
- route `GET /api/admin/surveys/[campaignId]/results` — new

**UI**
- `app/(admin)/admin/comunicaciones/page.tsx` + `campaigns-client.tsx` — new
- `app/(admin)/admin/encuestas/page.tsx` + `surveys-client.tsx` — new
- `components/classroom/sidebar.tsx` — modify — 2 ítems nuevos en el bloque admin (líneas ~491-507) + 2 iconos en `ICON_PATHS`
- `.env.example` — modify — credenciales cruzadas de encuestas

## Tests

- `lib/email/__tests__/markdown.test.ts` — subset Markdown, escape de HTML inyectado, texto plano.
- `lib/email/__tests__/campaign.test.ts` — asunto, acento por programa, CTA opcional, saludo por nombre.
- `lib/campaigns/__tests__/audience.test.ts` — filtro por cohorte/estado/segmento, dedup por email, exclusión de staff.
- `lib/campaigns/__tests__/send.test.ts` — reclamo idempotente, `missing = recipients − bitácora`, estado `failed` con entrega parcial, uso de `sendEmailBatch`.
- `lib/surveys/__tests__/questions.test.ts` — validación por tipo.
- `lib/surveys/__tests__/remote.test.ts` — auth de los 2 contratos externos, degradación sin credenciales.
- `app/api/admin/campaigns/__tests__/route.test.ts` — 401/403/422/201.
- `app/api/admin/campaigns/[campaignId]/send/__tests__/route.test.ts` — no reenvía una campaña `sent`.
- `app/api/admin/surveys/__tests__/route.test.ts` — 401/403/422/201 + 503 sin credenciales.

Cobertura: el gate (`vitest.config.ts`, ADR-0010/0012/0025) pasa por 0.01 pp en rutas críticas —
ningún archivo nuevo entra sin test.

## Out of scope

- Envío programado (cron de campañas) y secuencias automáticas.
- WhatsApp desde Capital Academy (solo el que hclp dispara en encuestas identificadas).
- Unsubscribe / preferencias de correo.
- Refactor de los 4 `shell()` de correo duplicados que ya existían.
- Adjuntos en campañas.
- Editor visual WYSIWYG (el cuerpo es Markdown).

---

## Spec (Given/When/Then)

**Scenario: conteo de audiencia antes de enviar**
- GIVEN una campaña borrador del entorno Diplomado con cohorte G4 y estado `active`
- WHEN el admin abre el editor
- THEN la UI muestra el número exacto de alumnos que recibirían el correo, excluyendo staff

**Scenario: reenvío tras fallo parcial**
- GIVEN una campaña cuyo envío dejó 30 destinatarios en `sent` y 5 en `failed`
- WHEN el admin vuelve a pulsar Enviar
- THEN solo se arman mensajes para los 5 que faltan, y los 30 no reciben un duplicado

**Scenario: campaña ya enviada es inmutable**
- GIVEN una campaña con `status = 'sent'` y cero fallos
- WHEN se intenta editar (PATCH) o borrar (DELETE)
- THEN la API responde 409 y no modifica nada

**Scenario: correo de prueba**
- GIVEN un borrador con asunto y cuerpo
- WHEN el admin pulsa "Enviarme una prueba"
- THEN llega un solo correo a la casilla del admin y la bitácora de la campaña queda intacta

**Scenario: encuesta anónima no lleva identificador**
- GIVEN una encuesta creada en modo `anonymous`
- WHEN se envía a la cohorte
- THEN todos los correos contienen exactamente la misma URL, sin token, `?email=` ni `?uid=`

**Scenario: encuesta identificada delega en hclp**
- GIVEN una encuesta en modo `identified`
- WHEN se envía
- THEN Capital Academy NO manda correo propio: llama al endpoint de ingesta y registra en su
  bitácora lo que hclp reportó por canal (`email`/`whatsapp`)

**Scenario: credenciales cruzadas ausentes**
- GIVEN `SURVEYS_SUPABASE_SERVICE_ROLE_KEY` sin definir
- WHEN se intenta crear una encuesta
- THEN la API responde 503 con un mensaje que nombra la variable faltante, sin stack trace
