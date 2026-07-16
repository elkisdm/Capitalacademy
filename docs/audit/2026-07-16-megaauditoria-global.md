# Megaauditoría global — Capital Academy

**Fecha:** 2026-07-16
**Alcance:** seguridad/RLS, drift datos↔migraciones, correos y crons, performance, UX/consistencia, conformidad/deuda, pagos/matrícula.
**Método:** hallazgos generados por auditores especializados y sometidos a verificación adversarial (3 votos por hallazgo, contra código y BD de producción). Solo se listan como CONFIRMADOS los que sobrevivieron esa verificación.

---

## 1. Resumen ejecutivo

| Categoría | Conteo |
| --- | --- |
| Confirmados críticos | 1 |
| Confirmados altos | 8 |
| Medios/bajos NO verificados adversarialmente | 40 (12 medios, 28 bajos) |
| Refutados en verificación | 2 |
| **Total analizado** | **51** |

De los 9 confirmados, 4 coinciden con pendientes ya conocidos del equipo (marcados **conocido**); los 5 restantes son novedades.

### Los 5 riesgos principales (en lenguaje de negocio)

1. **Fraude de certificación.** Un alumno autenticado puede auto-emitirse un diploma real, firmado y verificable, **sin haber rendido ni aprobado el examen**, hablándole directo a la API de datos. La credencial que vende la plataforma deja de garantizar nada. *(Crítico.)*

2. **Certificados que no respetan la regla del programa.** El emisor no valida asistencia mínima ni nota: un alumno del Workshop (examen final activo hoy) que nunca asistió puede aprobar el quiz y recibir el certificado de un programa que exige 85% de asistencia. Hoy hay 0 certificados emitidos, así que el primero ya nacería fuera de norma. *(Alto.)*

3. **Correos masivos del Ciclo CI a punto de dispararse.** El 21-jul y el 11-ago la cohorte gratuita interna de Capital Inteligente (239 matrículas) ejercita por primera vez dos crons que nunca vieron ese volumen: los recordatorios pueden **reenviarse 5-7 veces** a los primeros destinatarios (o perderse en masa por rate-limit), y la alerta de inasistencias enviará a ~200 personas internas un correo que las acusa de estar al borde del "máximo permitido" de un régimen que no aplica a ese programa. Daño reputacional del canal de captación y confusión interna. *(Dos hallazgos altos, ventana inminente.)*

4. **Fuga de ingresos por cupón abierto.** El cupón `LANZAMIENTO50` (50% de descuento) sigue vivo en prod **sin expiración ni tope de usos**: cualquiera que conozca o adivine el código compra el Diplomado a la mitad, hoy y para siempre. *(Conocido — cupones.)*

5. **Trabajo administrativo y de alumnos que se pierde en silencio.** Acciones críticas fallan sin ningún aviso: revocar el acceso de un alumno a una cohorte (el admin cree que lo revocó y sigue matriculado), moderar el foro (eliminar contenido inapropiado que sigue publicado), y —del lado del alumno— un parpadeo de red al **enviar el examen final descarta las 20 respuestas** y obliga a rehacerlo desde cero. Además, la tabla `leads` con PII de prospectos no existe en el control de versiones, así que ningún entorno se reconstruye ni se audita desde la fuente de verdad declarada.

---

## 2. Hallazgos CONFIRMADOS (críticos y altos)

