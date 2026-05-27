# ADR-0002: Arquitectura del módulo Classroom

- **Status:** proposed
- **Date:** 2026-05-26
- **Deciders:** Equipo técnico Capital Academy
- **Tags:** classroom, arquitectura, data-model

## Contexto

El Classroom es el módulo donde los alumnos matriculados consumen el contenido académico. Es UNO de varios módulos de la plataforma (junto con pagos, matrícula, evaluaciones, certificación, etc.), por lo que su arquitectura debe ser modular y no acoplar al resto.

Del roadmap existente, el Classroom toca las épicas:
- **E5** — Sesiones y grabaciones (consumir clase grabada).
- **E9** — Progreso (avance por módulo/clase basado en video visto + otros criterios).
- **E13** — Recursos y comentarios (materiales por clase/módulo).

Restricciones de scope para MVP:
- Solo **VOD** (video on demand). Las sesiones en vivo usan link externo (Zoom/Meet).
- Upload **manual** por ops/admin.
- Tracking de progreso **granular** (% visto, posición de playback, completado ≥90%).

## Decisión

### Dominio y boundaries

El Classroom se organiza como un **dominio acotado** dentro de la app existente:

```
app/
  (classroom)/              # Route group — layout con sidebar de navegación del alumno
    layout.tsx              # Sidebar: módulos + progreso + breadcrumb
    [cohortId]/
      page.tsx              # Dashboard de la cohorte: módulos con estado
      [moduleId]/
        page.tsx            # Vista del módulo: lista de lecciones con estado
        [lessonId]/
          page.tsx          # Player de video + recursos + comentarios
lib/
  classroom/
    types.ts                # Tipos del dominio classroom
    queries.ts              # Queries Supabase (server-side)
    progress.ts             # Lógica de cálculo de progreso
    mux-upload.ts           # Helpers de upload para ops/admin
components/
  classroom/
    video-player.tsx        # Wrapper de MuxPlayer con tracking
    lesson-card.tsx         # Card de lección con estado (locked/available/completed)
    module-progress.tsx     # Barra de progreso por módulo
    resource-list.tsx       # Lista de recursos descargables
```

### Modelo de datos (extensión del schema existente)

Se extiende el schema de `0001_init_core.sql` con:

```sql
-- Vincula un asset de Mux a una lección
ALTER TABLE public.lessons ADD COLUMN mux_asset_id text;
ALTER TABLE public.lessons ADD COLUMN mux_playback_id text;
ALTER TABLE public.lessons ADD COLUMN mux_upload_id text;
ALTER TABLE public.lessons ADD COLUMN video_duration_seconds int;
ALTER TABLE public.lessons ADD COLUMN thumbnail_url text;

-- Tracking de progreso de video por alumno
CREATE TABLE public.video_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  playback_position_seconds int NOT NULL DEFAULT 0,
  duration_seconds int NOT NULL,
  max_position_seconds int NOT NULL DEFAULT 0,
  watch_percentage numeric(5,2) NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  last_watched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, lesson_id)
);

CREATE INDEX video_progress_enrollment_idx ON public.video_progress(enrollment_id);

-- Recursos por lección (PDF, links, plantillas)
CREATE TABLE public.lesson_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('pdf', 'link', 'template', 'document', 'other')),
  url text NOT NULL,
  storage_path text,
  position int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Flujo de upload (ops/admin)

1. Ops entra al dashboard admin → selecciona lección → "Subir video".
2. Frontend solicita un **Direct Upload URL** a Mux vía API route.
3. El browser sube directo a Mux (sin pasar por nuestro server).
4. Mux procesa (transcoding) y notifica vía **webhook** (`video.asset.ready`).
5. El webhook actualiza `lessons.mux_asset_id`, `mux_playback_id` y `video_duration_seconds`.
6. La lección queda disponible para los alumnos.

### Flujo de consumo (alumno)

1. Alumno entra al Classroom → ve módulos con progreso.
2. Selecciona lección → ve el `<MuxPlayer>` con signed playback URL.
3. El player emite eventos `timeupdate` → el cliente debouncea y envía progreso al server cada ~15s.
4. Al llegar a ≥90% de watch_percentage → `completed = true`.
5. El progreso del módulo se recalcula: todas las lecciones con video completadas + criterios adicionales (evaluaciones, tareas) en futuro.

### Seguridad

- **Signed playback URLs** con expiración (1h) generadas server-side.
- **Domain restriction** en Mux dashboard para permitir solo el dominio de producción.
- Solo alumnos con enrollment activo en la cohorte pueden acceder al contenido.
- RLS en `video_progress` limita lectura/escritura al propio alumno.

## Opciones consideradas

### Opción A — Dominio acotado en la app existente (elegida)
- **Pros:** reutiliza el schema existente (lessons, modules, enrollments), no duplica entidades.
- **Contras:** acoplamiento al schema actual; cambios en lessons afectan al classroom.

### Opción B — Microservicio separado para video
- **Pros:** independencia total, escalado independiente.
- **Contras:** sobreingeniería para el volumen actual (20-25 alumnos), complejidad de comunicación, duplica datos de enrollment.

## Consecuencias

### Positivas
- Extensión natural del schema existente sin breaking changes.
- El alumno tiene una experiencia unificada (un solo app, un solo login).
- El progreso de video alimenta directamente E9 (progreso académico).

### Negativas
- `lessons` table crece con columnas de Mux (aceptable, son nullable para lecciones sin video).
- El debounce de progreso genera tráfico a Supabase (~4 writes/min por alumno viendo video).

### Riesgos
- Si el volumen de alumnos crece 10x, el debounce de progreso podría necesitar un buffer (edge function o queue). Para 20-25 alumnos es irrelevante.
- La expiración de signed URLs (1h) podría interrumpir sesiones largas; mitigación: refresh automático del token antes de expiración.

## Referencias

- [ADR-0001](0001-mux-como-video-provider.md) — Mux como video provider.
- Roadmap épicas E5, E9, E13.
- Schema existente: `db/migrations/0001_init_core.sql`.
