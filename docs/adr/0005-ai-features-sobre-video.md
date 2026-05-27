# ADR-0005: AI features sobre video (subtítulos, resúmenes, búsqueda, capítulos)

- **Status:** proposed
- **Date:** 2026-05-27
- **Deciders:** Equipo técnico Capital Academy
- **Tags:** video, ai, classroom, mux, openai

## Contexto

Capital Academy tiene clases grabadas servidas por Mux (ver [ADR-0001](0001-mux-como-video-provider.md)). Hoy el alumno consume el video "en crudo": no hay subtítulos, no hay forma de buscar dentro del contenido, y si quiere revisar un tema específico tiene que rebobinar manualmente.

Para una plataforma de educación ejecutiva, esto es un problema real:

1. **Accesibilidad** — alumnos que ven contenido en ambientes ruidosos o con limitaciones auditivas necesitan subtítulos.
2. **Revisión eficiente** — un ejecutivo que quiere repasar "qué dijo el profesor sobre flujo de caja" no debería ver 90 minutos de video otra vez.
3. **Descubrimiento** — no hay forma de buscar un concepto a través de múltiples lecciones.
4. **Consumo rápido** — algunos alumnos quieren el resumen de la clase antes de decidir si la ven completa.
5. **Navegación** — clases largas (60-90 min) sin capítulos son difíciles de navegar.

La plataforma tiene acceso a una API key de OpenAI y Mux ya está integrado como video provider. Mux incluye en su tier gratuito **auto-generated captions** basados en Whisper (22 idiomas, español incluido), que generan transcripciones accesibles vía `https://stream.mux.com/{PLAYBACK_ID}/text/{TRACK_ID}.txt` y `.vtt` sin costo adicional.

**Exclusión explícita:** no se implementan notas del alumno. El foco es enriquecer el video con inteligencia, no crear un editor de texto paralelo.

## Decisión

Implementar un **pipeline híbrido Mux + OpenAI** que produce 5 features sobre cada video:

### 1. Subtítulos/captions automáticos (Mux)

- Al subir un video a Mux, habilitar `auto_generated_captions` con `language_code: "es"`.
- Mux genera un track de subtítulos usando Whisper internamente — sin costo adicional.
- El `<MuxPlayer>` renderiza los captions nativamente (el alumno los activa/desactiva).
- No se requiere procesamiento propio ni almacenamiento extra para esta feature.

### 2. Transcript interactivo con click-to-seek

- Obtener el transcript en formato `.vtt` desde `https://stream.mux.com/{PLAYBACK_ID}/text/{TRACK_ID}.vtt`.
- Parsear los bloques VTT (timestamp + texto) y almacenarlos en Supabase como JSON en la tabla `lesson_transcripts`.
- Renderizar un panel lateral al video con el texto segmentado por timestamp.
- Al hacer click en cualquier segmento, hacer seek del player a ese timestamp.
- Highlight del segmento actual sincronizado con `timeupdate` del player.

### 3. Resúmenes por lección (OpenAI)

- Tomar el transcript completo (`.txt` de Mux) y enviarlo a OpenAI (`gpt-5.4-mini`) con un prompt que pida:
  - Resumen ejecutivo (3-5 oraciones).
  - Puntos clave (bullet list).
  - Conceptos mencionados (tags para búsqueda).
- Almacenar el resultado en `lesson_ai_summaries` en Supabase.
- Mostrar el resumen debajo del video o en un tab dedicado.
- Procesamiento asíncrono: un endpoint `/api/ai/generate-summary` que se invoca manualmente por ops o automáticamente vía webhook cuando Mux completa el caption track.

### 4. Capítulos automáticos (OpenAI)

- Enviar el transcript con timestamps a OpenAI con un prompt que identifique cambios temáticos y genere:
  - Título del capítulo.
  - Timestamp de inicio.
  - Descripción breve (1 oración).
- Almacenar en `lesson_chapters` en Supabase.
- Renderizar como marcadores en la barra de progreso del player y como lista navegable.
- Ops puede editar/ajustar los capítulos generados antes de publicarlos.

