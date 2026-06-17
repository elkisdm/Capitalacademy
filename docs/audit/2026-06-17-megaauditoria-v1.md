# Auditoría de seguridad y madurez — Capital Academy: ¿listo para una v1 estable?

> Auditoría multi-agente read-only del 2026-06-17. 69 agentes, 58 hallazgos, 54 confirmados tras verificación adversarial (2 críticos / 7 high / 18 medium / 27 low), 4 descartados. Estática sobre código + migraciones; ver "Puntos ciegos" al final.

## Veredicto

**NO, todavía no.** El producto tiene una base de ingeniería honestamente buena —branding multi-entorno centralizado, CI que es un verdadero gatekeeper, RLS habilitado en todas las tablas, idempotencia de pagos por claves únicas, calendario rediseñado con a11y por encima del promedio— pero arrastra **tres bloqueantes duros que NO puedes llevar a producción tal como están**: (1) la PII completa de TODOS los usuarios (RUT, dirección, teléfono de emergencia, email) es legible por cualquier cuenta autenticada vía el anon key del navegador; (2) el video pagado de Mux se sirve SIN firmar, así que el playback_id es la llave y cualquiera lo extrae de devtools y reproduce el curso sin pagar; (3) el contenido del classroom (videos, módulos, materiales) se filtra entre programas porque la RLS es `auth.uid() is not null`. Los tres rompen el modelo "el programa es el tenant" o filtran datos/activos. Por encima de eso, hay dos bombas de relojería para el próximo lanzamiento (Fintoc no matricula a quien paga, y todo está cableado a G4 hardcodeado) y la cobertura de tests deja sin red justo la lógica que mueve dinero y da acceso. La buena noticia: los bloqueantes son acotados y de fix conocido (políticas RLS + firma de Mux), no rediseños.

| # | Dimensión | Estado |
|---|-----------|--------|
| 1 | Arquitectura | 🟡 |
| 2 | Multientorno (aislamiento de tenant) | 🔴 |
| 3 | Permisos de aplicación (RBAC app) | 🟢 |
| 4 | RLS / base de datos | 🔴 |
| 5 | Carga de recursos (perf/costo) | 🔴 |
| 6 | Modelo de datos | 🟡 |
| 7 | Pagos / webhooks | 🟡 |
| 8 | Robustez v1 | 🟡 |
| 9 | Frontend / UX / a11y | 🟡 |
| 10 | Testing / CI | 🟡 |

---

## Críticos y altos (bloquean v1)

### 🔴 CRÍTICO 1 — PII de todos los usuarios legible por cualquier autenticado
- **Qué:** La policy `profiles_select` es `for select using (auth.uid() is not null)`. La tabla `profiles` contiene email, phone, rut, address, emergency_contact_name, emergency_contact_phone, linkedin_url, bio.
- **Dónde:** `db/migrations/0007_rbac_cohort_roles.sql:146`, columnas en `db/migrations/0014_onboarding_profiles.sql:5`, anon key expuesto en navegador en `lib/supabase/client.ts:4`.
- **Por qué duele:** La app habla con PostgREST usando el anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). RLS es el ÚNICO límite. Cualquier alumno logueado abre la consola del navegador y ejecuta `supabase.from('profiles').select('rut,phone,address,emergency_contact_phone,email')` y se lleva la PII de toda la base, de todos los programas. No requiere privilegios, solo estar logueado. Es una violación de protección de datos personales.
- **Fix:** Restringir `profiles_select` a: el propio usuario (`id = auth.uid()`), staff de plataforma (`is_platform_staff()`), y staff de cohorte que comparta cohorte con el target. Para listados de compañeros, exponer una vista/columnas mínimas (full_name, avatar_url) sin PII, o una RPC `security definer` que filtre columnas. Nunca devolver rut/phone/address por una policy abierta.

### 🔴 CRÍTICO 2 — Playback de Mux sin firmar: el video pagado es público
- **Qué:** El player arma URLs directas a Mux sin token de firma: `https://stream.mux.com/${playbackId}.m3u8`, el `.mp4` y el thumbnail. El gate de auth+enrollment vive solo en el Server Component de la página; el stream se sirve por fuera de ese gate.
- **Dónde:** `components/classroom/video-player.tsx:341-343`. El propio `docs/SEGURIDAD-mux-playback-sin-firmar.md:7` confirma el hallazgo.
- **Por qué duele:** El `playback_id` viaja al cliente como prop en cada lección, es trivialmente extraíble. Abrir devtools, copiar el `.m3u8` y pegarlo en VLC reproduce el curso sin login ni matrícula. 266 personas pagaron por ese contenido; cualquier no-pagador o competidor puede ver, descargar y republicar todo. Además genera consumo de ancho de banda Mux no autorizado (costo directo).
- **Fix:** Migrar los assets a `playback_policy: 'signed'` y firmar un JWT por reproducción server-side (con expiración corta) en un Server Component/route handler que primero verifique enrollment, pasando `?token=JWT` a las URLs. Lo más robusto: adoptar `@mux/mux-player-react` con `tokens={{playback,thumbnail,storyboard}}`. Cambia la política del asset y la emisión del token a la vez para no romper URLs vivas. Una vez hecho, el `video-proxy` muerto (`app/api/video-proxy/route.ts:7`, sin una sola referencia) se elimina.

