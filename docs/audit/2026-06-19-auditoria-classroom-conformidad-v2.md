# Megaauditoría v2 — Conformidad + Solidez de Capital Academy vs spec v0

> Síntesis arquitectónica del 2026-06-19 sobre 5 subsistemas (Entornos/Multi-tenancy, Calendario/Sesiones, Classroom, Edición por rol, Quizes/Evaluaciones). Cada subsistema fue auditado (conformidad RN/Épica + solidez + próximo nivel) por un agente y verificado adversarialmente por un escéptico independiente. Workflow de 11 agentes (5 auditores + 5 verificadores + 1 síntesis), ~1.05M tokens, 293 tool-uses. Esta síntesis descarta los hallazgos refutados, ajusta los matizados, e integra las omisiones verificadas. El spec es una **v0** ("primera versión"): se prioriza con criterio de negocio, no como checklist ciego.
>
> **Línea base auditada:** los 4 PDFs de concepción original — _Épicas_ (E1–E15), _Reglas de Negocio v0.1_ (RN-001–RN-084 + RN-T01–T04), _Historias por rol_ y _MVP + Stack_.
>
> **Complementa, no reemplaza,** la megaauditoría de seguridad del 2026-06-17 (`2026-06-17-megaauditoria-v1.md`). Aquella cubrió seguridad/madurez (PII, RLS abierta, Mux, pagos); esta cubre **conformidad funcional + solidez** de los subsistemas académicos.

> **Estado (actualizado 2026-06-19):** los **3 bloqueantes CRÍTICOS de Fase 0 quedaron RESUELTOS** el mismo día. (A) bypass de certificación cerrado: `POST /quiz/start` persiste el set de preguntas y `/submit` puntúa sobre ese set server-side, filtrando `program_id` y exigiendo intento válido; (B) acceso desacoplado de `status='active'` en app (`getEnrollmentForUser`) y RLS (migración `0030` aplicada a prod: catálogo legible con `('active','completed')`); (C) UI del quiz conectada (`/classroom/[cohortSlug]/quiz` + `quiz-runner`). Migración `0030` también: índice único de intento aprobado + `max_attempts` default 1 (RN-025). CI verde (lint/typecheck/test 112✓/build). Resto de Fase 0/1/2 abajo, pendiente.

## Veredicto

**NO está lista para una v1 estable — pero está más cerca de lo que el rojo sugiere.** La base de ingeniería es honesta: el programa como tenant con aislamiento por cohorte, la RLS de catálogo ya endurecida en 0028 (cierra la fuga cross-tenant ALTO-3 del 17-jun), progreso de video servidor-autoritativo, idempotencia real del cron de recordatorios (unique + reserva-antes-de-enviar) y de pagos, y branding multi-entorno centralizado en `registry.ts`. Los bloqueantes duros de la megaauditoría anterior (PII abierta, Mux sin firmar, fuga de catálogo, Fintoc) están cerrados o desactivados.

Pero esta pasada destapó **dos bloqueantes críticos nuevos** y confirmó **una bomba de relojería estructural**:

1. **Bypass completo de certificación** (verificado en código): `POST /api/classroom/quiz/submit` calcula la nota como `correctCount / correctQuestions.length`, donde el denominador es la cantidad de preguntas que **envía el cliente**, sin filtrar `program_id` ni validar contra `questions_per_attempt`. Como además usa `admin client` (bypassa RLS) y no re-verifica `min_completion_pct`, un cliente manipulado envía UNA sola pregunta cuya respuesta conoce, saca 100%, aprueba y dispara `issueCertificate` sin haber completado ninguna lección.

2. **UI del quiz del alumno huérfana**: ningún `page` renderiza `QuizStart/InProgress/Locked/Result`; `GET /api/classroom/quiz` solo lo referencia su test. El alumno **no puede rendir el quiz por la plataforma**: E7 no es usable end-to-end.

3. **Doble acoplamiento `status='active'`** (verificado en 0028: líneas 49, 77, 106): el acceso al contenido se condiciona a `enrollment.status='active'` en el gate de app **y** en las tres políticas RLS de catálogo. Cerrar las matrículas de G4 como `completed` al terminar la cohorte — flujo natural para reportes/certificados — expulsa a TODOS los alumnos del aula desde dos capas. El fix de tocar solo la capa de app deja el aula visible con lecciones vacías.

A esto se suma que el **modelo no escala a N programas sin tocar código** (UUIDs hardcodeados, matrícula cableada a G4), que el **rol Profesor no existe en la práctica** (vacía la épica E4), y que bloques enteros del spec académico están ausentes (escala 1-7, ponderaciones, ventanas de evaluación, evaluación por módulo, RN-T01 trazabilidad, Slack, grabaciones).

**Para G4 hoy todo opera por inercia**: 8 alumnos, todo el contenido abierto (ningún `unlock_at` poblado), nadie cierra matrículas, el quiz no está expuesto al alumno. Los bloqueantes se disparan exactamente cuando intentes operar como producto: cerrar la cohorte, cobrar por planes distintos, abrir G5, o lanzar la evaluación al estudiante.

