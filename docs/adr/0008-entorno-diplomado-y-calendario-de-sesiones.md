# ADR-0008: Entorno del Diplomado IV Generación y modelo del calendario de sesiones

- **Status:** proposed
- **Date:** 2026-06-16
- **Deciders:** Elkis Daza (ingeniería), Paola Vicuña (dirección académica)
- **Tags:** data-model, classroom, calendario, segmentación

## Contexto

Hay que crear el entorno de la **4ª Generación del Diplomado Ejecutivo en Ventas y
Asesoría de Inversión Inmobiliaria** antes del inicio de clases (sábado 20-jun-2026).
A diferencia del Workshop (único programa/cohorte hoy en producción), el Diplomado es
un **entorno nuevo desde cero** y aislado del Workshop (acordado en reunión de admisión
del 15-jun-2026).

Restricciones y hallazgos verificados contra el código:

1. **El modelo `programs → cohorts → enrollments` + `program_modules → lessons` ya existe**
   (migración `0001`), pero solo está poblado con el Workshop.
2. **La tabla `public.class_sessions` (calendario de clases) está MUERTA**: solo aparece
   en `lib/supabase/types.ts`; ninguna ruta ni query la lee o escribe. RLS está habilitado
   pero **sin políticas**. El calendario visible para el alumno, su edición y las alertas
   son features greenfield (ver Fase 2 / brief separado), no un simple "poblar datos".
3. **No existe segmentación de alumnos** (etiqueta "Capital Inteligente"). Solo hay
   `profiles.role` + RBAC por cohorte (ADR-0004).
4. **El calendario entregado por dirección** (`4ta generacion diplomado/Calendario-CapitalAcademy.pdf`)
   tiene **un docente distinto por sesión** (14 docentes rotando). El schema actual solo
   atribuye docente a nivel de `program_modules.teacher_id`, no por sesión.
5. **`profiles.id` referencia `auth.users(id)`**: no se puede insertar un perfil de docente
   sin crear antes un usuario de autenticación. Forzar 14 usuarios auth para docentes que
   en su mayoría no entran a la plataforma es innecesario y frágil.

## Decisión

Sembrar el entorno del Diplomado vía migración versionada `0022` (no se aplica hasta
revisión), con estas decisiones de modelado:

1. **Programa**: `code = DIP-VENTAS`, nombre alineado al landing
   ("Ejecutivo en Ventas y Asesoría de Inversión Inmobiliaria"), `total_modules = 2`.
2. **Módulos**: 2 `program_modules` — **Teórico** y **Práctico** — alineados a
   `lib/landing/programs.ts` (`modules: 2`). Las sesiones del calendario NO cuelgan de los
   módulos; viven en `class_sessions` (el calendario es la fuente de verdad de las clases en vivo).
3. **Cohorte**: `code = G4`, nombre "IV Generación — Junio 2026",
   `start_date = 2026-06-20`, `end_date = 2026-09-18`, `status = active`.
4. **Docente por sesión**: se agrega `class_sessions.teacher_id`, pero **NO referencia
   `profiles`** (por la restricción 5). Se crea un **catálogo liviano `public.instructors`**
   (id, full_name, email, photo_url, bio, `profile_id` opcional → `profiles`) desacoplado de
   `auth.users`. `class_sessions.teacher_id → instructors(id)`. Un docente que además use la
   plataforma se enlaza por `instructors.profile_id`.
5. **Sesiones**: se siembran las ~24 `class_sessions` del calendario (track general:
   miércoles online 19:00–21:00 + sábados presenciales 09:30–13:30, con bloques *Challenge
   Day* / integración 14:30–16:30). `modality` usa el enum `lesson_kind`
   (`live_in_person` para presencial, `live_online` para online).
6. **Segmentación "Capital Inteligente"** y el **calendario diferenciado de los martes**
   (clases extra: soporte comercial, marketing, CRM, gestión comercial) **NO entran en esta
   migración**: el calendario de martes aún no lo entrega dirección y la etiqueta + vista
   diferenciada son feature (Fase 2). Se modelará en un ADR/brief propio.

Las matrículas e invitaciones de los 8 alumnos de la lista oficial NO van en la migración:
se ejecutan por script una vez la plataforma esté lista (Fase 3).

## Opciones consideradas

### Atribución de docente — Opción A: `teacher_id` → `instructors` (ELEGIDA)
- Pros: cada clase apunta a su docente; consultable para reportes y para la futura vista de
  docente/calendario; no fuerza usuarios auth; el catálogo ya existe conceptualmente (el PDF
  lista docentes con foto/bio, igual que el landing).
- Contras: tabla nueva + columna nueva (DDL).

### Atribución de docente — Opción B: docente como texto en la sesión
- Pros: cero DDL, lo más rápido.
- Contras: no consultable, sin foto/bio, inservible para la vista de calendario/reportes;
  habría que migrarlo igual después.

### Atribución de docente — Opción C: un `program_module` por tema
- Pros: encaja con el schema sin migrar.
- Contras: infla "modules" a ~20, contradice el landing (2 módulos) y mezcla estructura
  académica (notas/ponderación) con calendario operativo.

### `teacher_id` → `profiles` (descartada)
- Contras: `profiles` exige `auth.users`; obligaría a crear 14 usuarios para docentes que no
  entran a la plataforma. `instructors.profile_id` cubre el caso del docente que sí es usuario.

## Consecuencias

### Positivas
- Entorno reproducible y auditable (migración versionada, no clicks manuales).
- El calendario queda como dato estructurado listo para la vista de alumno (Fase 2).
- El catálogo `instructors` habilita la sección "Docentes" del landing/plataforma a futuro.

### Negativas
- `class_sessions` sigue sin UI hasta la Fase 2; los datos existen pero no se muestran aún.

### Riesgos
- **Zona horaria**: las sesiones se guardan en `timestamptz` con offset de Santiago. Chile
  entra en horario de verano el **6-sep-2026** (−04 → −03); las sesiones hasta el 5-sep usan
  −04 y desde el 6-sep usan −03 (afecta la ceremonia del 18-sep). La migración lo refleja.
- El calendario puede cambiar (Paola pidió poder moverlo). Mientras no exista el editor
  (Fase 2), los cambios se hacen re-corriendo seed/SQL puntual.

## Referencias

- `db/migrations/0001_init_core.sql` (modelo base programs/cohorts/sessions)
- ADR-0004 (RBAC por cohorte), ADR-0006 (onboarding y matrícula)
- `4ta generacion diplomado/Calendario-CapitalAcademy.pdf`, `LISTA OFICIAL DE ALUMNOS.xlsx`
- Notas reunión admisión 15-jun-2026 (`4ta generacion diplomado/Procesos de admisión…md`)
- Brief Fase 2: calendario interactivo + segmentación Capital Inteligente (pendiente)