### 🔴/🟠 ALTO 3 — Fuga de contenido entre tenants: lessons / program_modules / lesson_resources con RLS laxa
- **Qué:** Las policies de SELECT de `lessons`, `program_modules` y `lesson_resources` son `auth.uid() is not null`, sin scope de cohorte/matrícula. Y la página de lección carga `getLessonById(lessonId)` por el ID resuelto del slug de URL **sin verificar que la lección pertenezca al programa de la cohorte** a la que el alumno tiene acceso.
- **Dónde:** `db/migrations/0007_rbac_cohort_roles.sql:194` (program_modules), `:210` (lessons), `:321` (lesson_resources); página en `app/(classroom)/classroom/[cohortSlug]/[moduleSlug]/[lessonSlug]/page.tsx:48` (getLessonById sin cross-check) y `:93` (lesson_resources inline). `lessons` incluye `mux_playback_id` (`db/migrations/0006_classroom.sql`).
- **Por qué duele:** Un alumno de Workshop pone `/classroom/<su-cohorte>/<modulo>/<lessonSlug-del-Diplomado>`, pasa el guard de acceso (su cohorte es válida) y obtiene el row ajeno: título, descripción, `mux_playback_id` y materiales descargables (PDFs, plantillas) del Diplomado. Las transcripts/summaries SÍ están protegidas cohort-scoped (0008/0009) — estas tres quedaron con la policy original abierta. Combinado con el CRÍTICO 2, el `mux_playback_id` filtrado basta para reproducir el video. Esto es exactamente lo que el modelo "el programa es el tenant" debe impedir.
- **Fix:** Defensa en profundidad. (a) En la página, tras `getLessonById`, verificar que `lesson.program_modules.programs.id === program.id` y `notFound()` si no. (b) Endurecer las RLS al mismo patrón cohort-scoped que ya usan `lesson_transcripts`/`lesson_summaries` (join a `enrollments` con `e.student_id=auth.uid() and e.status='active'`) más `is_platform_staff()`. No basta con (a): cualquier query directa con el anon client igual lee cross-tenant. `program_modules` es medium (filtra IP curricular, menos sensible) pero se corrige en el mismo lote.

### 🟠 ALTO 4 — Fintoc NO matricula al comprador del Diplomado (lógica post-pago duplicada y drifteada)
- **Qué:** El bloque `status === 'succeeded' && !wasAlreadyPaid` (envío de emails de confirmación) está copiado casi idéntico en ambos webhooks. PERO solo Flow agrega `enrollDiplomadoBuyer(...)`. Fintoc no importa ni llama esa función. A la vez, el checkout sí soporta Fintoc como provider activo del Diplomado.
- **Dónde:** `app/api/flow/webhook/route.ts:146` (sí matricula) vs `app/api/fintoc/webhook/route.ts:100-132` (solo correos); checkout en `app/api/pago/checkout/route.ts:149`; provider en `lib/payments/provider.ts:3`.
- **Por qué duele:** Si se conmuta `PAYMENT_PROVIDER=fintoc` (la variable existe y el checkout ya soporta esa rama), un comprador del Diplomado paga, recibe el correo de confirmación, pero NUNCA queda matriculado ni recibe el onboarding con link de activación. Plata tomada sin entregar el producto. Es high y no critical solo porque hoy el provider efectivo es Flow, pero un cambio de env lo dispara silenciosamente. El propio devlog 2026-06-16 lo lista como pendiente.
- **Fix:** Extraer el efecto post-succeeded a una sola función (ej. `handlePaymentSucceeded(existing, paidAtIso)`) que haga emails + (si `plan ∈ PAYMENT_PLAN_KEYS`) `enrollDiplomadoBuyer`, e invocarla desde AMBOS webhooks. Así la regla de matrícula deja de depender de qué webhook la copió.

### 🟠 ALTO 5 — Sin tests en la lógica que da acceso pagado (enroll + classroom access)
- **Qué:** Dos piezas críticas y NUEVAS (commits de los últimos días) no tienen ningún test: `enrollDiplomadoBuyer` (decide si quien pagó queda matriculado) y `getClassroomAccess` (control de acceso multi-tenant al classroom con bypass de staff). El test del webhook de Flow ni siquiera verifica que un plan de diplomado dispare la matrícula.
- **Dónde:** `lib/classroom/enroll-from-payment.ts:36`, `lib/classroom/access.ts:24`, y el test que la ignora en `app/api/flow/webhook/__tests__/route.test.ts:85`.
- **Por qué duele:** Si el branch de `PAYMENT_PLAN_KEYS` deja de matchear o cambia el `onConflict` del upsert, los alumnos que pagaron NO entran al classroom y nadie se entera hasta que reclaman. En `getClassroomAccess`, un bug en el fallback `system_role ?? role` o en el filtro `status='active'` es una fuga de acceso entre estados/tenants. Es justo la lógica que un test debe congelar, y es barata de testear (funciones con mocks de cliente).
- **Fix:** Test de `getClassroomAccess` (matrícula activa → acceso; sin matrícula + admin/ops → staff; sin matrícula + user/student/teacher → null; system_role prioriza sobre role). Test de `enrollDiplomadoBuyer` (happy path, usuario ya registrado → recovery, fallo no lanza). En el test del webhook: plan diplomado → enroll llamado; plan null → NO llamado; fallo de enroll no rompe el 200.