| # | Subsistema | Solidez | Conformidad | Bloquea v1 |
|---|-----------|:---:|:---:|:---:|
| 1 | Entornos / Multi-tenancy | 🟡 | 🟡 | Sí (acceso post-cierre, escala N programas) |
| 2 | Calendario / Sesiones | 🟡 | 🟡 | Sí (recordatorio audiencia), resto evolución |
| 3 | Classroom (acceso/progreso/comentarios) | 🟡 | 🟡 | Sí (acceso post-cierre), resto evolución |
| 4 | Edición por rol (profesor) | 🔴 | 🔴 | Parcial (XSS recursos, DELETE sin autoría) |
| 5 | Quizes / Evaluaciones | 🔴 | 🔴 | Sí (bypass cert, UI huérfana) |

---

## Verificación independiente del orquestador (los 3 críticos)

Los tres hallazgos críticos fueron re-verificados directamente en código por el orquestador (no solo por los agentes), por ser los de mayor consecuencia:

- **CRÍTICO A (bypass de certificación) — CONFIRMADO, con precisión añadida.** El GET `app/api/classroom/quiz/route.ts` **nunca persiste un intento** (solo hace SELECT sobre `quiz_attempts`, líneas 100-105; no hay INSERT con `questions_presented`). En consecuencia, en `submit/route.ts` el `incompleteAttempt` (línea 111) es **siempre `undefined`**, lo que vuelve **código muerto** la validación de coincidencia de preguntas (líneas 113-128). El cliente controla entonces el set de preguntas y su cantidad: `totalQuestions = correctQuestions.length` (línea 173) sobre `.in("id", questionIds)` **sin filtro `program_id`** (líneas 131-134), y el submit **no re-verifica `min_completion_pct`** (ese gate vive solo en el GET, línea 88). Un POST directo `{programId, answers:{<1 id conocido>:"A"}}` → 100% → `passed` → `issueCertificate`. La raíz es el `/start` ausente, no un check faltante en submit.
- **CRÍTICO B (acoplamiento `status='active'`) — CONFIRMADO.** `0028_fix_rls_content_security.sql` líneas 49, 77 y 106 (`AND e.status = 'active'` en program_modules/lessons/lesson_resources) + `lib/classroom/queries.ts:29` + ambas rutas de quiz (`.eq("status","active")`). Marcar la matrícula como `completed` corta el acceso en app **y** RLS.
- **CRÍTICO C (UI del quiz huérfana) — CONFIRMADO.** Existen 5 componentes (`components/classroom/quiz-{start,in-progress,locked,result-fail,result-pass}.tsx`) pero **ningún page de `app/(classroom)` los importa** (grep vacío). El link "Quizzes" del sidebar apunta a `/admin/quizzes` (sección ops). El alumno no tiene punto de entrada.

> **Matiz de severidad:** como la UI del alumno (C) no existe, el bypass (A) hoy solo es alcanzable por llamada directa a la API con sesión válida — es un **crítico latente**, no en explotación activa. Se vuelve explotación real el día que se conecte el quiz al alumno. Debe arreglarse **antes** de exponer el quiz.

---

## Bloqueantes de v1 (Fase 0)

### 🔴 CRÍTICO A — Bypass de certificación en submit del quiz
- **Qué:** `POST /api/classroom/quiz/submit` no filtra `quiz_questions` por `program_id`, no valida que `questionIds` pertenezcan a un intento presentado (la validación existe pero es código muerto porque el GET no persiste el intento), y no valida el count contra `questions_per_attempt`. La nota es `correctCount / correctQuestions.length`, denominador = preguntas enviadas por el cliente. Además `submit` usa `createAdminClient` (bypassa RLS de `quiz_attempts`) y NO re-verifica `min_completion_pct` (el gate solo vive en el GET).
- **Dónde:** `app/api/classroom/quiz/submit/route.ts:131-134` (`.in('id', questionIds)` sin `program_id`), `:173-174` (`scorePct = correctCount/totalQuestions*100`); `app/api/classroom/quiz/route.ts:100-105` (GET no persiste attempt). Verificado en código.
- **Por qué duele:** Un cliente manipulado (o un alumno con devtools/curl) envía UNA pregunta cuya respuesta conoce → 100% → `passed=true` → `issueCertificate`, sin completar lecciones ni cumplir el gate. Es la lógica que emite el activo de valor del producto (el certificado).
- **Fix:** (1) crear `POST /api/classroom/quiz/start` que persista el attempt con `started_at` + `questions_presented` fijo; (2) en `submit` derivar el set de preguntas y el gate de ese attempt persistido; (3) filtrar `quiz_questions` por `program_id` del enrollment; (4) exigir `questionIds.length === questions_per_attempt` y pertenencia al attempt; (5) re-verificar `min_completion_pct`.