### C1 · [CRÍTICO · seguridad-RLS] Auto-emisión de certificado escribiendo directo en `quiz_attempts`
- **Archivo:** `db/migrations/0015_quiz_and_certificates.sql:129` (policy `quiz_attempts_student_own`)
- **Evidencia:** La policy es `FOR ALL ... USING (enrollment_id in (...propias enrollments...))` **sin `WITH CHECK`**. En Postgres, una policy `FOR ALL` sin `WITH CHECK` reusa la expresión `USING` como check de INSERT/UPDATE, así que el único requisito para escribir una fila es que el `enrollment_id` sea del propio alumno. Confirmado en prod: `pg_policies` muestra `with_check = null`, y `role_table_grants` confirma que el rol `authenticated` tiene INSERT y UPDATE sobre la tabla. No hay trigger que lo frene. Todo el hardening server-side vive en `/api/classroom/quiz/*`, que se puede saltar hablándole directo a PostgREST.
- **Impacto:** El alumno hace un POST/PATCH directo insertando `{ enrollment_id, evaluation_id: <final>, passed: true, score_pct: 100, completed_at: now() }` (o promoviendo un intento reprobado a `passed=true`). Luego llama a `POST /api/classroom/certificate/retry`, que lee ese intento con el cliente RLS del usuario y emite un PDF de diploma real, firmado y verificable, subido al bucket `certificates`, **sin haber rendido el examen**. Fraude de certificación de extremo a extremo, trazado contra la BD de prod.
- **Fix propuesto:** Reemplazar `quiz_attempts_student_own` (FOR ALL) por una policy solo-SELECT para el alumno y dejar todo INSERT/UPDATE al `service_role` (que ya usan `/start` y `/submit`); o `REVOKE INSERT,UPDATE,DELETE ON public.quiz_attempts FROM authenticated, anon`. Defensa en profundidad: trigger que impida a un cliente `authenticated` setear `passed`/`score_pct`/`completed_at`.
- **Esfuerzo:** **S** (una migración de policy + REVOKE; el flujo server-side ya existe).

### C2 · [ALTO · conformidad-deuda] Certificados sin validar asistencia mínima ni nota
- **Archivo:** `app/api/classroom/quiz/submit/route.ts:197`
- **Evidencia:** El certificado se emite solo con aprobar el quiz (`passed = scorePct >= config.passing_grade_pct` + gate de completitud de lecciones). `lib/certificates/issue-certificate.ts` no referencia asistencia ni nota. Las columnas `programs.min_attendance_pct` (85/75) y `programs.passing_grade` (4.0) existen en prod pero **no tienen ningún lector** en el código. Hay una evaluación `scope='final'` ACTIVA en el Workshop (WS-INMOB).
- **Impacto:** Un alumno del Workshop que nunca asistió puede aprobar el quiz final y recibir un certificado verificable de un programa cuya regla operativa exige 85% de asistencia. Cuando se active el final del Diplomado, el mismo bypass aplica a la credencial principal del negocio.
- **Nota de verificación:** 2 de 3 votos confirmaron. El voto disidente objeta la severidad, no el hecho técnico: sostiene que el "mínimo de asistencia" citado proviene del *contexto* de ADR-0007, no de su *decisión* formal. El defecto de código (emisor ciego a asistencia/nota, columnas dormidas) es real e indiscutido; lo que queda a criterio del equipo es si la regla de negocio debe ser bloqueante ya.
- **Fix propuesto:** Al emitir (o en el gate de `quiz/route.ts`), leer `programs.min_attendance_pct` y cruzar `session_attendance` con las sesiones en vivo de la cohorte (misma definición de inasistencia de ADR-0013). El brief `docs/briefs/evaluaciones-y-notas-1-7.md` ya planifica reutilizar estas columnas; priorizar ese paso o bloquear la emisión mientras tanto.
- **Esfuerzo:** **M** (requiere decidir la regla y cruzar asistencia; parte del brief de notas 1-7).

### C3 · [ALTO · datos-drift] La tabla `leads` (con PII) existe en prod pero no está en `db/migrations/`
- **Archivo:** `app/api/leads/route.ts:64`
- **Evidencia:** Prod tiene `leads` con 17 columnas (`full_name`, `email`, `phone`, `ip_hash`, `utm_*`) y su CHECK, aplicada por dashboard (versión remota `20260508043135 create_leads_table`). Un grep exhaustivo sobre los 69 archivos de `db/migrations/*.sql` no encuentra ninguna referencia a la tabla — es la única de las 37 tablas de prod sin migración local. El código sí depende de ella (formulario de captación de la landing).
- **Impacto:** Cualquier entorno reconstruido desde `db/migrations/` (staging, local, disaster recovery) nace **sin** `leads`: el formulario de la landing devuelve 500 en el primer submit. Sus constraints y RLS de una tabla con PII de prospectos no están versionados ni son revisables.
- **Fix propuesto:** Crear `db/migrations/00XX_leads.sql` con el `CREATE TABLE` + CHECK + índices + policies RLS exactamente como están en prod (`pg_dump --schema-only`) y marcarla como ya aplicada.
- **Esfuerzo:** **S** (dump + migración marcada como aplicada).