### 5. Búsqueda in-video cross-lecciones

- Almacenar los segmentos del transcript con sus timestamps en una tabla `transcript_segments` con un índice GIN de full-text search en español (`to_tsvector('spanish', content)`).
- Endpoint `/api/classroom/search?q=flujo+de+caja` que busca en todos los transcripts de las lecciones a las que el alumno tiene acceso.
- Resultado: lista de matches con lección, módulo, timestamp, y snippet con highlight.
- Click en un resultado lleva al video en ese timestamp exacto.

### Schema propuesto

```sql
-- Transcript completo por lección (parseado de VTT)
CREATE TABLE public.lesson_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  mux_track_id text NOT NULL,
  full_text text NOT NULL,              -- transcript plano para procesamiento AI
  vtt_segments jsonb NOT NULL,          -- [{start: 0.0, end: 4.5, text: "..."}]
  language text NOT NULL DEFAULT 'es',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id)
);

-- Segmentos indexados para búsqueda full-text
CREATE TABLE public.transcript_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  start_seconds numeric(10,3) NOT NULL,
  end_seconds numeric(10,3) NOT NULL,
  content text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('spanish', content)) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transcript_segments_search ON public.transcript_segments USING GIN (search_vector);
CREATE INDEX idx_transcript_segments_lesson ON public.transcript_segments (lesson_id);

-- Resúmenes generados por AI
CREATE TABLE public.lesson_ai_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  executive_summary text NOT NULL,
  key_points jsonb NOT NULL,            -- ["punto 1", "punto 2", ...]
  concepts jsonb NOT NULL,              -- ["flujo de caja", "ROI", ...]
  model_used text NOT NULL,             -- ej: "gpt-5.4-mini"
  prompt_version int NOT NULL DEFAULT 1,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id)
);

-- Capítulos generados por AI (editables por ops)
CREATE TABLE public.lesson_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  start_seconds numeric(10,3) NOT NULL,
  sort_order int NOT NULL,
  is_ai_generated boolean NOT NULL DEFAULT true,
  edited_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lesson_chapters_lesson ON public.lesson_chapters (lesson_id, sort_order);
```

### Pipeline de procesamiento

```
Upload video a Mux
  → Mux transcodes + genera captions automáticos
  → Webhook `video.asset.ready` (ya implementado)
  → Nuevo: webhook `video.track.ready` cuando el caption track está listo
    → Fetch transcript .vtt y .txt desde Mux
    → Parse VTT → guardar en lesson_transcripts
    → Split en segmentos → guardar en transcript_segments (búsqueda)
    → Enviar .txt a OpenAI para resumen → guardar en lesson_ai_summaries
    → Enviar .vtt a OpenAI para capítulos → guardar en lesson_chapters
```

Cada paso del pipeline es idempotente: si se re-ejecuta, hace UPSERT. Esto permite regenerar si se mejora el prompt o si Mux regenera el transcript.

## Opciones consideradas

### Opción A — Pipeline híbrido Mux + OpenAI (elegida)

Mux genera el transcript (gratis, Whisper integrado), OpenAI genera resúmenes y capítulos.

- **Pros:**
  - Cero costo de transcripción — Mux lo incluye en el tier base.
  - Transcript de alta calidad (Whisper) sin infra propia.
  - OpenAI `gpt-5.4-mini` es económico (~$0.75/1M input tokens, $4.50/1M output) — un transcript de 90 min son ~15K tokens, costo por lección ~$0.02.
  - Separación clara de responsabilidades: Mux para audio→texto, OpenAI para texto→inteligencia.
  - Pipeline reproducible: si OpenAI mejora el modelo o se cambia el prompt, se regenera sin re-transcribir.
  - No requiere infra adicional (GPU, workers, etc.).

- **Contras:**
  - Dos proveedores que mantener (Mux + OpenAI).
  - Latencia del pipeline completo: ~2-5 min para captions de Mux + ~10-30s para llamadas a OpenAI.
  - Si OpenAI cambia pricing o API, hay que adaptar (mitigable: la capa de abstracción es un solo archivo).