### 🔴 CRÍTICO B — Doble acoplamiento acceso↔`status='active'`
- **Qué:** El acceso al contenido del classroom se condiciona a `enrollment.status='active'` en DOS capas: el gate de app (`getEnrollmentForUser`) y las tres políticas RLS de catálogo de 0028.
- **Dónde:** `lib/classroom/queries.ts:29` (`.eq('status','active')`), `lib/classroom/access.ts:28`; `db/migrations/0028_fix_rls_content_security.sql:49` (program_modules), `:77` (lessons), `:106` (lesson_resources). Verificado.
- **Por qué duele:** Contradice RN-T03 (estado académico ≠ acceso técnico) y RN-049/050 (acceso permanente post-cohorte). El día que operación marque las matrículas de G4 como `completed` al cerrar — flujo esperado para reportes/certificados — todos los alumnos pierden acceso al aula desde la app Y desde la RLS. El default de `enrollment_status` es `'invited'`, así que cualquier camino futuro que respete el default también deja al alumno sin acceso silenciosamente.
- **Fix:** Aceptar `status IN ('active','completed')` para LECTURA del contenido en el gate de app **y** en las tres policies de 0028; reservar el bloqueo a `'dropped'/'suspended'`. Idealmente introducir un estado de acceso (`active/alumni/revoked`) separado del estado académico. Tocar solo la app NO basta.

### 🔴 CRÍTICO C — UI del quiz del alumno huérfana
- **Qué:** Ningún `page` del classroom importa `QuizStart/QuizInProgress/QuizLocked/QuizResult`; `GET /api/classroom/quiz` solo lo referencia su test. El link "Quizzes" del sidebar apunta a `/admin/quizzes`. El alumno no tiene punto de entrada para rendir el quiz.
- **Dónde:** `components/classroom/quiz-*.tsx`, `app/api/classroom/quiz/route.ts:7`, `components/classroom/sidebar.tsx:313`.
- **Por qué duele:** Todo el backend de scoring/certificado existe pero es inalcanzable desde la UX del estudiante. E7 no se puede ejercer. Confirmar si es feature no lanzada (intencional) o regresión.
- **Fix:** Crear el `page`/route del classroom que llame al GET, renderice según estado y postee al submit. Coordinar con el fix de CRÍTICO A (el `/start` debe existir antes de exponer la UI).

### 🟠 HIGH D — Recordatorio de clases `capital_inteligente` a toda la cohorte
- **Qué:** El cron corre con `service_role` (bypassa RLS), consulta enrollments por `cohort_id + status='active'` sin filtrar `segment`, y ni siquiera trae la columna `audience` en el select de la sesión. Las clases con `audience='capital_inteligente'` generan correo a TODOS los alumnos activos.
- **Dónde:** `app/api/cron/session-reminders/route.ts:56-63` (select sin audience), `:127-142` (recipients sin segment). La vista del alumno SÍ respeta la segmentación (RLS 0024), el cron no.
- **Fix:** Traer `session.audience`; si `='capital_inteligente'`, filtrar enrollments por `segment='capital_inteligente'`. Agregar `.in('modality', ['live_in_person','live_online'])` para no recordar grabadas.

### 🟠 HIGH E — Rol Profesor inexistente en práctica (vacía E4)
- **Qué:** `system_role` es `('user','ops','admin')` — sin `'teacher'`. El docente real vive como `system_role='user'` + fila en `cohort_roles`. El layout admin gatea a `['ops','admin']` con `redirect('/classroom')`, así que el profesor es expulsado del editor. `requireStaff()` admite un `'teacher'` que ninguna fila puede tener: rama muerta, y su test valida un estado imposible (falsa confianza). RN-052/053 (profesor edita SU módulo) ausente; la RLS sí contempla `is_cohort_staff` pero la app nunca deja entrar al profesor.
- **Dónde:** `db/migrations/0007:10`, `lib/auth/authorize-admin.ts:64`, `app/(admin)/layout.tsx:28`, `lib/auth/__tests__/authorize-admin.test.ts:94`.
- **Fix:** Decidir el modelo (habilitar cohort-staff con scoping a su módulo, o eliminar la rama fantasma y documentar admin-todo). Hoy el código miente sobre lo que soporta.

### 🟠 HIGH F — DELETE de recursos sin autoría/scope + XSS almacenado
- **Qué:** (1) `DELETE /api/admin/resources` borra por id sin verificar `created_by` ni programa, sin `.select()`, devolviendo `{deleted:true}` aunque RLS no borre nada (el teacher está excluido del delete por RLS, asimetría con insert/update que sí permiten `is_cohort_staff`). RN-069 roto en app y en RLS. (2) `POST /api/admin/resources` no valida URL/protocolo (a diferencia de su gemelo `session-resources`): un recurso `javascript:...` se renderiza como enlace clicable al alumno.
- **Dónde:** `app/api/admin/resources/route.ts:21` (sin zod url), `:81-94` (delete sin autoría/select); RLS asimétrica en `0007:324/336/348`; render clicable al alumno en `components/classroom/lesson-video-section.tsx:176` (NO en `resource-manager.tsx:112`, que muestra texto plano — corrección del verificador).
- **Fix:** Reutilizar el schema zod de `session-resources`; en delete cargar el recurso, exigir `created_by===user.id OR ops/admin`, validar programa, `.delete().select()` y 404 si vacío.

---

## Solidez priorizada (hacer más sólido lo que existe)

