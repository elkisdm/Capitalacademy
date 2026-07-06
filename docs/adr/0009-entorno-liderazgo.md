# ADR-0009: Entorno del Programa de Liderazgo (Sistema de Liderazgo Comercial Inmobiliario)

- **Status:** proposed
- **Date:** 2026-07-06
- **Deciders:** Elkis Daza (ingeniería), Paola Vicuña (dirección académica)
- **Tags:** data-model, classroom, entorno, calendario

## Contexto

Liderazgo existía a medias: checkout vivo (`/pago/liderazgo`), pricing
(`lib/programs/liderazgo.ts`) y branding de login (`/login/liderazgo`), pero en
`lib/programs/registry.ts` con `programId: null` — sin cohorte ni classroom. Los
compradores pagaban pero no se matriculaban (el webhook de Flow solo auto-matricula
Diplomado). Con el brochure oficial recibido (estructura académica), se habilita el
entorno como tenant real, reusando el patrón del Diplomado (ver [ADR-0008](0008-entorno-diplomado-y-calendario-de-sesiones.md)).

Datos canónicos (brochure "Programa Ejecutivo — Capital Academy", abr-2026, reunión
de avances 1-jul-2026):

- **Formato:** presencial, 16 h, 4 jornadas de 4 h, viernes 15:00–19:00.
- **Inicio:** viernes 10 de julio 2026. **Cupo:** 12 alumnos. **Valor:** $450.000
  (−20% BP/TL Capital Inteligente, ya modelado en el checkout de liderazgo).
- **Malla (4 jornadas):** J1 *Atraer talento* (Milena Zapata), J2 *Gestionar desempeño*
  (Diego de La Prida), J3 *Liderazgo personal* (Paola Vicuña), J4 *Eje Aplicado —
  Proyecto de implementación* (feedback de los 3 docentes).
- **Cierre:** presentación ejecutiva del sistema de cada participante (no quiz).

Restricciones verificadas contra el código:

1. El modelo `programs → cohorts → program_modules → class_sessions` + catálogo
   `instructors` ya existe (seeds `0001`/`0022`).
2. **Paola Vicuña (`d…0001`) y Milena Zapata (`d…0002`) ya están en `instructors`**
   (seed 0022) → se reutilizan. Diego de La Prida es nuevo.
3. **`class_sessions.module_id` es requerido** por la ruta de repetición/grabación
   (`app/api/admin/sessions/[sessionId]/recording/route.ts`): sin módulo no se puede
   crear la lección grabada. En el Diplomado se hizo backfill tardío (0037); aquí se
   siembra desde el inicio.
4. El cupo de **40** de las notas de reunión corresponde al *ciclo de capacitación
   comercial* gratuito (entorno distinto, futuro) — NO a este programa pagado (12).

## Decisión

Sembrar el entorno vía migración versionada `0043_seed_liderazgo.sql` (idempotente,
UUIDs fijos rango `03xx`, `ON CONFLICT DO NOTHING`) y activar el brand en el registry:

1. **Programa** `code = LID-COMERCIAL`, `total_modules = 4`, `min_attendance_pct = 75`
   (programa corto presencial), `passing_grade = 4.0`. `name` se mantiene alineado al
   `LIDERAZGO_SUBJECT` del checkout ("Programa de Liderazgo y Gestión de Equipos
   Comerciales") para no romper el enlace pago→matrícula; el título de marketing del
   brochure ("Sistema de Liderazgo Comercial Inmobiliario") vive en `description`.
2. **Una jornada = un módulo** (4 `program_modules`). Cada módulo es a la vez el hogar
   de contenido y el destino de la grabación de su sesión. Alternativa descartada:
   1 módulo + 4 sesiones (rompería el mapeo sesión→módulo de la grabación).
3. **Cohorte** `code = G1`, `slug = liderazgo-i-generacion`, `2026-07-10 → 2026-07-31`,
   `status = active`.
4. **4 `class_sessions`** (viernes 10/17/24/31-jul, 15:00–19:00 −04), cada una con su
   `module_id`. J4 con `teacher_id = null` (feedback de los 3 docentes).
5. **Registry:** `programId = a…0003`, `code = LID-COMERCIAL`. Las rutas branded
   (`/login/liderazgo`, `/onboarding/liderazgo/...`) ya resolvían por slug.

Fuera de alcance (fases siguientes, como en el Diplomado): matrículas/invitaciones por
script (esperan el listado de alumnos), auto-matrícula de compradores de Liderazgo en
el webhook de Flow, evaluaciones/quizzes (se crean por el admin), y el entorno separado
del *ciclo de capacitación* gratuito.

## Opciones consideradas

### Opción A — Una jornada = un módulo (elegida)
- Pros: refleja la malla del brochure 1:1; cada grabación cae en su módulo; navegación
  del alumno clara; siembra el `module_id` desde el inicio (sin backfill tipo 0037).
- Contras: 4 módulos para un programa corto puede verse granular.

### Opción B — 1 módulo "Programa" + 4 sesiones
- Pros: un solo contenedor de contenido.
- Contras: todas las grabaciones caerían en un módulo genérico; pierde la estructura de
  la malla; peor UX de navegación.

## Consecuencias

### Positivas
- Liderazgo pasa a ser tenant real con classroom branded, aislado por cohorte.
- Los compradores podrán matricularse (vía script) y acceder al classroom.
- El calendario y la repetición de clases funcionan sin ajustes adicionales.

### Negativas
- El `name` del programa difiere del título de marketing del brochure (decisión
  consciente por compatibilidad con el checkout).

### Riesgos
- **Fechas asumidas:** viernes consecutivos 10/17/24/31-jul se infieren de "inicio 10-jul
  + 4 jornadas de viernes". Si la cadencia real difiere, corregir `starts_at/ends_at` y
  el `end_date` de la cohorte antes de que arranque.
- La migración **no se aplica a prod hasta revisión** (mismo criterio que 0022).

## Referencias

- [ADR-0008](0008-entorno-diplomado-y-calendario-de-sesiones.md) — patrón de entorno + calendario.
- `db/migrations/0043_seed_liderazgo.sql` — la siembra.
- `lib/programs/registry.ts` — brand `liderazgo` activado.
- Brochure "Programa Ejecutivo — Capital Academy" (abr-2026); notas de reunión 1-jul-2026.