> **Agrupados (mismo origen):** ALTO 3 absorbe los hallazgos `tenant-rls-lessons-cross-program`, `rls-lessons-cross-tenant`, `rls-lesson-resources-cross-tenant` y `rls-program-modules-cross-tenant`, que son el mismo patrón de policy `auth.uid() is not null` sobre el catálogo. ALTO 4 absorbe `arq-fintoc-no-matricula` y `pago-fintoc-sin-matricula` (misma raíz: lógica post-pago no extraída a helper).

---

## Por dimensión

### 1. Arquitectura 🟡

**La narrativa de "qué no encaja":** la arquitectura es coherente y bien intencionada —branding centralizado en `lib/programs/registry.ts` inyectado por prop, capa de datos del classroom separada por actor (queries.ts alumno, admin-queries.ts staff), clientes Supabase server/client/admin aislados— pero hay piezas que delatan crecimiento orgánico sin refactor:

- **Doble onboarding partido en dos árboles bajo la misma URL.** Existen `app/onboarding/` (sin route group, sirve set-password genérico y `[programa]`, pre-auth) y `app/(onboarding)/onboarding/` (con route group + layout que gatea auth, sirve complete-profile genérico y `[programa]`). Ambos resuelven a `/onboarding/...` y hay DOS carpetas `[programa]` paralelas (`app/onboarding/[programa]/set-password/page.tsx:17` y `app/(onboarding)/onboarding/[programa]/complete-profile/page.tsx:18`). Compila porque las hojas difieren (set-password vs complete-profile), pero según `route-groups.md` de esta versión de Next "rutas en grupos distintos no deben resolver a la misma URL": si alguien agrega `/onboarding/[programa]/page.tsx` en ambos árboles, rompe el build. El split nació de una necesidad de auth (un paso público, otro protegido, ver `middleware.ts:40` que whitelistea set-password) y se resolvió duplicando el namespace. Un dev nuevo no deduce por qué "onboarding" aparece dos veces. (`app/(onboarding)/layout.tsx:19`, low)
- **Lógica post-pago duplicada y drifteada** entre Flow y Fintoc — ver ALTO 4. Es la consecuencia clásica de copiar lógica de negocio entre dos handlers en vez de extraerla a un helper.
- **Cohorte G4 hardcodeada en la matrícula automática.** `DIPLOMADO_COHORT_ID = "b0000000-0000-0000-0000-000000000002"` en `lib/classroom/enroll-from-payment.ts:7` (repetido en `scripts/invite-diplomado-g4.mjs:34`). El propio comentario admite que "debe actualizarse o derivarse del plan". Cuando arranque G5, todo comprador del Diplomado se matriculará silenciosamente en G4 hasta que alguien recuerde editar la constante. (medium)
- **God-file de sesiones (896 líneas).** `app/(admin)/admin/cohorts/[cohortId]/sesiones/sessions-manager-client.tsx` mezcla el contenedor con CRUD (l.177), `SessionForm` (l.540), `SessionResourcesPanel` (l.733) y helpers de timezone Santiago no exportados. Viola el container/presentational que el equipo sí aplica bien en login-screen/login-form. (low)
- **Ruta branded redundante.** `app/(onboarding)/onboarding/[programa]/complete-profile/page.tsx:24` produce UI idéntica a la genérica (`complete-profile/page.tsx:33`), que ya deriva la marca de la matrícula. Superficie duplicada que conviene colapsar en una sola page con `programa` opcional. (low)

### 2. Multientorno — aislamiento de tenant 🔴

El registry es un buen patrón para el branding de la puerta de entrada y degrada seguro a marca genérica. Pero el modelo de tenant tiene fugas reales (la principal, el aislamiento de contenido, está en ALTO 3 / RLS):