### C4 · [ALTO · correos-crons] Recordatorios CAP-CI: 239 envíos secuenciales con techo de 60s → duplicados masivos o pérdidas
- **Archivo:** `app/api/cron/session-reminders/route.ts:259`
- **Evidencia:** Loop de envío secuencial sin throttle (`for ... await send`) con `maxDuration = 60`. La idempotencia es **por sesión, no por destinatario**: si la corrida muere a mitad, la fila queda `pending` y a los 10 min el reclamo la resetea y reenvía **desde el destinatario 1**. Los envíos históricos fueron de 20-24 (Diplomado); nunca se ejercitó volumen alto. La cohorte CAP-CI tiene 239 matrículas activas y su próxima sesión es el **2026-07-21 14:00 UTC**.
- **Impacto:** El 21-jul, si la corrida se corta en el correo ~150, cada corrida posterior (cada 30 min durante la ventana de catch-up) reenvía desde cero: los primeros reciben el recordatorio 5-7 veces. En el escenario de rate-limit de Resend (429), la mayoría de los 239 nunca lo recibe y la fila queda `sent` sin reintento.
- **Fix propuesto:** Trocear el fan-out (batch de Resend o cola por destinatario con registro por-recipient), añadir throttle, y no marcar `sent` si `sent < recipients.length` (o registrar el offset del último enviado para reanudar).
- **Esfuerzo:** **M** (rediseño del fan-out con idempotencia por destinatario; ventana inminente).

### C5 · [ALTO · correos-crons] Alerta de inasistencias sin filtro de programa → ~200+ del Ciclo CI reciben la advertencia
- **Archivo:** `lib/asistencia/queries.ts:236`
- **Evidencia:** `getStudentsAtAbsenceThreshold` evalúa TODAS las cohortes `status='active'` sin excluir programas, y `processAbsenceAlerts` envía al llegar a 2 ausencias. CAP-CI está `active` con 239 matrículas; perderse las sesiones del 21-jul y 11-ago suma 2 ausencias. El ciclo tiene "cupo máx 40" por diseño, o sea que la mayoría de los 239 **no puede** asistir a cada sesión. El correo dice "Registramos 2 inasistencias / Máximo permitido: 3".
- **Impacto:** Alrededor del **2026-08-11 16:30 UTC** el cron enviará en masa a ~200+ personas del ciclo gratuito —incluido el equipo interno de CI— un correo que insinúa que están al borde del máximo permitido de un régimen que no aplica a ese programa.
- **Fix propuesto:** Excluir CAP-CI (y programas de captación/gratuitos) de `processAbsenceAlerts`, o parametrizar la alerta por programa (ADR-0013 la definió para el Diplomado).
- **Esfuerzo:** **S** (filtro por programa en la query).

### C6 · [ALTO · ux-consistencia] Un fallo al ENVIAR el examen final descarta todas las respuestas
- **Archivo:** `components/classroom/quiz-runner.tsx:208`
- **Evidencia:** Ante `!res.ok` o error de red en `submitAttempt` se hace `setPhase({ name: "error" })`, lo que desmonta `<QuizInProgress>` (único lugar donde viven las respuestas, en estado local). La pantalla de error titula "No pudimos cargar el quiz" (aunque el fallo fue al enviar) y su única salida "Reintentar" vuelve al intro con el formulario vacío. Mismo patrón en `evaluation-runner.tsx`. El intento se reanuda server-side, pero las respuestas solo se persisten en el submit, así que no hay nada que recuperar.
- **Impacto:** Un alumno responde las 20 preguntas del examen final (gate del certificado), la red móvil parpadea al pulsar "Enviar" → ve un error engañoso y al reintentar debe responder todo de nuevo. En una evaluación con nota (spec 1-7), pérdida total del trabajo por un fallo de red de un segundo.
- **Fix propuesto:** En el fallo de submit, mantener la fase `in_progress` (o sub-fase `submit_error`) conservando preguntas/respuestas, mostrar el error inline y ofrecer "Reintentar envío" con las mismas respuestas. Corregir el título para distinguir carga vs envío.
- **Esfuerzo:** **M** (cambio de máquina de estados del runner, en dos componentes).

