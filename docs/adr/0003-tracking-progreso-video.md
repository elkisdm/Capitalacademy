# ADR-0003: Tracking de progreso de video

- **Status:** proposed
- **Date:** 2026-05-26
- **Deciders:** Equipo técnico Capital Academy
- **Tags:** video, tracking, progreso, data-model

## Contexto

El sistema necesita saber cuánto ha visto cada alumno de cada lección grabada. Esto alimenta:

1. **Progreso visible para el alumno** — "llevas 65% de esta lección".
2. **Desbloqueo de contenido** — una lección se marca como "completada" cuando el alumno ve ≥90%.
3. **Progreso por módulo (E9)** — todas las lecciones completadas = módulo completado (junto con evaluaciones y tareas en futuro).
4. **Reportes para ops/admin (E14)** — qué alumnos están atrasados, quién no ha visto contenido.
5. **Reanudación** — el alumno vuelve al video donde lo dejó.

El reproductor es `@mux/mux-player-react@3.x`, que emite eventos estándar de HTML5 video: `timeupdate`, `ended`, `seeked`, `play`, `pause`.

## Decisión

### Estrategia de captura

**Client-side debounced reporting** al server:

1. El `<MuxPlayer>` emite `timeupdate` ~4 veces/segundo.
2. Un hook `useVideoProgress()` acumula el progreso localmente.
3. Cada **15 segundos** (o al pausar/cerrar), envía un PATCH a `/api/classroom/progress`.
4. El endpoint hace UPSERT en `video_progress` (ON CONFLICT enrollment_id + lesson_id).
5. Cuando `watch_percentage >= 90` → `completed = true`, `completed_at = now()`.

### Cálculo de watch_percentage

```
watch_percentage = (max_position_seconds / duration_seconds) * 100
```

Se usa `max_position_seconds` (la posición más lejana alcanzada) en lugar del tiempo acumulado de reproducción. Esto evita que un alumno que rebobina pierda progreso, pero también evita que alguien salte al final sin ver el contenido (porque trackear la posición más lejana "vista de forma continua" es complejo y frágil).

**Trade-off aceptado:** un alumno podría hacer seek al 90% y marcar como completado. Para el MVP esto es aceptable — el contenido es formativo, no certificante por sí solo (las evaluaciones y tareas son las gates reales). Si se necesita anti-skip en el futuro, se puede agregar interval tracking.

### Schema

```sql
CREATE TABLE public.video_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  playback_position_seconds int NOT NULL DEFAULT 0,      -- última posición (para reanudar)
  duration_seconds int NOT NULL,                          -- duración total del video
  max_position_seconds int NOT NULL DEFAULT 0,            -- posición más lejana alcanzada
  watch_percentage numeric(5,2) NOT NULL DEFAULT 0,       -- calculado: max_position / duration
  completed boolean NOT NULL DEFAULT false,                -- true cuando watch_percentage >= 90
  completed_at timestamptz,                                -- timestamp de la primera vez que completó
  last_watched_at timestamptz NOT NULL DEFAULT now(),      -- última actividad
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, lesson_id)
);
```

### API endpoint

```
PATCH /api/classroom/progress
Body: {
  lessonId: string,
  playbackPositionSeconds: number,
  durationSeconds: number
}
```

- Autenticación: sesión del alumno (Supabase Auth).
- Autorización: verificar que el alumno tiene enrollment activo en la cohorte de esa lección.
- El server calcula `max_position_seconds`, `watch_percentage` y `completed` — el cliente NO decide si completó.

### RLS

```sql
-- El alumno solo puede leer/escribir su propio progreso
CREATE POLICY video_progress_student_select ON public.video_progress
  FOR SELECT USING (
    enrollment_id IN (
      SELECT id FROM public.enrollments WHERE student_id = auth.uid()
    )
  );

CREATE POLICY video_progress_student_upsert ON public.video_progress
  FOR INSERT WITH CHECK (
    enrollment_id IN (
      SELECT id FROM public.enrollments WHERE student_id = auth.uid()
    )
  );

-- Ops/admin pueden leer todo (para reportes)
CREATE POLICY video_progress_staff_select ON public.video_progress
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('ops', 'admin')
    )
  );
```

### Hook del cliente (pseudocódigo)

```tsx
function useVideoProgress(lessonId: string, enrollmentId: string) {
  const positionRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout>();

  const handleTimeUpdate = (event: Event) => {
    const video = event.target as HTMLVideoElement;
    positionRef.current = Math.floor(video.currentTime);
  };

  const flush = async () => {
    await fetch('/api/classroom/progress', {
      method: 'PATCH',
      body: JSON.stringify({
        lessonId,
        playbackPositionSeconds: positionRef.current,
        durationSeconds: /* from lesson data */,
      }),
    });
  };

  useEffect(() => {
    timerRef.current = setInterval(flush, 15_000);
    return () => {
      clearInterval(timerRef.current);
      flush(); // flush on unmount
    };
  }, []);

  return { handleTimeUpdate };
}
```

## Opciones consideradas

### Opción A — Client-side debounced reporting (elegida)
- **Pros:** simple, predecible, funciona offline-first (el último estado se envía al reconectar).
- **Contras:** pierde granularidad entre intervalos de 15s; un alumno que cierra el browser puede perder hasta 15s de progreso.

### Opción B — Mux Data webhooks (server-side)
- **Pros:** no depende del cliente para reportar.
- **Contras:** Mux Data reporta métricas de calidad (buffering, startup), no posición de playback por usuario. No es diseñado para tracking de progreso individual.

### Opción C — Interval tracking (anti-skip)
- **Pros:** previene que un alumno haga seek al final sin ver.
- **Contras:** complejidad significativa (almacenar rangos de tiempo vistos, merge de intervalos solapados). Innecesario para MVP dado que evaluaciones y tareas son las gates reales.

## Consecuencias

### Positivas
- El alumno puede reanudar exactamente donde dejó.
- Progreso visible en tiempo real (cada 15s de actualización).
- Datos suficientes para reportes de engagement por alumno y cohorte.
- Completado calculado server-side: imposible falsificar desde el cliente.

### Negativas
- ~4 writes/min a Supabase por alumno viendo video. Para 25 alumnos simultáneos = ~100 writes/min. Bien dentro de los límites de Supabase.
- Un alumno que hace seek al 90% se marca como completado (trade-off aceptado).

### Riesgos
- Si la tabla crece significativamente (muchas lecciones × muchos alumnos), agregar un índice en `(enrollment_id, completed)` para queries de progreso por módulo.
- Si se necesita anti-skip en el futuro, migrar a interval tracking requiere una nueva tabla y lógica de merge — pero `video_progress` sigue válida como resumen.

## Referencias

- [ADR-0001](0001-mux-como-video-provider.md) — Mux como video provider.
- [ADR-0002](0002-arquitectura-modulo-classroom.md) — Arquitectura del módulo Classroom.
- MuxPlayer events: https://docs.mux.com/guides/mux-player-react#listening-for-events