### Opción B — Todo Mux (Mux AI / Robots)

Mux tiene features de AI en preview (Auto Chapters, Summaries) como parte de Mux Robots.

- **Pros:**
  - Un solo proveedor.
  - Integración nativa con el player (chapters en el player sin código custom).
- **Contras:**
  - Mux Robots está en **preview** con fecha de expiración en junio 2026 — no es producción-ready.
  - Sin control sobre el prompt ni el formato de salida.
  - Sin búsqueda cross-lecciones (Mux no indexa para búsqueda).
  - Si Mux depreca Robots, hay que migrar con urgencia.
  - Pricing de Robots no está definido para GA.

### Opción C — Todo custom con Whisper self-hosted

Correr Whisper (modelo open-source de OpenAI) en infra propia para transcripción, y luego OpenAI/local para el resto.

- **Pros:**
  - Control total del pipeline.
  - Sin dependencia de Mux para transcripción.
  - Potencialmente más barato a gran escala.
- **Contras:**
  - Requiere GPU para transcripción en tiempo razonable (o CPU con latencia de 10-30 min por video).
  - Infra adicional que mantener (GPU instances, queue, retry).
  - Mux YA genera el transcript gratis — estarías pagando para replicar algo que ya tienes.
  - Complejidad operacional desproporcionada para el volumen actual (~50-100 videos/año).
  - El equipo no tiene experiencia en infra ML.

## Consecuencias

### Positivas

- Los alumnos obtienen subtítulos desde día 1 sin ningún desarrollo adicional (solo habilitar el flag en Mux).
- Búsqueda cross-lecciones permite descubrir contenido relevante sin navegar manualmente.
- Resúmenes ejecutivos ayudan al alumno a decidir qué revisar — especialmente valioso para ejecutivos con poco tiempo.
- Capítulos hacen navegable una clase de 90 minutos.
- Costo operativo mínimo: < $1/mes para AI processing de todo el catálogo actual.
- Todo el contenido generado es editable por ops — no es una caja negra.

### Negativas

- Pipeline asíncrono: las features de AI no están disponibles instantáneamente después del upload (~5-10 min total).
- Calidad del transcript depende de la calidad del audio de la clase (mitigación: ya se usan micrófonos dedicados para grabaciones).
- Los resúmenes y capítulos generados por AI pueden necesitar revisión humana para contenido técnico especializado.

### Riesgos

- **Calidad del español chileno en Whisper**: el modelo puede tener problemas con chilenismos o jerga inmobiliaria local. Mitigación: probar con 3-5 videos reales antes de automatizar y evaluar calidad. Si es insuficiente, se puede post-procesar el transcript con OpenAI antes de mostrarlo.
- **Cambio de pricing en OpenAI**: si `gpt-5.4-mini` se descontinúa o cambia de precio, migrar a otro modelo es cambiar una línea de config (el prompt es reutilizable). Alternativa: modelos open-source (Llama, Mistral) via API compatible.
- **Crecimiento del índice de búsqueda**: con 500+ lecciones, la tabla `transcript_segments` puede tener 100K+ filas. El índice GIN de Postgres maneja esto sin problemas, pero monitorear el tamaño y considerar particionamiento si llega a millones.
- **Latencia de Mux captions**: si Mux tarda más de lo esperado en generar captions, el pipeline completo se retrasa. Mitigación: timeout + retry en el webhook handler, y UI que muestra "procesando" mientras tanto.

## Referencias

- [ADR-0001](0001-mux-como-video-provider.md) — Mux como video provider.
- [ADR-0002](0002-arquitectura-modulo-classroom.md) — Arquitectura del módulo Classroom.
- [ADR-0003](0003-tracking-progreso-video.md) — Tracking de progreso de video.
- Mux Auto-Generated Captions: https://docs.mux.com/guides/add-autogenerated-captions-and-transcriptions
- Mux Transcript Access: https://docs.mux.com/guides/get-transcript-of-a-video
- OpenAI API Pricing: https://openai.com/api/pricing
- PostgreSQL Full-Text Search: https://www.postgresql.org/docs/current/textsearch.html