- **Matrícula-por-pago cableada al Diplomado/G4.** No hay mapeo plan→cohorte/programa: la única función es `enrollDiplomadoBuyer` y siempre matricula en G4. `PAYMENT_PLAN_KEYS` (`lib/flow/checkout.ts:9`) son solo planes del Diplomado. Agregar un 5º programa de pago obliga a editar `enroll-from-payment.ts:7`, escribir un nuevo email y tocar el webhook (`app/api/flow/webhook/route.ts:146`). No es declarativo. (medium)
- **Email transaccional G4-específico con fecha/lugar hardcodeados.** `lib/email/diplomado-invitation.ts:56` ("IV Generación"), `:84-86` ("Sábado 20 de junio · 9:30 a.m.", "Av. Presidente Kennedy 8017..."). Se dispara para todo comprador del Diplomado (`enroll-from-payment.ts:102`). En G5, todos seguirán recibiendo la logística del 20 de junio hasta que alguien edite el HTML. (medium)
- **Segmento "Capital Inteligente" por dominio de email contradice la decisión documentada.** `enroll-from-payment.ts:88` asigna `capital_inteligente` si el email termina en `@capitalinteligente.cl`, pero `db/migrations/0024_audience_and_segment.sql:17` dice explícitamente "la marca es MANUAL por staff (el correo no es confiable como criterio)". El segmento controla acceso a clases extra vía RLS: un comprador con correo corporativo queda con acceso a clases exclusivas aunque no corresponda, y un alumno real con gmail no lo recibe. (low)

### 3. Permisos de aplicación (RBAC app) 🟢

La capa de autorización está sólidamente construida. TODAS las rutas en `app/api/admin/**` invocan `authorizeAdmin()`; el bypass de staff vive SOLO en `getClassroomAccess` y se aplica uniforme en las 4 páginas; las APIs del classroom NO tienen bypass y usan `verifyEnrollment` (un usuario sin matrícula recibe 403). No encontré IDOR explotable: las rutas resuelven la matrícula desde `auth.uid()`, y `cohort-roles` nunca permite admin/ops. Los hallazgos son inconsistencias de diseño, no fugas:

- **`requireStaff()` chequea `system_role='teacher'` que nunca existe.** El enum `system_role` (`db/migrations/0007:10`) es `'user'|'ops'|'admin'`; "teacher" solo existe como `cohort_role_kind`. La rama es código muerto y deja fuera a los profesores reales de subir material (`app/api/admin/resources/route.ts:8`, `session-resources/route.ts:34`), pese a que la RLS sí lo permitiría. Es overly-restrictive, rompe la intención de ADR-0004. (`lib/auth/authorize-admin.ts:60-72`, low)
- **Dos fuentes de verdad para la misma decisión.** El layout admin y `getClassroomAccess` usan `system_role ?? role` (fallback legacy), pero `authorizeAdmin` mira solo `system_role`. Hoy no diverge (default 'user'), pero al refactorizar la columna `role` legacy una ruta podría conceder y otra negar. (`app/(admin)/layout.tsx:28`, `lib/auth/authorize-admin.ts:30`, `lib/classroom/access.ts:38`, low)
- **`certificate/retry` con `.single()` sin filtrar por programa.** Un alumno con 2+ matrículas activas recibe PGRST116 → "No tienes matrícula activa" espurio. La ruta GET lo hace bien (filtra `cohorts.program_id`); retry no. Bug de robustez que aparece apenas haya alumnos multi-programa. (`app/api/classroom/certificate/retry/route.ts:142-162`, low)
- **`comments` DELETE confía 100% en RLS.** No verifica autoría en la app y devuelve `{ok:true}` aunque RLS bloquee silenciosamente. Si una migración futura olvida reaplicar la policy `author_delete`, cualquier alumno borraría comentarios ajenos. (`app/api/classroom/comments/route.ts:394-427`, low)

### 4. RLS / base de datos 🔴

Todas las tablas tienen RLS habilitado y la mayoría del classroom (transcripts, summaries, chapters, comments, video_progress, quiz_attempts, certificates, class_sessions, session_resources) está bien aislada. El gap 0025 es intencional y documentado (no es hallazgo). Los problemas:

- **PII abierta a todo autenticado** — CRÍTICO 1.
- **Catálogo (lessons/program_modules/lesson_resources) con `auth.uid() is not null`** — ALTO 3.
- **Storage de certificados sin ownership + lectura pública total.** `db/migrations/0017_certificates_storage.sql:13` crea "Users can read own certificates" con `using (bucket_id='certificates')` — NO filtra por dueño, el nombre engaña. Y `:22` agrega lectura pública total para rol `public`. Cualquiera sin login que conozca o adivine el `storage_path` descarga el PDF de cualquier alumno (nombre + programa). La verificación por código ya usa `verification_code` único (0015), no necesita exponer todos los PDFs. (low por enumerabilidad acotada, pero conviene cerrarlo)
- **`instructors` con role legacy 'teacher'.** `db/migrations/0022_seed_diplomado_g4.sql:49` permite escritura a `role in ('ops','admin','teacher')` usando la columna legacy `role`, no `system_role` ni los helpers. Cualquier perfil con `role='teacher'` global puede mutar el catálogo de instructores de todos los programas. (low)
- **Verificado OK (no es agujero):** `payments`/`coupons` están correctamente cerradas a staff/service_role (`db/migrations/0020_rls_payments_coupons.sql:6`). No hay policy de SELECT amplia sobre datos de pago. Dejo constancia de que esa frontera se auditó y está sólida.