| ID | Severidad | Subsistema | Hallazgo | Estado verif. |
|----|-----------|-----------|----------|---------------|
| S-A | 🔴 critical | Quizes | Bypass de certificación (submit sin program_id/count/completitud) | confirmado + verificado en código |
| S-B | 🔴 critical | Entornos/Classroom | Acceso atado a `status='active'` en app + RLS (expulsa al cerrar) | confirmado + verificado en 0028 |
| S-C | 🔴 critical | Quizes | UI del quiz del alumno huérfana (E7 inalcanzable) | confirmado |
| S-D | 🟠 high | Calendario | Recordatorio `capital_inteligente` a toda la cohorte | confirmado |
| S-E | 🟠 high | Edición | Rol teacher fantasma (rama muerta, profesores bloqueados) | confirmado |
| S-F | 🟠 high | Edición | DELETE recursos sin autoría/scope + XSS en POST | confirmado (superficie XSS recolocada a lesson-video-section.tsx:176) |
| S-G | 🟠 high | Calendario | `rescheduled_from` self-loop; sin updated_at ni bitácora → trazabilidad de reprogramación = cero | confirmado (peor que "rota") |
| S-H | 🟠 high | Quizes | `time_limit_minutes` no validado server-side (timer 100% cliente, evadible) | confirmado |
| S-I | 🟠 high | Quizes | Sin `/start`: cada GET re-randomiza, "pausar y retomar" es falso, rama de attempt incompleto es código muerto | confirmado |
| S-J | 🟡 medium | Calendario | Alumno ve sesiones canceladas con botón "Entrar" activo (vista ignora `status`) | confirmado (peor: meeting_url vivo) |
| S-K | 🟡 medium | Classroom | Lección no valida `lesson.module_id == moduleId` → breadcrumb/prev-next mal | confirmado |
| S-L | 🟡 medium | Entornos | Página de lección sin cross-check `lesson.program===cohort.program` (depende solo de RLS); falta cubrir también el módulo | confirmado + omisión (cubrir módulo Y lección) |
| S-M | 🟡 medium | Quizes | Race de doble-submit (check-then-act sin lock) | matizado a medium: doble certificado mitigado por unique(enrollment_id); daño real = attempt duplicado |
| S-N | 🟡 medium | Edición/Quizes | Regenerar quiz hard-borra el pool sin traza, invalida `questions_presented` de attempts pasados | confirmado |
| S-O | 🟡 medium | Classroom | POST manual-complete puede marcar completada lección sin video | matizado a low-medium: solo alcanzable por API directa, no por UI |
| S-P | 🟡 medium | Entornos | Asignar teacher sobrescribe `teacher_id` de TODOS los módulos del programa (mezcla scope cohorte/programa) | confirmado |
| S-Q | 🟢 low | Entornos | Interpolación de `cohortSlugFromPath` en `.or()` de PostgREST (anti-patrón de inyección de filtro) | confirmado (alcanzable vía x-pathname; RLS acota daño) |
| S-R | 🟢 low | Entornos/Classroom | `cohort_roles` DELETE no transaccional con enrollment; estados pueden divergir | confirmado |
| S-S | 🟢 low | Classroom | Comentarios sin paginación (GET trae todo) | confirmado (no urge con G4) |
| S-T | 🟢 low | Classroom/Edición | DELETE de comentarios/recursos responde ok aunque RLS bloquee (sin `.select()`) | confirmado |
| S-U | 🟢 low | Calendario | Reminder fallido no reintenta: la reserva queda tomada, fallo transitorio de Resend pierde el recordatorio | omisión verificada |
| S-V | 🟢 low | Edición | Reemplazo de video Mux y revocación de roles sin actor/timestamp | confirmado |
| S-W | 🟢 low | Entornos | Registry referencia Workshop programId no seedeado (inconsistencia código↔DB) | confirmado |
| S-X | 🟢 low | Calendario | RLS `instructors_staff_write` usa columna legacy `role`, no `system_role` (latente) | confirmado |
| S-Y | 🟢 low | Transversal | RLS de recursos usa `role` mientras la app usa `system_role`: divergencia → autorización inconsistente silenciosa | omisión verificada |

**Hallazgos refutados/degradados** (descartados o ajustados por la verificación):
- **S-M (race de doble certificado):** degradado de high a medium — el `UNIQUE(enrollment_id)` en `certificates` (0015:96) mitiga el doble certificado a nivel DB; el daño alcanzable se reduce a un `quiz_attempt` duplicado.
- **S-O (manual-complete sin video):** degradado a low-medium — solo alcanzable por llamada directa a la API, impacto vía UI nulo.
- **CONF-13 (complete-profile "ignora" branding):** ajustado — el copy/títulos POR ENTORNO sí se aplican; lo que se rompe es exclusivamente el ACENTO de color (cosmético, acotado), no toda la identidad.

---

## Conformidad RN-por-RN por subsistema

### 1. Entornos / Multi-tenancy

