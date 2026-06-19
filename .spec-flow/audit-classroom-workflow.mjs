export const meta = {
  name: 'auditoria-classroom-conformidad',
  description: 'Audita classroom/entornos/calendario/edición/quizes: conformidad vs spec original (Épicas+RN) + solidez funcional + próximo nivel, con verificación adversarial',
  whenToUse: 'Auditoría funcional y de conformidad de los subsistemas académicos de Capital Academy contra el spec v0 concebido',
  phases: [
    { title: 'Auditoría', detail: '5 auditores: 1 por subsistema, conformidad RN/Épica + solidez + próximo nivel' },
    { title: 'Verificación', detail: 'escéptico adversarial refuta claims de alto impacto contra el código' },
    { title: 'Síntesis', detail: 'matriz de prioridad, roadmap, crítico de completitud de cobertura' },
  ],
}

const CWD = '/Users/macbookpro/Documents/Capitalacademy'

// ---------------------------------------------------------------------------
// SPEC ORIGINAL (condensado fiel desde los 4 PDFs de referencia: 15 Épicas + 84 RN)
// ---------------------------------------------------------------------------

const SUBSYSTEMS = [
  {
    key: 'entornos',
    nombre: 'Entornos / Multi-tenancy (el programa como tenant)',
    anchors: `
- lib/programs/registry.ts (identidad/branding por entorno keyed por slug)
- lib/programs/liderazgo.ts
- lib/classroom/access.ts, lib/classroom/verify-enrollment.ts (gate de acceso)
- lib/classroom/enroll-from-payment.ts (matrícula por pago — busca DIPLOMADO_COHORT_ID hardcodeado)
- lib/auth/authorize-admin.ts, lib/auth/roles.ts (RBAC app: system_role user/ops/admin + cohort_role_kind)
- db/migrations/0007_rbac_cohort_roles.sql, 0022_seed_diplomado_g4.sql, 0024_audience_and_segment.sql, 0028_fix_rls_content_security.sql
- docs/adr/0004-modelo-permisos-rbac-por-cohorte.md
- app/(auth)/login/[programa]/, app/onboarding/[programa]/
`,
    spec: `
E1 — Roles base: alumno, profesor, operación, admin.
RN-002 — Cohortes: cada alumno asociado a una cohorte; la cohorte define calendario, sesiones, apertura de módulos y comunicaciones grupales.
RN-T04 — Cohortes como unidad de segmentación: calendario, comunicaciones, sesiones, reportes y asistencia se aplican POR COHORTE.
RN-T02 — Separación visibilidad/edición por rol (no asumir "si puede ver, puede editar").
RN-T03 — Separación estado académico (en curso/aprobado/reprobado/finalizado) vs acceso técnico al contenido.
RN-T01 — Trazabilidad obligatoria de acciones críticas (quién/cuándo/qué cambió).
RN-049/050 — Acceso permanente al contenido post-cohorte; cierre académico NO implica pérdida de acceso.
RN-058 — Cada cohorte usa un canal único de Slack (alumnos+profesores+operación+admin).
RN-051/052/053/054 — Gobernanza por rol: Admin/Dirección crea estructura; Profesor edita su módulo; Operación gestiona cohortes/asignaciones/horarios/asistencia/comunicaciones/certificados/reportes.
Memoria del proyecto: "el programa es el tenant completo; solo admins transversales"; el branding/login/onboarding es branded por entorno vía registry.
FOCO próximo nivel: ¿el modelo escala a N programas sin tocar código? ¿matrícula plan→cohorte declarativa o hardcodeada a G4? ¿estados de cohorte (planificada/activa/cerrada/archivada) modelados? ¿aislamiento real entre tenants en datos y catálogo?
`,
    foco: 'Aislamiento de tenant, escalabilidad a N programas/cohortes sin editar código, hardcodeo G4, estados de cohorte, gobernanza de roles.',
  },
  {
    key: 'calendario',
    nombre: 'Calendario / Sesiones de clase',
    anchors: `
- app/(admin)/admin/cohorts/[cohortId]/sesiones/ (editor del calendario; sessions-manager-client.tsx ~896 líneas)
- app/api/admin/sessions/route.ts, app/api/admin/sessions/[sessionId]/route.ts (CRUD sesiones)
- app/api/admin/session-resources/route.ts, app/api/cron/session-reminders/route.ts
- app/(classroom)/classroom/[cohortSlug]/calendario/ (vista alumno: lista + mes)
- components/classroom/month-calendar.tsx, components/classroom/cohort-calendar-client (en app)
- db/migrations/0008..., 0023_class_sessions_rls.sql, 0026_session_reminders.sql, 0027_session_resources.sql
- docs/adr/0008-entorno-diplomado-y-calendario-de-sesiones.md
`,
    spec: `
E2 — Gestión académica: creación de diplomados/programas, cohortes (cada 2 meses), fechas inicio/fin, ESTADO de cohorte (planificada/activa/cerrada/archivada — "por definir formalmente"), calendario por cohorte, programación de sesiones (martes presencial, miércoles online, jueves presencial), reprogramación de sesiones (solo operación/admin).
E5 — Aulas/sesiones híbridas: sesiones por cohorte presencial/online, enlaces externos Zoom/Meet (MVP), ESTADO de sesión (programada/en curso/finalizada), grabaciones de clases online siempre disponibles, asociación grabación→clase/módulo, recursos por clase (PDF/links/grabaciones/plantillas).
RN-010 — Clases obligatorias: presencial (martes y jueves), online (miércoles).
RN-055 — Solo Operación Académica o Admin reprograma sesiones.
RN-056 — Toda reprogramación genera notificación automática a involucrados (Slack + email).
RN-064 — Sesiones online del MVP vía enlace externo publicado en plataforma.
RN-065 — Arquitectura puede evolucionar a sesiones embebidas.
RN-066 — Clases online quedan grabadas y disponibles para repaso.
RN-016 — Grabaciones para repaso, NO reemplazan asistencia.
RN-062 — Recordatorios automáticos: clases 1h antes.
RN-059/E12 — Notificación automática a Slack en inicio de clase.
FOCO próximo nivel: estado de sesión en vivo (en curso/finalizada), reprogramación con trazabilidad+notificación (RN-T01/RN-056), recordatorios robustos (cron idempotente, zona horaria Santiago), asociación grabación↔sesión, edición del god-file de sesiones.
`,
    foco: 'Estados de sesión, reprogramación con notificación/trazabilidad, recordatorios (cron + timezone), grabaciones, robustez del CRUD y del editor.',
  },
  {
    key: 'classroom',
    nombre: 'Classroom: estructura académica, acceso secuencial, progreso, recursos y comentarios',
    anchors: `
- app/(classroom)/classroom/[cohortSlug]/[moduleSlug]/[lessonSlug]/page.tsx (reproductor lección)
- app/(classroom)/classroom/[cohortSlug]/page.tsx, [moduleSlug]/page.tsx
- lib/classroom/queries.ts, progress.ts, use-video-progress.ts, resolve-slugs.ts, types.ts
- app/api/classroom/progress/route.ts, comments/route.ts, transcript/route.ts, summary/route.ts
- components/classroom/ (sidebar, collapsible-playlist, comment-section, video-player)
- db/migrations/0006_classroom.sql, 0010_chapters_and_search.sql, 0011_lesson_comments.sql, 0013_slugs.sql, 0018_performance_indexes.sql, 0019_data_consistency.sql, 0028_fix_rls_content_security.sql
- docs/adr/0002-arquitectura-modulo-classroom.md, 0003-tracking-progreso-video.md
`,
    spec: `
E4 — Estructura académica del programa: estructura del diplomado (admin), módulos y clases/lecciones, configuración de CONTENIDO SECUENCIAL ESTRICTO, fechas de apertura por calendario, reglas de visibilidad por cohorte, materiales grabados y clases pregrabadas.
E9 — Progreso y avance secuencial: progreso por módulo/clase, contenido bloqueado/desbloqueado POR CALENDARIO, reglas de avance (evaluación + tarea), estado de cumplimiento por componente, visualización de progreso para alumno y profesor/operación, bloqueos de cierre por tareas pendientes.
E13 — Comentarios y recursos por clase/módulo: comentarios por módulo/clase, respuestas (hilos básicos), destacar comentario/respuesta, adjuntos (imágenes/documentos), moderación por profesor/operación/admin, recursos por clase/módulo (links/documentos/grabaciones/plantillas).
RN-003 — Acceso SECUENCIAL ESTRICTO: el alumno NO puede acceder a módulos futuros antes de su habilitación.
RN-004 — Apertura por calendario: disponibilidad de módulos/lecciones/evaluaciones depende de fechas/horas definidas en la cohorte y/o por docente/dirección.
RN-009 — Contenido bloqueado previo al inicio (onboarding visible, módulos bloqueados hasta fecha de habilitación).
RN-017 — Condición de avance por módulo: cumplir evaluación/quiz del módulo + tarea/actividad asociada.
RN-049/050 — Acceso permanente al contenido post-cohorte.
RN-067/068/069/070 — Recursos por clase/módulo: gestionables; roles autorizados (Profesor/Operación/Admin); profesor elimina solo lo suyo, operación/admin cualquiera; trazabilidad de creación/edición/eliminación.
RN-071/072/073/074 — Comentarios: por módulo/clase, hilos básicos, destacar (según permisos), adjuntos imágenes/documentos.
FOCO próximo nivel: ¿el acceso secuencial estricto (RN-003) y la apertura por calendario (RN-004/009) están REALMENTE implementados o todo el contenido está abierto? Reglas de avance (RN-017). Trazabilidad/propiedad de recursos (RN-069/070). Paginación de comentarios.
`,
    foco: 'Acceso secuencial estricto y apertura por calendario (¿existe o el contenido está todo abierto?), reglas de avance, propiedad/trazabilidad de recursos, robustez de progreso y comentarios.',
  },
  {
    key: 'edicion',
    nombre: 'Edición de clases / gestión de contenido por rol (profesor/operación/admin)',
    anchors: `
- app/(admin)/admin/lessons/page.tsx, app/(admin)/admin/lessons/[lessonId]/page.tsx
- app/api/admin/modules/route.ts, app/api/admin/resources/route.ts, app/api/admin/mux/upload/route.ts
- app/api/admin/{generate-summary,generate-chapters,correct-transcript,transcript-segments}/route.ts
- components/admin/ (resource-manager, mux-uploader, transcript-review)
- lib/auth/authorize-admin.ts (requireStaff: ¿chequea system_role='teacher' inexistente?)
- lib/classroom/admin-queries.ts
- db/migrations/0007_rbac_cohort_roles.sql (policies de program_modules/lessons/lesson_resources), 0028_fix_rls_content_security.sql
`,
    spec: `
E4 — Profesor carga/edita contenido de SU módulo; Admin/Dirección define la estructura; Operación apoya en contenido.
RN-051 — La estructura del diplomado (módulos/componentes base) la crea Admin/Dirección.
RN-052 — El profesor puede cargar/editar contenido académico de SU módulo (lecciones, materiales, evaluaciones dentro de su alcance).
RN-053 — Alcance operativo del profesor: revisión de tareas, carga/edición/publicación de notas, creación/edición de evaluaciones, comentarios/anuncios (sujeto a gobernanza global).
RN-T02 — Separación visibilidad/edición por rol.
RN-067/068 — Pueden subir/editar recursos por clase/módulo: Profesor, Operación Académica, Admin.
RN-069 — Profesor elimina SOLO recursos subidos por él; Operación/Admin eliminan cualquiera.
RN-070 — Toda gestión de recursos registra autoría y cambios (creación/edición/eliminación).
FOCO próximo nivel: ¿el profesor REALMENTE puede editar solo su módulo, o el modelo es admin-todo? ¿existe scoping por módulo/cohorte del profesor? ¿requireStaff deja fuera a profesores reales (system_role no tiene 'teacher')? ¿trazabilidad de edición/eliminación de recursos y contenido?
`,
    foco: 'Scoping de edición por profesor/módulo (RN-052), el rol teacher fantasma en requireStaff, propiedad y trazabilidad de recursos (RN-069/070), separación visibilidad/edición.',
  },
  {
    key: 'quizes',
    nombre: 'Quizes / Evaluaciones, ventanas, intentos, notas y ponderaciones',
    anchors: `
- app/api/classroom/quiz/route.ts, app/api/classroom/quiz/submit/route.ts (quiz del alumno + scoring)
- app/api/admin/quiz-config/route.ts, quiz-questions/route.ts, quiz-attempts/route.ts, generate-quiz/route.ts
- app/(admin)/admin/quizzes/page.tsx, components/admin/quiz-manager (si existe)
- components/classroom/quiz-*
- db/migrations/0015_quiz_and_certificates.sql
- docs/adr/0007-certificacion-y-quizzes.md
`,
    spec: `
E7 — Evaluaciones (quizzes/exámenes) y ventanas: creación/edición de evaluaciones (profesor; director/profesor define ventana), VENTANA FIJA de apertura/cierre, UN intento por evaluación (MVP), feedback y respuestas correctas visibles SOLO al final, disponibilidad por calendario, notificaciones de evaluación disponible/cierre, BLOQUEO automático fuera de ventana.
E10 — Calificaciones/ponderaciones: configuración de componentes evaluativos y ponderaciones (SOLO admin/dirección), registro de notas por componente en ESCALA 1,0–7,0, cálculo de nota final ponderada, ESTADOS de notas (borrador/cargada/publicada), publicación manual por profesor, visualización de notas por alumno SOLO tras publicación, edición por profesor/operación con trazabilidad, reapertura post-cierre solo admin, auditoría de cambios (valor anterior/nuevo, usuario, fecha, motivo).
RN-017 — Avance por módulo requiere evaluación/quiz del módulo + tarea.
RN-025 — 1 solo intento por alumno (MVP).
RN-026 — Respuestas correctas y feedback solo al finalizar.
RN-027 — Ventana fija de apertura/cierre (fecha/hora) por evaluación.
RN-028 — Ventana configurada por Director o Profesor.
RN-029 — No se puede iniciar NI continuar una evaluación fuera de la ventana.
RN-030 — Evaluaciones quedan "disponibles" según config + calendario.
RN-031 — Escala 1,0 a 7,0.
RN-032/033/034 — Nota final por ponderaciones fijas por componente; ponderaciones definidas por Dirección/Admin; SOLO Admin modifica ponderaciones.
RN-035 — Profesor carga/edita notas; Operación también con trazabilidad obligatoria.
RN-036 — Trazabilidad de cambios de nota: valor anterior, valor nuevo, usuario, fecha/hora, MOTIVO obligatorio.
RN-037/038 — Notas NO visibles al alumno hasta publicación manual; visibles tras publicar.
RN-039 — Edición post-cierre solo si Admin reabre, con trazabilidad.
FOCO próximo nivel: gap enorme esperado — hoy es UN quiz final único; el spec pide evaluaciones POR MÓDULO con ventana, intento único forzado server-side, escala 1-7, ponderaciones, estados de nota y publicación. Mapea qué existe vs qué falta y diseña el salto.
`,
    foco: 'Quiz final único vs evaluaciones por módulo con ventana/intento único/escala 1-7/ponderaciones/estados de nota/publicación. Enforcement server-side de intento único y ventana. Conexión avance (RN-017) y certificación.',
  },
]

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const AUDIT_SCHEMA = {
  type: 'object',
  required: ['subsistema', 'resumen', 'conformidad', 'solidez', 'siguienteNivel'],
  properties: {
    subsistema: { type: 'string' },
    resumen: { type: 'string', description: 'Narrativa 4-8 frases: qué hay, qué tan sólido, principales gaps vs spec.' },
    conformidad: {
      type: 'array',
      description: 'Una fila por regla/épica relevante evaluada.',
      items: {
        type: 'object',
        required: ['id', 'regla', 'titulo', 'estado', 'evidencia'],
        properties: {
          id: { type: 'string', description: 'CONF-1, CONF-2, ...' },
          regla: { type: 'string', description: 'RN-XXX o EX que se evalúa' },
          titulo: { type: 'string' },
          estado: { type: 'string', enum: ['implementada', 'parcial', 'ausente', 'contradice'] },
          evidencia: { type: 'string', description: 'archivo:línea, o "no existe en el código" con el grep que lo confirma' },
          nota: { type: 'string' },
        },
      },
    },
    solidez: {
      type: 'array',
      description: 'Bugs/riesgos funcionales de lo que SÍ existe en este subsistema.',
      items: {
        type: 'object',
        required: ['id', 'titulo', 'severidad', 'archivo', 'descripcion', 'fix'],
        properties: {
          id: { type: 'string', description: 'SOL-1, SOL-2, ...' },
          titulo: { type: 'string' },
          severidad: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          archivo: { type: 'string', description: 'archivo:línea' },
          descripcion: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
    siguienteNivel: {
      type: 'array',
      description: 'Mejoras concretas que elevan el subsistema (P1/P2 del spec + criterio).',
      items: {
        type: 'object',
        required: ['id', 'titulo', 'valor', 'esfuerzo'],
        properties: {
          id: { type: 'string', description: 'NIV-1, ...' },
          titulo: { type: 'string' },
          valor: { type: 'string', description: 'Qué desbloquea / por qué importa' },
          esfuerzo: { type: 'string', enum: ['S', 'M', 'L'] },
          epica: { type: 'string' },
        },
      },
    },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['subsistema', 'veredictos', 'omisiones'],
  properties: {
    subsistema: { type: 'string' },
    veredictos: {
      type: 'array',
      description: 'Un veredicto por cada claim de alto impacto verificado (conformidad ausente/contradice y solidez critical/high).',
      items: {
        type: 'object',
        required: ['id', 'claim', 'status', 'evidencia'],
        properties: {
          id: { type: 'string', description: 'el id del hallazgo auditado (CONF-x/SOL-x)' },
          claim: { type: 'string', description: 'resumen del claim verificado' },
          status: { type: 'string', enum: ['confirmado', 'refutado', 'matizado'] },
          evidencia: { type: 'string', description: 'archivo:línea que sustenta el veredicto' },
          correccion: { type: 'string', description: 'si matizado/refutado: la versión correcta' },
        },
      },
    },
    omisiones: {
      type: 'array',
      description: 'Hallazgos importantes que el auditor NO reportó y deberían estar (gaps de cobertura).',
      items: { type: 'string' },
    },
  },
}

const SYNTH_SCHEMA = {
  type: 'object',
  required: ['veredicto', 'resumenEjecutivo', 'topAcciones', 'reporteMarkdown'],
  properties: {
    veredicto: { type: 'string', description: '¿Qué tan sólido y conforme está el conjunto vs el spec v0? 3-6 frases.' },
    resumenEjecutivo: { type: 'string', description: 'Para relayar al usuario en el chat: estado por subsistema + lo más urgente, en markdown conciso.' },
    topAcciones: {
      type: 'array',
      description: 'Las 8-12 acciones de mayor impacto, ordenadas.',
      items: {
        type: 'object',
        required: ['accion', 'subsistema', 'tipo', 'severidad', 'esfuerzo'],
        properties: {
          accion: { type: 'string' },
          subsistema: { type: 'string' },
          tipo: { type: 'string', enum: ['solidez', 'conformidad', 'siguienteNivel'] },
          severidad: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          esfuerzo: { type: 'string', enum: ['S', 'M', 'L'] },
        },
      },
    },
    reporteMarkdown: { type: 'string', description: 'Documento markdown COMPLETO de la auditoría: veredicto, tabla de conformidad por subsistema, solidez priorizada, próximo nivel, matriz, roadmap por fases, y crítico de completitud de cobertura de RN. Formato del estilo de docs/audit/2026-06-17-megaauditoria-v1.md.' },
  },
}

// ---------------------------------------------------------------------------
// Fase 1+2: auditar cada subsistema y verificar adversarialmente (pipeline)
// ---------------------------------------------------------------------------

phase('Auditoría')

const auditPrompt = (s) => `Eres un arquitecto senior (15+ años, GDE) auditando el subsistema **${s.nombre}** de Capital Academy.

CONTEXTO: plataforma ed-tech multi-programa. Next.js App Router (versión con breaking changes — lee node_modules/next/dist/docs si tocas convenciones de routing) + Supabase/Postgres con RLS + Mux. Repo: ${CWD} (ya estás en ese cwd).

IMPORTANTE — alcance: NO es una auditoría de seguridad pura. La seguridad (PII/RLS abierta/firma de Mux/idempotencia de pagos) ya se auditó en docs/audit/2026-06-17-megaauditoria-v1.md. LÉELA para no duplicar, pero VERIFICA si migraciones recientes (ej. 0028_fix_rls_content_security.sql) ya cerraron lo que toca a tu subsistema. Tu foco es **conformidad funcional + solidez + próximo nivel**.

Tu trabajo es TRIPLE:
1. **CONFORMIDAD** con el spec original (abajo). Por cada regla/épica relevante: ¿está implementada / parcial / ausente / contradicha? Con evidencia archivo:línea. "ausente" = no existe (confírmalo con Grep). "parcial" = existe pero incompleto vs la regla. "contradice" = el código hace lo opuesto.
2. **SOLIDEZ** funcional de lo que SÍ existe: bugs, edge cases, integridad de datos, race conditions, validación faltante, manejo de errores, estados imposibles, falta de tests — acotado a tu subsistema. Severidad honesta (critical rompe negocio/datos; high bug serio o regla core ausente con impacto; medium incompleto; low pulido). SIEMPRE archivo:línea.
3. **PRÓXIMO NIVEL**: mejoras concretas que elevan el subsistema (derivadas de las épicas P1/P2 y criterio de arquitectura), con valor y esfuerzo (S<1d, M 1-3d, L 3+d).

ANCLAS DE CÓDIGO (empieza acá; explora con Grep/Read lo que necesites — el código es la verdad, no asumas):
${s.anchors}

FOCO ESPECÍFICO de este subsistema: ${s.foco}

SPEC ORIGINAL (línea base concebida — es una v0, no todo tiene que existir, pero TÚ marcas qué falta y qué tan grave es):
${s.spec}

MÉTODO: lee el código real y las migraciones citadas. Verifica cada claim. Distingue lo que existe de lo que no. Recuerda RN-T01 (trazabilidad de acciones críticas) y RN-T02 (separación visibilidad/edición) como lentes transversales. Sé exhaustivo: esto es ultracode, cubre TODAS las reglas del bloque.

Devuelve SOLO el objeto estructurado.`

const verifyPrompt = (s, report) => `Eres un escéptico adversarial senior. Otro agente auditó el subsistema **${s.nombre}** de Capital Academy (repo ${CWD}, ya estás en ese cwd) y produjo el reporte JSON de abajo. Tu trabajo es REFUTAR sus claims de alto impacto leyendo el CÓDIGO REAL.

Verifica con Grep/Read, por defecto dudando:
- Cada conformidad con estado **ausente** o **contradice**: ¿de verdad no existe / contradice? Muchos falsos "ausente" son features que viven en otro archivo, una migración, o una RPC. Grep agresivo antes de confirmar.
- Cada solidez **critical** o **high**: ¿el bug es real y ALCANZABLE en runtime? ¿o ya está manejado en otra capa (RLS, server component, validación)?
Marca **confirmado** solo si lo verificaste en el código. **refutado** si existe/está manejado (da el archivo:línea que lo desmiente). **matizado** si es real pero la severidad o el alcance está mal.
Además, lista **omisiones**: hallazgos importantes que el auditor pasó por alto.

REPORTE A VERIFICAR:
${JSON.stringify(report)}

Devuelve SOLO el objeto estructurado, con evidencia archivo:línea en cada veredicto.`

const audited = await pipeline(
  SUBSYSTEMS,
  (s) => agent(auditPrompt(s), { label: `audit:${s.key}`, phase: 'Auditoría', schema: AUDIT_SCHEMA }),
  (report, s) => {
    if (!report) return null
    return agent(verifyPrompt(s, report), { label: `verify:${s.key}`, phase: 'Verificación', schema: VERIFY_SCHEMA })
      .then((verdict) => ({ subsystem: s.key, nombre: s.nombre, report, verdict }))
  },
)

const valid = audited.filter(Boolean)
log(`Auditados ${valid.length}/${SUBSYSTEMS.length} subsistemas con verificación adversarial`)

// ---------------------------------------------------------------------------
// Fase 3: síntesis (barrier — necesita todos los reportes verificados juntos)
// ---------------------------------------------------------------------------

phase('Síntesis')

const synthPrompt = `Eres el arquitecto líder consolidando una auditoría de conformidad + solidez de Capital Academy.

Tienes ${valid.length} reportes de subsistema, cada uno con su auditoría (conformidad RN/Épica + solidez + próximo nivel) y su verificación adversarial (veredictos confirmado/refutado/matizado + omisiones).

REGLAS DE SÍNTESIS:
- DESCARTA o degrada los hallazgos cuyo veredicto fue **refutado**. AJUSTA severidad/alcance de los **matizados** según la corrección. Integra las **omisiones** verificadas como hallazgos nuevos.
- Separa claramente tres ejes: (A) SOLIDEZ — hacer más sólido lo que existe (bugs/riesgos), (B) CONFORMIDAD — gaps vs el spec v0 (ausente/parcial/contradice), (C) PRÓXIMO NIVEL — el salto de mejora.
- Marca qué bloquea una "v1 estable" y qué es evolución.
- Incluye un **crítico de completitud**: ¿qué Reglas de Negocio (RN) o Épicas del spec NO quedaron mapeadas a ningún subsistema y deberían? (ej. asistencia E6/RN-011/012, tareas E8, certificación E11, notificaciones E12 — si no fueron cubiertas, nómbralas como gaps de cobertura del propio audit).
- Recuerda: el spec es una v0 ("primera versión aún"), así que prioriza con criterio de negocio, no como checklist ciego.

DATOS (reportes + verificaciones por subsistema):
${JSON.stringify(valid)}

Produce:
- veredicto: estado global vs spec v0.
- resumenEjecutivo: markdown conciso para mostrar en chat (estado por subsistema 🔴🟡🟢 + lo más urgente).
- topAcciones: 8-12 acciones de mayor impacto ordenadas.
- reporteMarkdown: documento COMPLETO (estilo docs/audit/2026-06-17-megaauditoria-v1.md): veredicto, tabla resumen por subsistema, conformidad RN-por-RN por subsistema, solidez priorizada, próximo nivel, matriz de prioridad (impacto/esfuerzo/bloquea-v1), roadmap por fases (Fase 0 solidez/bloqueantes, Fase 1 conformidad core, Fase 2 próximo nivel), y la sección de crítico de completitud/cobertura de RN.

Devuelve SOLO el objeto estructurado.`

const synthesis = await agent(synthPrompt, { label: 'síntesis', phase: 'Síntesis', schema: SYNTH_SCHEMA, effort: 'xhigh' })

return { synthesis, subsistemas: valid.map((v) => ({ key: v.subsystem, nombre: v.nombre })) }