### C7 · [ALTO · ux-consistencia] Quitar el rol de un usuario en una cohorte falla en silencio
- **Archivo:** `app/(admin)/admin/users/[userId]/user-profile-client.tsx:178`
- **Evidencia:** `handleRemoveRole` hace `fetch(... DELETE); if (res.ok) router.refresh();` — sin rama else, sin toast, sin try/catch. El commit de hoy (`bf4c29a`) corrigió exactamente este patrón en `handleAssign` del mismo archivo, pero dejó intacto el `remove` tres funciones más abajo.
- **Impacto:** Un admin confirma "¿Quitar el rol?" para revocar el acceso de un alumno; la API responde 4xx/5xx y no pasa nada visible. El admin cree que revocó el acceso, pero el alumno sigue matriculado y viendo el contenido. Con fallo de red, además, unhandled rejection.
- **Fix propuesto:** Replicar el patrón ya aplicado hoy en `handleAssign`: `else` con `toast(err.error ?? "Error al quitar el rol", "error")` y try/catch para el fallo de red.
- **Esfuerzo:** **S** (patrón ya existe en el mismo archivo).

### C8 · [ALTO · performance] La transcripción VTT completa (~77 KB prom., hasta 143 KB) viaja al cliente en cada carga de lección
- **Archivo:** `app/(classroom)/classroom/[cohortSlug]/[moduleSlug]/[lessonSlug]/page.tsx:343`
- **Evidencia:** La página consulta siempre `lesson_transcripts.select("content_vtt, corrected_vtt")` y pasa ambos strings como props al client component `CollapsiblePlaylist`, que solo usa el contenido cuando el usuario abre la pestaña Transcripción. Prod: 9 transcripts ready, `avg(length) = 77.468` bytes, `max = 143.282`.
- **Impacto:** Cada visita a una lección con transcripción (9 de 11) infla el payload en 77-143 KB de texto plano que el navegador descarga e hidrata como prop, aunque el alumno nunca toque la pestaña. En móvil retrasa el TTI en la pantalla más usada. Si se puebla `corrected_vtt` (hoy ~0 bytes), el costo se duplica.
- **Fix propuesto:** Enviar solo un booleano `hasTranscript` y cargar el VTT bajo demanda vía route handler (`/api/classroom/lessons/[id]/transcript`) al abrir el panel, con `Cache-Control`.
- **Esfuerzo:** **M** (route handler nuevo + carga diferida en el client).

### C9 · [ALTO · performance] Waterfall de ~8 etapas secuenciales en la página de lección, con queries duplicadas
- **Archivo:** `app/(classroom)/classroom/[cohortSlug]/[moduleSlug]/[lessonSlug]/page.tsx:40`
- **Evidencia:** Etapas encadenadas: resolve slugs → `getAuthUser` → access+recordingRedirect → lesson+cohort → modules+progress (con 3 sub-etapas internas) → batch de 6 queries + profile → firma de recursos en Storage. Además duplica trabajo: pide `lesson_resources` de esta lección cuando `getModulesWithLessons` ya las trajo para todas, y `getLessonProgress` repite el `video_progress` que esa misma función ya trajo.
- **Impacto:** Con ~30-80 ms por round-trip, el TTFB de cada navegación acumula 400-700 ms solo en esperas encadenadas, multiplicado por cada clase que abre cada alumno (Diplomado 24 + Workshop 278 matrículas activas). Las queries duplicadas suman 2 round-trips gratis por vista.
- **Fix propuesto:** Reusar resources/progress desde el resultado de `getModulesWithLessons`; adelantar el batch de queries de la lección para que corra en paralelo con `modules` (solo dependen de `lessonId`); mover `getLessonProgress` dentro del `Promise.all`.
- **Esfuerzo:** **M** (reordenar dependencias y eliminar duplicados; comparte fix con los hallazgos de performance del §3).