| RN/Foco | Estado | Nota |
|---------|:------:|------|
| E1 — Roles base (system_role + cohort_role) | ✅ implementada | Dos niveles coherentes con ADR-0004. `requireStaff` con 'teacher' fantasma (rama muerta). |
| RN-002/T04 — Cohorte como unidad de segmentación | 🟡 parcial | Datos/calendario/progreso por cohorte; reportes formales y Slack ausentes. |
| RN-T02 — Separación visibilidad/edición | ✅ implementada | RLS separa SELECT amplio de write staff. |
| RN-T03 — Estado académico vs acceso técnico | ❌ contradice | Acceso atado a `enrollment.status='active'` (ver S-B). |
| RN-058 — Canal Slack por cohorte | ❌ ausente | Solo placeholder `slack_channel_id`, cero uso. |
| RN-049/050 — Acceso permanente post-cohorte | 🟡 parcial | Se cumple solo por inercia; se rompe al marcar 'completed'. |
| RN-T01 — Trazabilidad de acciones críticas | 🟡 parcial | Solo metadatos puntuales; sin tabla de auditoría central. |
| RN-051..054 — Gobernanza por rol | 🟡 parcial | Asignación de roles vía API; sin CRUD de cohortes/programas en app. |
| Foco — ¿Escala a N programas sin código? | ❌ contradice | UUIDs hardcodeados + seed por migración SQL. Matiz: las RLS de creación (`programs_insert_admin`, `cohorts_insert_staff`) YA existen — falta solo la capa de app. |
| Foco — Matrícula plan→cohorte | ❌ contradice | `enrollDiplomadoBuyer` siempre matricula en G4; segmento por dominio de email (contradice 0024). |
| Foco — Estados de cohorte modelados | 🟡 parcial | Enum existe y se usa en lecturas; sin transiciones desde la app; closed/archived no gatean acceso. |
| Foco — Aislamiento real entre tenants | ✅ implementada | RLS de catálogo cerrada en 0028; falta cross-check en app (S-L). |
| Memoria — Branding por entorno | 🟡 parcial | Registry centraliza; complete-profile rompe solo el ACENTO de color (cosmético). |

### 2. Calendario / Sesiones

| RN/Épica | Estado | Nota |
|----------|:------:|------|
| E2/RN-055 — Solo ops/admin CRUD de sesiones | ✅ implementada | authorizeAdmin + service_role; RLS no abre escritura por cliente. |
| E5 — Estados de sesión | 🟡 parcial | Enum completo y editable; el alumno lo ignora (deriva timing del reloj). |
| RN-056 — Notificación de reprogramación | ❌ ausente | PATCH detecta cambio de fechas pero no notifica (ni email ni Slack). |
| RN-T01 — Trazabilidad de reprogramación | ❌ contradice | `rescheduled_from` self-loop; sin updated_at ni bitácora (S-G). |
| RN-062 — Recordatorios 1h antes | ✅ implementada | Cron bien construido (idempotencia + reserva). Bug: no filtra audiencia (S-D). |
| RN-059/E12 — Slack al inicio de clase | ❌ ausente | Sin integración Slack; sin job de transición automática de estado. |
| RN-066/E5 — Grabaciones | ❌ ausente | `recording_url` columna muerta (sin lectura/escritura/editor). |
| RN-064/065 — Enlace externo Zoom/Meet | ✅ implementada | `meeting_url` + botón "Entrar"; admite evolución a embebido. |
| E5 — Recursos por clase | ✅ implementada | `session_resources` con RLS por audiencia + filtro http/https anti-XSS. |
| RN-010 — Reglas día/modalidad obligatoria | ❌ ausente | No validado; el calendario real (ADR-0008) difiere del spec v0. Sin impacto: el spec era v0. |
| Audiencia diferenciada en recordatorios | 🟡 parcial | Vista del alumno respeta segmentación; recordatorios NO (S-D). |

### 3. Classroom

| RN/Épica | Estado | Nota |
|----------|:------:|------|
| RN-003 — Acceso secuencial estricto | ❌ ausente | No hay gating por avance; solo `unlock_at` (calendario). |
| RN-004 — Apertura por calendario en la COHORTE | 🟡 parcial | `unlock_at` vive en `lessons` (compartido por todas las cohortes del programa); sin UI admin. |
| RN-009 — Contenido bloqueado pre-inicio | 🟡 parcial | UI existe pero inactiva en prod (seed 0022 no puebla `unlock_at`). |
| RN-017 — Avance por quiz + tarea | ❌ ausente | Quiz emite certificado pero no desbloquea módulos; no existe entidad tarea/entrega. |
| RN-049/050 — Acceso permanente post-cohorte | ❌ contradice | Ver S-B. |
| RN-067/068 — CRUD de recursos por rol | 🟡 parcial | Crear+eliminar sí; editar no; recursos a nivel módulo no existen como entidad. |
| RN-069 — Profesor elimina solo lo suyo | ❌ contradice | App no filtra `created_by`; RLS excluye al teacher de borrar (ni el suyo). |
| RN-070/T01 — Trazabilidad de recursos | 🟡 parcial | Solo creación; sin updated_by/deleted_by; delete físico. |
| RN-071/072 — Comentarios con hilos | ✅ implementada | Por lección, hilos de 1 nivel, optimistic UI, sanitiza. |
| RN-073 — Destacar comentario | ❌ ausente | Sin columna ni UI. |
| RN-074 — Adjuntos en comentarios | ❌ ausente | Texto plano. |
| RN-T02 — Moderación staff | 🟡 parcial | RLS permite a staff borrar, pero la UI nunca expone la acción para comentarios ajenos. |
| E9 — Progreso server-autoritativo | ✅ implementada | `computeServerProgress` (max_position, umbral 90%, no retrocede, unicidad). Sólido. |
| E9 — Reporte de avance para staff | 🟡 parcial | Existe pero O(alumnos×lecciones) en memoria; no escala. |