### 5. Carga de recursos (perf / costo) 🔴

El camino crítico de la lección está razonablemente optimizado (Promise.all para 6 queries, hidratación con maps en vez de N+1, hls.js dinámico solo fuera de Safari). El rojo viene del riesgo de seguridad/costo, no de la latencia:

- **Mux público** — CRÍTICO 2.
- **video-proxy muerto.** `app/api/video-proxy/route.ts:7` autentica y proxea correctamente pero NINGÚN componente lo usa (solo aparece en codemap); el player apunta directo a Mux. Código de seguridad desconectado que aparenta protección inexistente. (low) — se resuelve junto con CRÍTICO 2.
- **Reporte de progreso del cohorte O(alumnos×lecciones) en memoria.** `getCohortProgressReport` trae todos los enrollments, todas las lessons y TODO `video_progress` sin límite y cruza con `filter`/`find` anidados en JS (`lib/classroom/admin-queries.ts:34,68,93,104`). Con 8 alumnos (G4) no duele; con 266 muerde. Mover el agregado a SQL (RPC con group by) y paginar el roster. (medium)
- **Comentarios sin paginación.** `GET /api/classroom/comments` trae TODOS los comentarios sin `.limit`/`.range` y el cliente arma el árbol completo en memoria (`route.ts:45`, `components/classroom/comment-section.tsx:511,546`). Crece sin techo. (low)
- **Admin sin loading.tsx ni Suspense** (el classroom sí tiene en las 4 rutas). Las páginas admin hacen queries pesadas y muestran página en blanco; `admin/lessons/page.tsx:8` hace `lessons('*')` sobre TODOS los módulos de TODOS los programas sin filtrar ni paginar. (low)
- **`POST /api/admin/resources` no valida URL/protocolo** a diferencia de su gemelo `session-resources` (que usa zod `.url()` + refine http/https). Un recurso con `javascript:...` se serviría como link clicable. (`app/api/admin/resources/route.ts:21`, low)

### 6. Modelo de datos 🟡

El schema base está bien modelado: FKs con `ON DELETE` explícito, claves únicas para idempotencia de pagos (flow_token/commerce_order/flow_order) y matrícula (cohort_id,student_id). Los problemas están en la frontera código↔datos:

- **Casts `as never` obsoletos.** Los comentarios afirman que los tipos no incluyen title/teacher_id/audience/segment, pero `lib/supabase/types.ts:32-34` (y `:303` segment) YA los incluyen. El cast desactiva todo el chequeo de tipos del payload: un typo de columna o enum inválido pasa compilación y revienta en runtime. (`app/api/admin/sessions/route.ts:140-142`, `[sessionId]/route.ts:117`, `enroll-from-payment.ts:89-97`, medium)
- **`invitation_log` global-por-email sin programa/cohorte.** `db/migrations/0014:32-40` no tiene program_id/cohort_id. Los scripts filtran anti-dup por email global (`invite-diplomado-g4.mjs:255-262`, `bulk-invite-workshop.mjs:209`), así que invitar a alguien al Workshop lo bloquea silenciosamente de recibir el correo del Diplomado. Bug de negocio silencioso en plataforma multi-programa. Fix: agregar `cohort_id` + unique index `(lower(email), cohort_id)`. (medium)
- **Idempotencia del webhook de Flow no atómica** — ver dimensión Pagos. (medium)
- **Trigger enrollments→cohort_roles solo cubre INSERT/DELETE, no UPDATE.** `db/migrations/0007:371-397`. Un alumno reactivado por pago (upsert = UPDATE) no re-dispara el trigger. Hoy el acceso al aula no depende de cohort_roles (usa enrollments directo), por eso es bajo, pero las dos fuentes de verdad pueden divergir. (medium→low)
- **Doble columna de rol (role legacy vs system_role).** `enroll-from-payment.ts:82` escribe `role:'student'` (columna muerta) mientras la autoridad ya es `system_role`. No rompe (el default 'user' es correcto), pero confunde. (low)
- **Basura committeada y README mentiroso.** `lib/supabase/types.ts.new` es un volcado de error del CLI versionado; `db/migrations/README.md:9-20` lista un cronograma ficticio (0002_attendance...) que no corresponde a las 26 migraciones reales. Documentación peor que ausente. (low)

### 7. Pagos / webhooks 🟡

La ruta del dinero está razonablemente bien diseñada: la firma HMAC del cobro genérico cubre monto+concepto y el recargo se recomputa server-side (no se puede pagar menos — verificado, `lib/cobro/sign.ts:34-48` + `app/api/pago/cobro/route.ts:83-95`), Fintoc usa `timingSafeEqual` con tolerancia temporal, y el discriminador de plan no tiene solape (verificado contra el CHECK de 0021). Los problemas:

