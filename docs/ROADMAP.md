# Roadmap — Capital Academy MVP

> Cronograma sugerido para construir el MVP de la plataforma del Diplomado
> Ejecutivo en Ventas y Asesoría Inmobiliaria, organizado por **sprints
> quincenales** y alineado a las 15 épicas (E1–E15).
>
> Versión: v0.1 · Fecha base: cohorte arranca cada 2 meses · Ajustar fechas reales
> con el equipo dev/dirección antes de congelar el plan.

## Supuestos de planificación

- 1 dev full-stack senior + 1 PM/Operación parcial (mínimo).
- Sprints de **2 semanas** (10 días hábiles).
- 1 cohorte piloto en paralelo desde Sprint 5 (**dogfooding**) para validar UX
  real antes de la primera cohorte oficial.
- Diseño visual: estilo ejecutivo, sin sistema de diseño propio en MVP (shadcn/ui).
- Infra: Vercel + Supabase managed; sin DevOps dedicado en MVP.

## Fases

| Fase | Sprints | Duración | Objetivo |
|---|---|---|---|
| **0. Setup técnico** | S0 | 1 sem | Proyecto Next.js + Supabase + clientes externos en cero |
| **1. Cimientos** | S1–S2 | 4 sem | E1, E2, E3, E4 (acceso + estructura + matrícula) |
| **2. Aula viva** | S3–S4 | 4 sem | E5, E6, E13 (sesiones, asistencia, comentarios/recursos) |
| **3. Avance académico** | S5–S6 | 4 sem | E7, E8, E9 (evaluaciones, tareas, progreso) |
| **4. Cierre académico** | S7–S8 | 4 sem | E10, E11, E12, E14, E15 (notas, certificación, reportes, auditoría) |
| **5. Hardening + Piloto** | S9 | 2 sem | QA, fixes, performance, dogfooding cohorte piloto |
| **6. Lanzamiento** | S10 | 2 sem | Onboarding cohorte real + soporte hipercuidado |

**Total estimado:** ~10 sprints ≈ **20 semanas / 5 meses** de cero a cohorte real.
Si hay cohorte fija agendada, recortar Fase 4/5 con scope reducido.

---

## Sprint 0 — Setup técnico (1 semana)

**Objetivo:** dejar el repo, infra y SDKs operativos.

- [x] Inicializar Next.js 16 + TS + Tailwind + ESLint + Prettier
- [x] Instalar SDKs (Supabase, Slack, Resend, Mux, Drive, RHF, Zod, lucide)
- [x] Estructura de carpetas por dominio + role groups
- [x] Clientes Supabase (browser/server/admin) + middleware de sesión
- [x] `.env.example`, `.editorconfig`, `.prettierrc`
- [x] Migración SQL `0001_init_core.sql` (esqueleto E1–E5)
- [ ] Crear proyecto Supabase + correr migración
- [ ] Crear proyecto en Vercel + variables de entorno
- [ ] Configurar Sentry (`@sentry/wizard`)
- [ ] Instalar shadcn/ui (`pnpm dlx shadcn@latest init`) + 5 primitivos base
- [ ] Configurar GitHub Actions: lint + typecheck + build en PR

**Entregable:** repo deployable a Vercel, conectado a Supabase real.

---

## Sprint 1 — E1 Auth + E2 Cohortes/Calendario

**Objetivo:** poder crear cohortes y que un admin/operación entre con su rol.

- E1
  - Login email + password (Supabase Auth)
  - Recuperación de contraseña (magic link)
  - Cambio de contraseña en perfil
  - Tabla `profiles` + trigger de creación al sign-up
  - Helpers `getCurrentUser()`, `requireRole()`
  - Layouts por role group con guard de rol
- E2
  - CRUD de programas (admin)
  - CRUD de cohortes con estados `planned/active/closed/archived`
  - Calendario por cohorte (martes presencial / miércoles online / jueves presencial)
  - Generación bulk de `class_sessions` desde fechas inicio/fin
- Migración `0002_attendance.sql` adelantada (sólo schema)

**Riesgo:** edge cases de RLS. Mitigación: empezar con una sola política
`is_admin()` y refinar.

---

## Sprint 2 — E3 Matrícula/onboarding + E4 Estructura académica

**Objetivo:** una cohorte cargada con alumnos, profesores y módulos completos.

- E3
  - Alta manual de alumnos (operación) con CSV opcional
  - Asignación a cohorte (`enrollments`)
  - Invitación por email (Resend) con magic link de activación
  - Email de bienvenida personalizado
  - Hook para crear canal Slack de cohorte (`conversations.create` + invite bulk)
  - Crear carpeta Drive por alumno (Google Drive API) — fallback manual