### 4. Edición por rol (profesor/operación/admin)

| RN | Estado | Nota |
|----|:------:|------|
| RN-051 — Estructura la crea Admin/Dirección | ✅ implementada | Write de `program_modules` = `is_platform_staff`. |
| RN-052 — Profesor carga/edita SU módulo | ❌ ausente | Profesor real expulsado del editor; sin scoping por módulo. |
| RN-053 — Alcance operativo del profesor | ❌ ausente | Notas/evaluaciones cableadas a authorizeAdmin (sin teacher). |
| RN-T02 — Separación visibilidad/edición | 🟡 parcial | Separación binaria vía layout; páginas hoja sin gate propio. |
| RN-067/068 — Subir/editar recursos por rol | ❌ contradice | requireStaff con teacher fantasma vs layout ops/admin: neto solo ops/admin. |
| RN-069 — Eliminar solo lo suyo | ❌ contradice | Sin filtro `created_by`; RLS delete excluye teacher. |
| RN-070 — Trazabilidad de gestión de recursos | 🟡 parcial | Solo creación; sin edición, sin deleted_by. |
| RN-T01 — Trazabilidad de acciones críticas | 🟡 parcial | Fuerte en roles/transcripts; ausente en recursos/video/revocación. |

### 5. Quizes / Evaluaciones

| RN/Épica | Estado | Nota |
|----------|:------:|------|
| E7/RN-017 — Avance por módulo (eval + tarea) | 🟡 parcial | Gate de completitud a nivel programa, no por módulo; no bloquea avance. |
| RN-025 — 1 solo intento (MVP) | ❌ contradice | Default `max_attempts=3`. |
| RN-026 — Respuestas/feedback solo al finalizar | ✅ implementada | GET nunca expone correct_option; feedback solo en submit. Sólido. |
| RN-027/028/029/030 — Ventana de apertura/cierre | ❌ ausente | Sin columnas ni lógica temporal; solo gate de completitud. |
| RN-031 — Escala 1,0-7,0 | ❌ contradice | Todo en porcentaje. |
| RN-032/033/034 — Ponderaciones + nota final | ❌ ausente | Sin componentes evaluativos ni cálculo ponderado. Gap más grande de E10. |
| RN-035/036 — Carga/edición de notas con traza | ❌ ausente | Notas solo automáticas; sin auditoría con motivo. |
| RN-037/038 — Publicación manual de notas | ❌ ausente | Resultado inmediato; sin estados borrador/publicada. |
| RN-039 — Edición post-cierre solo Admin | ❌ ausente | Depende de ventana + edición, ambas ausentes. |
| E7 — Notificaciones de evaluación | ❌ ausente | Infra de recordatorios existe pero no aplica a quizes. |
| E7 — Creación/edición de evaluaciones | 🟡 parcial | CRUD de preguntas/config solo ops/admin; un único quiz por programa. |
| RN-T01 — Trazabilidad del subsistema | ❌ ausente | Sin auditoría de notas/intentos; regenerar borra el pool sin log. |

---

## Próximo nivel (el salto de mejora — evolución, no v1)

1. **Catálogo de tenants declarativo + mapeo plan→cohorte** (Entornos, L). Tabla `program_branding` + `plan_enrollment_map`; el webhook consulta datos en vez de `enrollDiplomadoBuyer` cableado. Desbloquea "escala a N programas sin tocar código". Menos trabajo de lo implícito: las RLS de creación ya existen.
2. **Estado de acceso separado del estado académico** (Classroom/Entornos, M). `active/alumni/revoked` vs `en_curso/aprobado/finalizado`. Garantiza RN-049/050 por diseño y habilita reportes de aprobación sin expulsar al alumno. (Cierra S-B de raíz.)
3. **Modelo de evaluaciones por módulo** (Quizes, L). Entidad `evaluation` ligada a `program_module`, con ventana e intentos propios; el quiz final pasa a ser `type='final'`. Base de RN-017/027 y E10.
4. **Escala 1,0-7,0 + componentes evaluativos ponderados** (Quizes, L). Da valor académico/SENCE al certificado; separa el resultado bruto de la nota oficial.
5. **Estados de nota + publicación manual + auditoría con motivo** (Quizes, M). RN-037/038/035/036/039 + RN-T01; activa la migración 0009 (hoy 'pendiente').
6. **Bitácora de auditoría central** (Transversal, M). `audit_events(actor, action, entity, before, after, at)` desde rutas admin críticas. Base de RN-T01 para todo el sistema.
7. **Notificación + trazabilidad de reprogramación** (Calendario, M). Email + Slack al mover fecha + bitácora old/new/autor. La pieza operativa más pedida (Paola: mover el calendario).
8. **Estado de sesión en vivo reflejado al alumno + Slack al inicio** (Calendario, M). Job que transiciona por reloj; badge real; aviso a Slack (RN-059/E12).
9. **Calendario de apertura por cohorte** (Classroom, M). Tabla puente `cohort_lesson_schedule`; prerrequisito para operar G4 y G5 del mismo programa con fechas distintas.
10. **Acceso secuencial estricto real (RN-003) + gating por evaluación (RN-017)** (Classroom, L). Convierte el quiz de "compuerta del certificado" a "compuerta de avance".
11. **Habilitar de verdad el rol Profesor con scoping a su módulo** (Edición, L). Desbloquea E4 completa; la RLS ya lo soporta, falta la capa de app + asignación por módulo.
12. **Provisioning del canal Slack por cohorte (RN-058)** (Entornos, M). Activa la columna existente; comunicaciones grupales por cohorte.
13. **Grabaciones: `recording_url` en editor + enlace al alumno** (Calendario, S). Activa la columna muerta; RN-066 con esfuerzo mínimo.