---

## 3. Hallazgos medios/bajos (NO verificados adversarialmente)

> Estos hallazgos provienen de una sola pasada de auditoría y **no** fueron sometidos al triple voto de verificación. Trátalos como leads a confirmar antes de invertir esfuerzo grande. Se marcan **conocido** los que coinciden con pendientes ya identificados por el equipo.

### Seguridad / autorización
| # | Sev | Hallazgo | Archivo |
| --- | --- | --- | --- |
| M1 | bajo | `programs_select` expone el catálogo completo a cualquier autenticado (sin aislamiento por tenant) | `pg_policies: programs_select` |
| M2 | bajo | Bucket `lesson-content` es público: material pagado descargable sin sesión por URL | `storage.buckets: lesson-content` |
| M3 | bajo | Escalada `system_role→admin` se previene SOLO con un trigger; `authenticated` tiene UPDATE column-level sobre todas las columnas de `profiles` (incl. `email`, `rut`) | trigger `prevent_role_self_escalation` |

### Datos / drift
| # | Sev | Hallazgo | Archivo |
| --- | --- | --- | --- |
| M4 | medio | CHECK `correct_option ('A'-'D')` contradice el código que permite A-F: crear pregunta con respuesta E/F falla con 500 | `lib/classroom/quiz-question-schema.ts:33` |
| M5 | medio | Borrar un usuario destruye en cascada threads del foro con respuestas de OTROS alumnos (contradice el soft-delete) | `db/migrations/0044_conversaciones.sql:32` |
| M6 | medio | Doble fuente `enrollments`↔`cohort_roles` ya divergente: 3 `student` sin matrícula con acceso RLS al contenido | `db/migrations/0007_rbac_cohort_roles.sql:32` |
| M7 | bajo | FK `class_sessions.module_id` sin índice (y otras FKs de cascada). **Conocido** — familia del PATCH `module_id` de repeticiones | `app/api/admin/modules/[moduleId]/route.ts:134` |
| M8 | bajo | `types.ts` desalineado: faltan `has_lesson_access`/`is_lesson_staff` (0065); RPC `get_random_quiz_questions` llamado con `as never` (no existe). **Conocido** — casts provisionales | `lib/supabase/types.ts:2157` |

### Pagos / matrícula
| # | Sev | Hallazgo | Archivo |
| --- | --- | --- | --- |
| M9 | medio | Cupón `LANZAMIENTO50` (50% off) vivo sin expiración ni tope de usos. **Conocido** — cupones | BD `coupons`; `lib/coupons/validate.ts:37` |
| M10 | medio | El UPDATE que guarda `flow_token` no verifica error y el webhook no tiene fallback: un fallo deja un pago cobrable pero inconciliable | `app/api/pago/checkout/route.ts:140` |
| M11 | bajo | Carrera checkout→confirmación permite sobre-redimir cupones con tope (valida al iniciar, descuenta al confirmar). **Conocido** — cupones | `lib/coupons/validate.ts:46` |
| M12 | bajo | Links de cobro genérico (`/pago/cobro`) no expiran ni son de un solo uso: el mismo link se paga N veces | `lib/cobro/sign.ts:19` |
| M13 | bajo | Rate limiting de pagos es in-memory por instancia y con IP de `x-forwarded-for` (burlable en serverless) | `lib/rate-limit.ts:15` |
| M14 | bajo | `enrollBuyer` pisa `full_name` y fuerza `role='student'` del perfil existente al re-comprar. **Conocido** — matrícula post-pago Liderazgo | `lib/classroom/enroll-from-payment.ts:123` |