- E4
  - CRUD de módulos por programa con orden y peso
  - CRUD de lecciones (`live_in_person | live_online | recorded`)
  - Asignación de profesor por módulo
  - Reglas de visibilidad: `unlock_at` por lección
  - Upload de recurso simple (Supabase Storage)

**Entregable demostrable:** "estoy logeado como alumno y veo mi cohorte con
módulos bloqueados según fecha".

---

## Sprint 3 — E5 Sesiones y grabaciones + E13 (parcial) Recursos

**Objetivo:** consumir clase online por enlace y subir grabaciones/recursos.

- E5
  - UI de sesión: enlace Zoom/Meet, estado, contador
  - Asociar grabación (Mux upload) post-clase
  - Reprogramación de sesión con notificación automática
  - Estado `scheduled / in_progress / finished / cancelled`
- E13 (parcial: recursos)
  - Recursos por módulo/clase (PDF, link, plantilla)
  - Permisos: profesor sube/edita/elimina los suyos; ops/admin todo

**Riesgo:** Mux upload directo. Mitigación: empezar con asset existente en Mux
y URL pegada manualmente; integrar upload en S6.

---

## Sprint 4 — E6 Asistencia (QR + online) + E13 Comentarios

**Objetivo:** alumno marca asistencia presencial por QR; comentarios con hilos.

- E6
  - Generación de QR por sesión (rotativo, 30s) — protección anti-suplantación
  - Endpoint de check-in con JWT firmado por sesión
  - Detección de asistencia online por ingreso registrado
  - Vista alumno: % asistencia en tiempo real
  - Vista profesor/ops: corrección de asistencia con motivo
  - Justificaciones informativas (sin recuperar %)
- E13 (comentarios)
  - Comentarios por módulo/clase + respuestas (1 nivel)
  - Adjuntos (imágenes/docs) con límite de tamaño
  - Destacar comentario/respuesta
  - Moderación: profesor/ops eliminan; alumno edita los suyos

**Entregable:** una sesión presencial real corre con QR; alumnos comentan dudas.

---

## Sprint 5 — E7 Evaluaciones + Cohorte piloto interna

**Objetivo:** profesor crea quiz, alumno rinde con ventana fija.

- E7
  - CRUD de evaluación (multiple choice + verdadero/falso MVP)
  - Ventana fija (apertura/cierre)
  - 1 intento por alumno
  - Feedback al final
  - Bloqueo automático fuera de ventana
  - Notificaciones de disponibilidad y cierre próximo
- **Dogfooding interno:** equipo Capital Academy hace de "alumnos piloto" en
  una cohorte de prueba con datos reales.

**Riesgo:** anti-trampa básica (sin proctoring). Mitigación: dejar nota en
evaluación y registrar timestamps.

---

## Sprint 6 — E8 Tareas + Drive automático

**Objetivo:** flujo completo de tarea: entrega Drive → revisión → aprobación.

- E8
  - CRUD de tarea por módulo
  - Estado: `pending / submitted / under_review / approved / changes_requested`
  - **Detección automática Drive**: poll cada 5 min sobre carpetas de alumno
  - Fallback: profesor marca entrega manual
  - SLA 48h hábiles con dashboard de cumplimiento docente
  - Regla de desbloqueo: tarea aprobada para avanzar formal
  - Si "ajustes": avance provisional pero bloquea cierre/final
  - Notificaciones por cambio de estado (Slack + email + in-app)

**Entregable:** alumno entrega en Drive, profesor recibe alerta, aprueba o
pide ajustes con comentario.

---

## Sprint 7 — E9 Progreso + E10 Notas y ponderaciones

**Objetivo:** dashboard de avance + libro de calificaciones operable.

- E9
  - Cálculo de progreso por módulo/clase
  - Reglas de avance secuencial (evaluación + tarea aprobada)
  - Bloqueos visibles para alumno con razón
  - Vista profesor/ops del estado por alumno
- E10
  - Componentes ponderables por programa (admin define %)
  - Registro de nota por componente (1.0–7.0)
  - Cálculo de nota final ponderada
  - Estados `draft / loaded / published`
  - Publicación manual por profesor
  - Auditoría de cambios (valor anterior/nuevo, usuario, fecha, motivo)

**Riesgo:** ponderaciones cambian a mitad de cohorte. Mitigación: snapshot de
ponderaciones al inicio de cohorte.

---

## Sprint 8 — E11 Certificación + E12 Notificaciones + E14 Reportes

**Objetivo:** cierre académico end-to-end con certificados y reportes.

- E11
  - Detección automática de elegibilidad (asistencia ≥ 85% + tareas + eval +
    nota ≥ umbral)
  - Aprobación final (operación o admin)
  - Generación PDF: certificado de aprobación + certificado de notas (firma)
  - Histórico permanente
  - Notificación Slack + email al alumno