- **Fintoc no matricula** — ALTO 4.
- **Idempotencia read-then-write no atómica en AMBOS webhooks.** El gate `succeeded && !wasAlreadyPaid` lee `paid_at` y luego hace UPDATE filtrando solo por token, sin `paid_at IS NULL` en el WHERE, sin lock (`app/api/flow/webhook/route.ts:52-65,92-160`; `app/api/fintoc/webhook/route.ts:67-100`). Flow y Fintoc reintentan ante timeout; dos POST concurrentes leen `paid_at=null`, ambos entran → doble correo y, en Flow, doble `enrollDiplomadoBuyer` y doble fila en invitation_log. No hay doble cobro (la plata ya se tomó), por eso es medium. Fix: claim atómico `UPDATE ... WHERE token=$1 AND paid_at IS NULL RETURNING id` y disparar efectos solo si devolvió fila. (medium)
- **Fallo de matrícula post-cobro solo a console, no reconciliable en BD.** Cuando `enrollDiplomadoBuyer` falla, solo `console.error` y devuelve 200 (`app/api/flow/webhook/route.ts:152-158`). No hay query SQL que liste "pagos del Diplomado succeeded sin matrícula". La reconciliación depende de leer logs efímeros de Netlify. Contrasta con `amount_mismatch`, que sí persiste `failure_reason`. (medium)
- **Fintoc traga el caso `!existing` silenciosamente.** Si no encuentra el payment, hace UPDATE sobre 0 filas y responde `{ok:true}` sin loguear; Flow sí maneja esto con un warn explícito (`app/api/fintoc/webhook/route.ts:67-95` vs `flow/route.ts:60-63`). Punto ciego de observabilidad. (low)
- **Flow: amount mismatch no bloquea (decisión de diseño defendible).** Se marca succeeded y matricula igual, solo loguea (`route.ts:68-97`). El monto se fija server-side y Flow lo firma, así que no es inyectable. Recomendación: elevar la señal a notificación al equipo, no solo console. (low)

### 8. Robustez v1 🟡

- **Sin observabilidad; Sentry en env pero no instalado.** `grep @sentry` vacío; los fallos de matrícula solo van a `console.error` y `enroll-from-payment.ts:124` traga la excepción. Un alumno que pagó sin matricularse no dispara ninguna alerta. (medium)
- **Rate limiter in-memory inútil en serverless.** `lib/rate-limit.ts:15` usa un `new Map()` por instancia: se reinicia en cada cold start, no se comparte entre instancias y no cubre webhooks. Floodear checkout/forgot-password es posible. Necesita store compartido (Redis o Postgres). (medium)
- **Fetch de pago sin timeout.** `createFlowCheckout` sin try/catch (`app/api/pago/checkout/route.ts:106`, `lib/flow/checkout.ts:141`): si el fetch a Flow lanza, escapa sin marcar el payment failed → fila pending para siempre y 500. Fix: `AbortSignal.timeout(8000)` + try/catch. (low)

### 9. Frontend / UX / a11y 🟡

Base por encima del promedio: month-calendar genuinamente rediseñado (gridcell + chips como botones, aria-labels con conteo), checkouts y lead form previenen doble-submit (isBusy/useTransition + honeypot), error.tsx con role=alert en rutas críticas, loading.tsx por ruta. Los problemas se concentran en tres frentes:

- **Cero `aria-live` en toda la app.** Ningún error/éxito de formulario se anuncia a lectores de pantalla: login (`login-form.tsx:50`), checkout (`CheckoutClient.tsx:462`), cupón (`:396`), "RUT inválido" (`complete-profile-client.tsx:384`), "contraseñas no coinciden" (`set-password-form.tsx:278`), lead (`Formulario.tsx`). En el flujo de pago es una barrera directa para completar la compra. Fix: `role="alert"` para errores, `aria-live="polite"` para éxitos; idealmente un `<FormStatus>` reutilizable + mover foco al primer campo con error. (medium, el más transversal de a11y)
- **complete-profile cableado a violet, ignora `brand.accent`.** `complete-profile-client.tsx:162-173,267,320,534` usa `var(--color-ca-violet)` en shapes, avatar, focus-rings y botón; `set-password-form.tsx` SÍ usa `brand.accent`. Un comprador de Liderazgo pasa por set-password en ámbar y cae en un complete-profile íntegramente violeta — rompe "el entorno como tenant" en el último paso del onboarding. Confirma el devlog 2026-06-17. (medium)
- **5 de 6 modales con focus-trap pero sin `role=dialog`/`aria-modal`.** Solo `user-drawer.tsx:177-178` lo declara bien; deactivate-modal, assign-cohort-modal, csv-import-modal, progress-table, collapsible-playlist y el drawer móvil del sidebar no. El trap atrapa el Tab pero el lector nunca sabe que se abrió un diálogo. (low)
- **Drawer móvil del sidebar no cierra con Escape.** `components/classroom/sidebar.tsx:281,356-380`: monta focus-trap pero, a diferencia de los modales admin, no registra listener de Escape; solo cierra por el botón X. (low)
- **El selector de avatar descarta la foto al enviar.** `complete-profile-client.tsx:96-102` deja `// TODO: upload to Supabase Storage` y `handleSubmit` nunca incluye `avatar_url`. El usuario elige foto, ve la preview y asume que quedó guardada; entra al classroom con las iniciales. Mejor ocultar el control hasta implementar el upload. (low)
- **El botón "Completar después" no salta.** `complete-profile-client.tsx:139-142,518-529`: `handleSkip` ejecuta el mismo submit y está `disabled` hasta que todo lo obligatorio esté completo, momento en que es redundante con "Completar y entrar". El copy miente o el botón sobra. (low)
- **`useFocusTrap` no reevalúa contenido diferido** (fija foco solo al montar; el ciclo de Tab sí re-consulta). Muerde al agregar modales multi-paso. (`lib/utils/use-focus-trap.ts:6-43`, low)