---

## Matriz de prioridad (impacto × esfuerzo × bloquea-v1)

| Acción | Tipo | Severidad | Esfuerzo | Bloquea v1 |
|--------|------|:---:|:---:|:---:|
| Cerrar bypass de certificación (submit: program_id + count + completitud) | solidez | 🔴 crit | M | **Sí** |
| Desacoplar acceso de `status='active'` (app + RLS 0028) | solidez | 🔴 crit | M | **Sí** |
| Conectar UI del quiz del alumno | conformidad | 🔴 crit | M | **Sí** |
| Filtrar audience/segment/modalidad en cron | solidez | 🟠 high | S | **Sí** |
| DELETE recursos con autoría + validar URL POST | solidez | 🟠 high | S | **Sí** |
| Forzar intento único + unique index parcial (race) | conformidad | 🟠 high | S | **Sí** |
| `/start` persistido (re-random, timer, pausar/retomar) | solidez | 🟠 high | M | **Sí** |
| Decidir/materializar rol Profesor | conformidad | 🟠 high | L | Parcial |
| Reflejar estado de sesión al alumno (ocultar canceladas) | solidez | 🟡 med | S | No (UX/datos) |
| Cross-check tenant en página de lección (módulo Y lección) | solidez | 🟡 med | S | No (defensa profundidad) |
| Catálogo declarativo + mapeo plan→cohorte | sig. nivel | 🟠 high | L | **Sí antes de G5** |
| Bitácora de auditoría central (RN-T01) | conformidad | 🟡 med | M | No (gobernanza) |
| Calendario de apertura por cohorte | sig. nivel | 🟡 med | M | **Sí antes de 2ª cohorte** |
| Modelo de evaluaciones por módulo + escala 1-7 | sig. nivel | 🟡 med | L | No (evolución E7/E10) |

---

## Roadmap por fases

### Fase 0 — Solidez / bloqueantes (antes de declarar v1)
- **Cerrar el bypass de certificación** (S-A): filtrar `program_id`, validar count contra `questions_per_attempt`, validar pertenencia al attempt, re-verificar `min_completion_pct` en submit.
- **Desacoplar acceso de `status='active'`** (S-B) en gate de app Y en las tres policies RLS de 0028: aceptar `('active','completed')`, bloquear solo `dropped/suspended`.
- **Conectar la UI del quiz del alumno** (S-C) — o confirmar que es feature no lanzada y documentarlo.
- **Filtrar audience/segment/modalidad en el cron** (S-D).
- **DELETE de recursos con autoría/scope/`.select()` + validar URL en POST** (S-F).
- **Forzar intento único (RN-025) + unique index parcial** (cierra S-M).
- **`/start` persistido** (cierra S-H, S-I y habilita validación de tiempo/ventana).
- **Reflejar estado de sesión al alumno** (ocultar canceladas, no mostrar "Entrar" en canceladas) (S-J).
- **Cross-check `lesson.program===cohort.program` y `lesson.module_id===moduleId`** en la página de lección (S-K, S-L), cubriendo módulo Y lección.
- **Decidir el rol Profesor** (S-E): habilitar con scoping, o eliminar la rama fantasma + su test.

### Fase 1 — Conformidad core (lo que el negocio espera de una plataforma operable)
- **Catálogo de tenants declarativo + mapeo plan→cohorte** — antes de G5 (evita que todo comprador caiga en G4). Las RLS de creación ya existen.
- **Calendario de apertura por cohorte** (`cohort_lesson_schedule`) — antes de la 2ª cohorte del mismo programa.
- **Bitácora de auditoría central (RN-T01)** desde rutas admin críticas; activar migración 0009.
- **Notificación + trazabilidad de reprogramación (RN-056)** — pieza operativa pedida.
- **Estado de sesión en vivo reflejado + Slack al inicio (RN-059/E12)**.
- **Grabaciones: `recording_url` en editor + enlace al alumno (RN-066)** — esfuerzo S.
- **Tests de la lógica que da acceso/dinero**: `getLessonStatus`, `computeServerProgress`, branch `completed`, gate del GET del quiz, scoring del submit, idempotencia/audiencia del cron, conversión TZ.