- E12 (consolidación)
  - Centralizar el sistema de eventos (`notifications` + outbox pattern)
  - Recordatorios programados: clase 1h antes, evaluación 24h y 1h antes
  - Listado in-app simple
- E14
  - Reporte de asistencia por alumno y cohorte
  - Reporte de progreso por módulo y alumno
  - Reporte de estado de tareas
  - Reporte de cumplimiento docente (SLA 48h)
  - Exportación PDF con filtros aplicados

---

## Sprint 9 — E15 Auditoría + Hardening + QA

**Objetivo:** robustez para entrar a producción.

- E15
  - Tabla `audit_log` genérica con triggers en notas, recursos,
    reaperturas, asistencia corregida, reprogramaciones
  - Vista admin para revisar audit trail
- Hardening
  - Auditoría completa de RLS por tabla
  - Rate limiting en endpoints sensibles (login, QR, evaluaciones)
  - Backups automáticos verificados (Supabase PITR)
  - E2E happy path con Playwright (5 flujos críticos)
- QA con cohorte piloto interna terminada

---

## Sprint 10 — Lanzamiento cohorte real

**Objetivo:** cohorte oficial corriendo en plataforma.

- Onboarding presencial (sesión kick-off con plataforma)
- Soporte 1:1 días 1–3 (bug bash en vivo)
- Daily check-in interno con dirección
- Buffer para hotfixes
- Retrospectiva post-Sprint 10 → input al backlog V1.5

---

## Backlog V1.5 / V2 (post-MVP)

| Prioridad | Item | Origen |
|---|---|---|
| Alta | Detección Drive más robusta (webhooks + signatures) | E8 |
| Alta | Notificaciones in-app con leído/no leído | E12 |
| Alta | Filtros y búsqueda avanzada en reportes | E14 |
| Media | Google Sign-In | E1 |
| Media | Folio/código de validación pública de certificado | E11 |
| Media | Embebido de clases online (si calidad lo permite) | E5 |
| Media | Métricas de riesgo académico (alumnos en peligro) | E14 |
| Media | App PWA / mobile mejorada | global |
| Baja | Foro/comunidad post-cohorte | E13 |
| Baja | Automatización de matrícula desde compra (pago + LMS) | E3 |

---

## Mapa épicas → sprint (resumen)

| Épica | Sprint principal | Sprints adicionales |
|---|---|---|
| E1 Auth | S1 | — |
| E2 Cohortes/Calendario | S1 | — |
| E3 Matrícula/Onboarding | S2 | — |
| E4 Estructura académica | S2 | — |
| E5 Sesiones híbridas | S3 | S6 (Mux upload) |
| E6 Asistencia | S4 | — |
| E7 Evaluaciones | S5 | — |
| E8 Tareas + Drive | S6 | — |
| E9 Progreso | S7 | — |
| E10 Notas/ponderaciones | S7 | — |
| E11 Certificación | S8 | — |
| E12 Notificaciones | S8 | transversal S2–S8 |
| E13 Comentarios + Recursos | S3+S4 | — |
| E14 Reportes | S8 | — |
| E15 Auditoría | S9 | parcial S7 (notas) |

---

## Hitos de validación con dirección

| Hito | Sprint | Demo |
|---|---|---|
| **H1: Cohorte cargada** | fin S2 | admin crea cohorte → alumnos invitados → ven módulos |
| **H2: Aula viva** | fin S4 | clase real corriendo con QR + comentarios |
| **H3: Ciclo evaluativo** | fin S6 | quiz rendido + tarea entregada/aprobada |
| **H4: Cierre académico** | fin S8 | alumno con certificado emitido |
| **H5: Producción** | fin S10 | cohorte oficial con feedback semanal |

---

## Riesgos cronológicos críticos

1. **Fecha de cohorte oficial inamovible** → si se acorta el calendario, el
   primer recorte es E13/E15 a versión mínima y E14 a 2 reportes en lugar de 4.
2. **Integración Drive** (S6) — si se atrasa, el fallback manual permite
   sostener S7–S8.
3. **Firma de certificados** — necesita estar resuelta operativamente
   **antes de S8** (asset firmado + validación legal interna).
4. **Slack workspace** — debe existir y estar configurado **antes de S2**.
5. **Ponderaciones definitivas** — admin debe firmarlas **antes de S7**.

---

## Próximos pasos inmediatos (para decisión)

1. ¿Confirmamos sprints de 2 semanas o ajustamos?
2. ¿Hay fecha objetivo de cohorte oficial? Eso fija la fecha de Sprint 10.
3. ¿Quién es el aprobador final por sprint (Giovanni / dirección académica)?
4. Cerrar **preguntas abiertas** del documento ejecutivo antes de S1:
   - canales por evento (Slack/Email/In-app)
   - límites de adjuntos
   - estados formales de cohorte
   - formato estándar de reportes PDF
   - excepciones de evaluación