### 10. Testing / CI 🟡

El CI es un verdadero gatekeeper: `.github/workflows/ci.yml` corre lint + typecheck + test + build en cada PR a main, frozen-lockfile, build con envs placeholder. Hay ~82 casos en 9 archivos vitest de buena calidad (RBAC, certificados, rutas API prueban ramas reales, no trivialidades). El problema NO es calidad sino COBERTURA de lo crítico:

- **enroll + classroom access sin test** — ALTO 5.
- **Firma HMAC del cobro genérico (`verifyCobro`) sin un solo test.** `lib/cobro/sign.ts:34` es la frontera que impide pagar un monto alterado en la URL; es una función pura, determinista, sin mocks — su ausencia de test es injustificable. (medium)
- **Firma del webhook Fintoc y la ruta completa sin test.** `verifyFintocSignature` (`lib/fintoc/webhook.ts:16`) es la ÚNICA barrera contra webhooks de pago falsos en Fintoc; el de Flow sí tiene test, el de Fintoc no, pese a ser un camino de pago equivalente. (medium)
- **No existe test de integración pago→matrícula→acceso.** Todo es unitario con mocks que asumen contratos; el acoplamiento real (nombres de columnas, cohort_id hardcodeado, `status='active'`, onConflict) solo se valida en producción con dinero real. `@vitest/coverage-v8` está instalado pero sin script. (medium)
- **El test de amount mismatch no asserta `failure_reason`.** `route.test.ts:182` solo mira el 200; el rastro que da valor (evidencia para reconciliar) no se verifica, así que pasa aunque el código deje de escribirlo. (low)

---

## Tabla priorizada

Ordenada por qué atacar primero (impacto/esfuerzo). S = horas, M = 1-3 días, L = 3+ días.

| # | Hallazgo | Dimensión | Severidad | Esfuerzo | Bloquea v1? |
|---|----------|-----------|-----------|----------|-------------|
| 1 | PII de todos los usuarios legible por cualquier autenticado | RLS | 🔴 critical | S | **Sí** |
| 2 | Catálogo (lessons/modules/resources) con RLS `auth.uid() is not null` + sin cross-check lesson↔cohorte | Multientorno/RLS | 🟠 high | M | **Sí** |
| 3 | Playback de Mux sin firmar (video pagado público) | Carga/costo | 🔴 critical | M | **Sí** |
| 4 | Storage de certificados sin ownership + lectura pública | RLS | low | S | **Sí** (mismo lote de RLS) |
| 5 | Fintoc no matricula al comprador (lógica post-pago drifteada) | Pagos/Arq | 🟠 high | S | **Sí, antes de habilitar Fintoc** |
| 6 | Idempotencia de webhooks no atómica (doble correo/matrícula) | Pagos | medium | S | **Sí** |
| 7 | Sin observabilidad (Sentry en env, no instalado) | Robustez | medium | S | **Sí** (operar a ciegas en prod) |
| 8 | Tests de enroll + getClassroomAccess + Fintoc/HMAC | Testing | high/medium | M | **Sí** (red mínima sobre dinero/acceso) |
| 9 | Fallo de matrícula no reconciliable en BD | Pagos | medium | S | Recomendado |
| 10 | Rate limiter inútil en serverless | Robustez | medium | M | Recomendado |
| 11 | Cohorte G4 + email + segmento hardcodeados | Arq/Multientorno | medium | M | No (pero antes de G5) |
| 12 | `invitation_log` global-por-email | Modelo datos | medium | S | No (antes de cruzar programas) |
| 13 | Casts `as never` obsoletos | Modelo datos | medium | S | No |
| 14 | Sin `aria-live` (a11y de formularios) | Frontend | medium | M | No |
| 15 | complete-profile cableado a violet | Frontend | medium | S | No |
| 16 | Progreso del cohorte O(alumnos×lecciones) | Carga | medium | M | No (antes de cohortes grandes) |
| 17 | `requireStaff` teacher muerto / doble fuente de rol | Permisos | low | S | No |
| 18-... | Resto de low (modales ARIA, avatar, README, etc.) | Varios | low | S | No |

---

## Roadmap a v1 estable