### Correos / crons
| # | Sev | Hallazgo | Archivo |
| --- | --- | --- | --- |
| M15 | medio | Notificaciones de grabación y de apertura de entregables se marcan completadas aunque TODOS los envíos fallen — sin reintento posible | `lib/classroom/recording-notifications.ts:278` |
| M16 | medio | Correos de grabación ignoran `class_sessions.audience`: una sesión exclusiva de CI se notificaría a toda la cohorte | `lib/classroom/recording-notifications.ts:95` |
| M17 | medio | Dedup `invitation_log` global-por-email sigue vivo en scripts de Workshop y Diplomado (gotcha del launch G4) | `scripts/bulk-invite-workshop.mjs:209` |
| M18 | bajo | El catch-up de la ventana '1h' puede enviar "comienza en ~1 hora" hasta 2h DESPUÉS de iniciada la sesión | `app/api/cron/session-reminders/route.ts:83` |
| M19 | bajo | Pipeline IA del webhook de Mux (transcript/resumen/capítulos) es fire-and-forget sin `waitUntil` en serverless | `app/api/webhooks/mux/route.ts:300` |

### Performance
| # | Sev | Hallazgo | Archivo |
| --- | --- | --- | --- |
| M20 | medio | `getStudentPanelReport` ejecuta 10 queries estrictamente secuenciales (panel diario de la clienta/profesor) | `lib/admin/student-panel-queries.ts:89` |
| M21 | medio | El layout del classroom encadena 6-7 queries secuenciales independientes en cada carga dura | `app/(classroom)/layout.tsx:32` |
| M22 | medio | `getCohortSchedule`/`getModuleSessionsForCohort` encadenan 3 etapas que solo dependen del primer query; firman recursos de todas las sesiones | `lib/classroom/queries.ts:337` |
| M23 | medio | `getModulesWithLessons` sobre-selecciona (`lessons(*)`, incl. `content` Markdown) + etapa secuencial extra de reverse-lookup de grabaciones | `lib/classroom/queries.ts:165` |
| M24 | bajo | `resolveSlug` paga 2 queries secuenciales por parámetro cuando la URL trae UUID (hasta 6 round-trips en la página de lección) | `lib/classroom/resolve-slugs.ts:10` |
| M25 | bajo | `getVisibleCommentCounts` descarga una fila por CADA comentario del foro solo para contarlos en JS | `lib/conversaciones/queries.ts:196` |

### UX / consistencia
| # | Sev | Hallazgo | Archivo |
| --- | --- | --- | --- |
| M26 | medio | Guardar una corrección de transcripción falla sin ningún mensaje (`try/finally` sin catch) | `components/admin/transcript-review.tsx:82` |
| M27 | medio | Si falla la carga de intentos/certificados, el admin ve un empty state engañoso ("Sin respuestas todavía") en vez de error | `components/admin/quiz/evaluation-attempts.tsx:22` |
| M28 | medio | Acciones de moderación del foro (fijar, cerrar, eliminar) fallan en silencio (`catch {}` explícito) | `components/classroom/conversaciones/thread-detail.tsx:911` |
| M29 | medio | "Marcar como completada" falla en silencio; afecta el % de completitud que abre el examen final | `components/classroom/mark-complete-button.tsx:28` |
| M30 | bajo | Eliminar un recurso en el gestor admin falla en silencio pese a que el componente ya tiene estado de error | `components/admin/resource-manager.tsx:206` |
| M31 | bajo | Botones muertos "Próximamente" (3 acciones de cohorte + "Reenviar invitaciones"): solo un tooltip invisible en táctil | `.../cohorts/[cohortId]/cohort-detail-client.tsx:582` |
| M32 | bajo | Pantalla "Mis programas" y estado sin matrícula fuera del design system `ca-` | `app/(classroom)/classroom/page.tsx:60` |
| M33 | bajo | Rutas nuevas sin `loading.tsx`: conversaciones, clase en vivo, entregables, recursos, certificado | `app/(classroom)/classroom/[cohortSlug]/conversaciones/page.tsx` |
| M34 | bajo | Borrar un comentario de lección que falla lo hace reaparecer sin explicación (revert silencioso del optimistic update) | `components/classroom/comment-section.tsx:939` |