### Fase 2 — Próximo nivel (evolución, antes de escalar)
- **Estado de acceso separado del estado académico** (cierra S-B de raíz; habilita alumni read-only).
- **Modelo de evaluaciones por módulo + escala 1,0-7,0 + ponderaciones** (E7/E10 real).
- **Estados de nota + publicación manual + auditoría de cambios con motivo** (RN-035..039).
- **Acceso secuencial estricto (RN-003) + gating por evaluación (RN-017)**.
- **Habilitar rol Profesor con asignación por módulo + scoping de edición** (E4 completa).
- **Provisioning del canal Slack por cohorte (RN-058)**; comentarios: destacar (RN-073), adjuntos (RN-074), moderación desde UI.
- **Paginación de comentarios + reporte de progreso agregado en SQL** (antes de cohortes de 200+).
- **Ciclo de vida de cohorte gestionable desde el admin** (transiciones planned→active→closed→archived).

### Qué NO es necesario para v1
- Escala 1-7, ponderaciones, ventanas de evaluación, estados de nota: el spec es v0 y G4 usa un quiz final único — postergar a Fase 2 salvo exigencia SENCE concreta.
- Slack, grabaciones, destacar/adjuntar comentarios: mejoras de comunicación/UX, no bloquean salir.
- Paginación y agregados SQL: no urgen con cohortes chicas (G4 = 8 alumnos).
- Refactor del god-file de sesiones, doble árbol de onboarding: deuda de mantenibilidad.

---

## Crítico de completitud / cobertura de RN del propio audit

El audit cubrió bien la columna técnica del producto, pero **dejó fuera bloques completos del spec que no quedaron mapeados a ningún subsistema** y que un producto académico formal necesitará:

1. **Asistencia (E6 / RN-011 / RN-012) — NO cubierta por ningún subsistema.** El spec contempla registro de asistencia (presencial por QR/check-in, online por ingreso) por sesión, con efecto académico (≥85% para certificar). No hay subsistema de asistencia auditado; `class_sessions` no tiene tabla de asistencia, ni `enrollments` un agregado. **Gap de cobertura: falta un subsistema de asistencia completo.**

2. **Tareas / Entregas (E8) — NO cubierta.** El reporte de classroom confirma que "no existe entidad tarea/assignment/entrega" (grep vacío en migraciones), pero ningún subsistema audita E8. Es prerrequisito de RN-017 (avance por quiz + tarea), que queda colgando sin pata de entregas. **Gap: E8 no mapeada.**

3. **Certificación (E11) — cubierta solo tangencialmente.** El subsistema de quizes audita la EMISIÓN (`issueCertificate`) y la megaauditoría previa cubrió storage privado + signed URLs + `verification_code`. Pero el ciclo completo de E11 (plantilla por programa, datos del certificado, verificación pública, reemisión, vínculo a la nota final ponderada) NO tiene subsistema dedicado. El bypass de certificación (S-A) es justamente el punto donde la falta de un subsistema de certificación dejó un agujero sin dueño.

4. **Notificaciones (E12) — cubierta de forma fragmentaria.** Se cubren recordatorios de sesión (E12 parcial) y se constata la ausencia de Slack (RN-058/059) y de avisos de evaluación (E7). Pero no hay un subsistema transversal que consolide emails transaccionales + recordatorios + avisos de evaluación + reprogramación con política común (reintentos, plantillas por entorno, deduplicación). **Gap: E12 como sistema transversal no auditado.**

5. **Trazabilidad transversal (RN-T01) — diagnosticada como ausente en CUATRO subsistemas, pero sin dueño.** Es el síntoma de que falta una decisión arquitectónica única (la tabla `audit_events`) en vez de cinco parches locales. Esta síntesis lo consolida en una sola acción y recomienda elevarlo a ADR de plataforma.

6. **Búsqueda, capítulos, resúmenes IA, transcripción interactiva (PRDs en `docs/`) — fuera de alcance.** Hay PRDs escritos cuya conformidad NO fue auditada en esta pasada. Si esas features están en producción, su solidez/conformidad es un punto ciego declarado.

**Conclusión del crítico:** la cobertura es fuerte en multi-tenancy, acceso, progreso, edición y evaluación, pero deja tres bloques de negocio sin dueño (asistencia E6, tareas E8, certificación E11 como ciclo completo) y dos transversales fragmentados (notificaciones E12, trazabilidad RN-T01). Para un spec v0 es aceptable como priorización, pero deben nombrarse como deuda de cobertura, no asumirse como "no existen". Recomendación: una pasada dirigida a E6/E8/E11 antes de Fase 2, y elevar RN-T01 a ADR.

---

## Puntos ciegos de esta síntesis
- Síntesis **estática** sobre 5 reportes + sus verificaciones adversariales, con verificación directa en código de los tres críticos (bypass de quiz en `submit/route.ts` + GET sin persistir attempt, doble acoplamiento `status='active'` en 0028, UI huérfana). El resto se apoya en la evidencia citada por cada subsistema.
- No se midió carga real, no se ejecutó el bypass de certificación end-to-end en vivo, ni se inspeccionó la base de producción (cuántas matrículas hay en estados distintos de `active`, si algún certificado se emitió por el camino vulnerable).
- E6/E8/E11/E12 y los PRDs de IA quedaron fuera del alcance de los 5 subsistemas y se reportan como gaps de cobertura, no como diagnóstico.