### Fase 0 — Bloqueantes duros (seguridad / datos / dinero). No se sale a prod sin esto.
1. **Cerrar RLS de PII (`profiles`)** — owner + staff + staff de cohorte; vista/columnas mínimas para compañeros. (#1)
2. **Endurecer RLS del catálogo** (lessons, program_modules, lesson_resources) al patrón cohort-scoped de transcripts, **más** el cross-check `lesson.program_id === cohorte.program_id` en la página de lección. (#2)
3. **Cerrar Storage de certificados** (bucket privado + URL firmada en la ruta de verificación, o quitar la policy pública). (#4)
4. **Firmar el playback de Mux** (playback_policy signed + JWT server-side por enrollment; adoptar mux-player-react). Eliminar el video-proxy muerto. (#3)
5. **Extraer `handlePaymentSucceeded` y conectar Fintoc a la matrícula** — antes de habilitar Fintoc en prod. (#5)
6. **Claim atómico de idempotencia** en ambos webhooks (`WHERE paid_at IS NULL RETURNING`). (#6)
7. **Instalar Sentry** (ya está en env) o una tabla `ops_alerts` + Slack para fallos de matrícula. (#7)
8. **Tests mínimos sobre dinero y acceso:** `verifyCobro`, `verifyFintocSignature`, `enrollDiplomadoBuyer`, `getClassroomAccess`, y un test de integración pago→matrícula→acceso. (#8)

### Fase 1 — Estabilidad (semanas siguientes al lanzamiento)
- Persistir el resultado de matrícula en `payments` para reconciliar (#9).
- Rate limiter con store compartido para checkout/forgot-password (#10).
- Espejar el manejo de `!existing` y elevar `amount_mismatch` a notificación al equipo.
- `aria-live` en formularios (login, checkout, onboarding) — impacto en conversión (#14).
- Repintar complete-profile con `brand.accent` (#15).
- Quitar los casts `as never` y tipar los payloads (#13).
- Timeout + try/catch en el checkout de Flow.

### Fase 2 — Post-v1 / deuda (antes de escalar, no para salir)
- **Antes de G5:** derivar cohorte/email/fecha de la cohorte activa, no hardcodear (#11); agregar `cohort_id` a `invitation_log` (#12).
- **Antes de cohortes grandes:** mover el reporte de progreso a SQL + paginar roster y comentarios (#16).
- Resolver el doble árbol de onboarding y la ruta branded redundante.
- Unificar la fuente de verdad de rol (`requireStaff`, fallback `system_role ?? role`, columna `role` legacy).
- Modales: `role=dialog`/`aria-modal`, Escape en el drawer móvil.
- Avatar upload o esconder el control; arreglar el botón "Completar después".
- Romper el god-file de sesiones; limpiar `types.ts.new` y el README de migraciones.
- Validar URL en `POST /api/admin/resources`; reforzar `comments` DELETE con `.select()`.
- Test de `failure_reason` en amount mismatch.

### Qué NO es necesario para v1
- El refactor del god-file de sesiones, la consolidación de los árboles de onboarding y la unificación de la columna `role` legacy son deuda de mantenibilidad: no rompen runtime, no salen del cuarto. Posponer.
- La paginación del roster/comentarios y el agregado SQL del progreso no urgen mientras los cohortes sean chicos (G4 = 8 alumnos); se vuelven obligatorios al crecer la matrícula, no antes.
- Los hallazgos de a11y de modales (role=dialog, Escape) y el avatar son mejoras de UX, no bloqueantes.

---

## Puntos ciegos / no auditado

Esta auditoría fue **estática y read-only sobre el código y las migraciones**. Quedó fuera y debería revisarse aparte:

- **Carga real / load testing.** Las afirmaciones O(alumnos×lecciones) son por lectura de código, no por medición. No se midió latencia ni se estresó ningún endpoint con datos volumétricos.
- **Pentest real de Mux.** Confirmé por código y por la nota interna que el playback es público, pero no ejecuté la extracción del `.m3u8` ni probé la reproducción en VLC en vivo. La verificación práctica de la firma post-fix queda pendiente.
- **Datos de producción.** No se inspeccionó la base real: cuántos `payments succeeded` sin matrícula existen hoy, si `invitation_log` ya bloqueó a alguien, ni el estado real de los assets de Mux (signed vs public). Recomiendo una query de reconciliación antes y después de la Fase 0.
- **Dependencias / supply chain.** No se auditó `package.json` por CVEs, versiones vulnerables ni el lockfile. `@vitest/coverage-v8` está instalado pero nunca se corrió coverage real, así que los porcentajes de cobertura son inferidos, no medidos.
- **Auth / GoTrue en profundidad.** El flujo de `generateLink` (invite vs recovery), expiración de tokens y el bug histórico de NULL token en `auth.users` (en memoria del proyecto) no se re-verificaron en esta pasada.
- **Comportamiento real del rate limiter y de los reintentos de webhook** bajo concurrencia: la carrera de idempotencia está confirmada por lectura del código, no reproducida.