### Conformidad / deuda
| # | Sev | Hallazgo | Archivo |
| --- | --- | --- | --- |
| M35 | medio | El quiz final sigue acoplado a `status='active'`, divergiendo de RN-049/050 (`['active','completed']`) del resto de la plataforma | `app/api/classroom/quiz/route.ts:35` |
| M36 | medio | 14 de 16 ADRs siguen en status 'proposed' pese a estar implementados y en producción | `docs/adr/0004-*.md:3` |
| M37 | bajo | Onboarding: el selector de avatar es UI sin backend — la foto elegida se descarta en silencio (TODO) | `.../onboarding/complete-profile-client.tsx:116` |
| M38 | bajo | Código muerto: 543 líneas en 3 componentes inalcanzables (transcript-review, lesson-card, program-filter) | `components/admin/transcript-review.tsx:1` |
| M39 | bajo | Colisión de numeración: dos ADR-0013 distintos coexisten | `docs/adr/0013-alerta-inasistencias-y-expiracion-qr.md` |
| M40 | bajo | Flags/columnas dormidas sin lector: `programs.is_active`, `program_modules.weight` | `lib/supabase/types.ts:1704` |

---

## 4. Hallazgos REFUTADOS en verificación (transparencia)

- **Drift `quiz_attempts.evaluation_id` (CASCADE vs SET NULL):** REFUTADO — la premisa "ninguna migración local altera ese FK" es falsa; `db/migrations/0035_evaluations_hardening.sql:20-26` hace exactamente el `drop constraint` + recreación como `on delete set null`. No hay drift.
- **Pagos exitosos sin matrícula con "3 casos reales en prod":** REFUTADO (2 de 3 votos) — el patrón at-most-once del webhook existe, pero la evidencia central es falsa: los 3 pagos citados son anteriores a la lógica actual y no demuestran la brecha. El riesgo de código sigue latente (ver M10, que sí sobrevive por otra vía), pero el caso "ya ocurrió" no se sostiene.

---

## 5. Plan de remediación sugerido (3 lotes priorizados)

### Lote 1 — Bloqueantes de integridad y fraude (esta semana)
Cierra el fraude de certificación y la fuga de ingresos antes que nada.
- **C1** REVOKE/policy solo-SELECT en `quiz_attempts` (**S**) — máxima prioridad.
- **C2** bloquear emisión de certificado sin asistencia/nota, o al menos gate provisional (**M**).
- **M9** desactivar `LANZAMIENTO50` (`active=false`) — acción de un minuto en BD (**S**, conocido).
- **C3** versionar la tabla `leads` (**S**).

### Lote 2 — Correos y crons antes de la ventana CAP-CI (21-jul / 11-ago)
Estos tienen fecha de detonación; deben estar resueltos antes del 21-jul.
- **C4** batching + idempotencia por destinatario en recordatorios (**M**).
- **C5** excluir CAP-CI/programas gratuitos de la alerta de inasistencias (**S**).
- **M15** no marcar completed cuando `sent==0` (**S**).
- **M16** filtrar por `audience` en correos de grabación (**S**).
- **M17** dedup por enrollment del cohorte en los scripts de invitación (**S**).
- **M10** verificar error del UPDATE `flow_token` + fallback en el webhook (**M**).

### Lote 3 — UX silenciosa, performance y deuda (siguiente iteración)
- **UX de fallos silenciosos** (mismo patrón, resolver en bloque): **C7**, **M26-M30**, **M34** — agregar rama de error/toast a cada `fetch` sin manejo. Reutilizan la infraestructura de feedback ya presente (**S** cada uno).
- **C6** preservar respuestas al fallar el envío del examen (**M**).
- **Performance del classroom** (fix conjunto): **C8**, **C9**, **M20-M25** — diferir VTT, paralelizar waterfalls, eliminar sobre-selección y queries duplicadas (**M** por grupo).
- **M35** alinear el quiz final a `['active','completed']` con test de regresión (**S**).
- **Deuda documental/estructural:** **M36** pase de ADRs a 'accepted', **M39** renumerar el ADR-0013 duplicado, **M38** borrar código muerto, **M8/M40** limpiar tipos y flags dormidas (**S** cada uno).
- **Seguridad de defensa en profundidad:** **M1-M3** (aislamiento de catálogo, bucket privado, column-grants sobre `profiles`) — evaluar según apetito de riesgo (**S-M**).
