# PRD — Resúmenes de Lección Generados por IA

> Product Requirements Document para la generación automática de resúmenes estructurados a partir de transcripciones de video.

- **Autor:** Equipo Capital Academy
- **Fecha:** 2026-05-27
- **Estado:** Draft
- **Dependencias:** Módulo Classroom (PRD-classroom), Mux (ADR-0001)
- **ADRs relacionados:** [0001](adr/0001-mux-como-video-provider.md), [0002](adr/0002-arquitectura-modulo-classroom.md)

---

## 1. Problema

Capital Academy graba todas sus sesiones (diplomados, masterclass, talleres) y las pone disponibles como VOD en el módulo Classroom. Los alumnos reciben el video sin contexto adicional: no hay resumen, no hay puntos clave, no hay glosario. Esto genera tres problemas concretos:

1. **Repaso ineficiente** — para revisar un concepto específico, el alumno debe re-ver el video completo o hacer seek manual.
2. **Falta de estructura** — las clases grabadas son sesiones orgánicas, no contenido editorializado. Sin un resumen, el alumno no sabe qué esperar ni qué es lo más importante.
3. **Cero indexación textual** — el contenido de video no es buscable. Google no indexa audio, y los alumnos no pueden buscar "plusvalía" o "tasa de capitalización" para encontrar la lección relevante.

Mux genera transcripciones automáticas (plain text) de cada asset sin costo adicional. Hoy esas transcripciones no se usan para nada.

## 2. Objetivo

Construir un pipeline automatizado que:

1. Capture la transcripción de texto de cada video vía Mux.
2. Envíe esa transcripción a OpenAI para generar un resumen estructurado.
3. Almacene el resumen en Supabase.
4. Lo muestre al alumno debajo del video en la vista de lección.

**Resultado esperado:** cada lección con video tiene automáticamente un resumen con puntos clave, texto narrativo y glosario de términos, sin intervención manual del equipo.

## 3. No-scope (MVP)

- Generación de resúmenes en tiempo real durante la reproducción (tipo "live captions resumidas").
- Traducciones automáticas del resumen a otros idiomas.
- Generación de quizzes o evaluaciones a partir del resumen.
- Búsqueda full-text sobre transcripciones desde la UI (se puede agregar después).
- Edición colaborativa del resumen por múltiples admins.
- Integración con otros LLMs (solo OpenAI en MVP).
- Resúmenes de sesiones en vivo (solo VOD con asset en Mux).

## 4. Usuarios y roles

| Rol | Acciones |
|---|---|
| **Alumno** (student) | Ver resumen de la lección (puntos clave, resumen narrativo, glosario) |
| **Ops/Admin** (ops, admin) | Regenerar resumen, editar resumen manualmente, ver estado del pipeline |

## 5. User Stories

### 5.1 Alumno

**US-RS01: Ver resumen de la lección**
> Como alumno, quiero ver un resumen estructurado de la lección debajo del video para repasar los conceptos clave sin tener que re-ver todo el video.

Criterios de aceptación:
- Debajo del video, veo un card colapsable con el título "Resumen de la clase".
- El card tiene tres secciones con separadores claros: **Puntos clave**, **Resumen**, **Glosario**.
- La sección "Puntos clave" muestra entre 3 y 5 bullets concisos.
- La sección "Resumen" muestra 2-3 párrafos narrativos.
- La sección "Glosario" muestra términos técnicos con su definición, en formato de lista.
- El card inicia colapsado (solo muestra el título y los puntos clave) para no distraer del video.
- Si no hay resumen disponible (aún no generado, o error), se muestra un mensaje "Resumen en preparación".
- El resumen se carga con la página (SSR o fetch inicial), no requiere acción del alumno.

**US-RS02: Expandir y colapsar secciones del resumen**
> Como alumno, quiero poder expandir o colapsar cada sección del resumen para enfocarme en lo que necesito.

Criterios de aceptación:
- Cada sección (Puntos clave, Resumen, Glosario) tiene su propio toggle de expansión.
- El estado de expansión NO persiste entre sesiones (siempre inicia en estado por defecto).
- Estado por defecto: Puntos clave expandidos, Resumen colapsado, Glosario colapsado.

### 5.2 Ops/Admin

**US-RS03: Regenerar resumen de una lección**
> Como admin, quiero poder regenerar el resumen de una lección si el resultado automático no es satisfactorio.

Criterios de aceptación:
- En la vista de administración de la lección, hay un botón "Regenerar resumen".
- El botón muestra un diálogo de confirmación ("Esto reemplazará el resumen actual").
- Durante la generación se muestra un spinner con "Generando resumen..." (operación tarda ~5-15 segundos).
- Al completar, el nuevo resumen reemplaza al anterior inmediatamente.
- Se conserva un registro de cuántas veces se regeneró (campo `generation_count`).

**US-RS04: Editar resumen manualmente**
> Como admin, quiero poder editar cualquier sección del resumen para corregir errores o agregar contexto.

Criterios de aceptación:
- Cada sección (puntos clave, resumen narrativo, glosario) es editable inline.
- Los puntos clave se editan como lista (agregar, eliminar, reordenar).
- El resumen narrativo se edita como texto libre (textarea).
- El glosario se edita como pares término-definición (agregar, eliminar, editar).
- Al guardar, el campo `edited_by` se actualiza con el ID del admin.
- Un resumen editado manualmente se marca como `is_manually_edited = true`.
- Regenerar un resumen editado muestra advertencia adicional: "Este resumen fue editado manualmente. Regenerar perderá los cambios."

## 6. Pipeline de generación

### 6.1 Diagrama de flujo

```
Mux: video.asset.ready (webhook existente)
  │
  ├── [Existente] Actualizar lesson: mux_asset_id, playback_id, duration, thumbnail
  │
  └── [NUEVO] Verificar si asset tiene transcripción disponible
        │
        ├── Sí → Continuar
        │
        └── No → Programar reintento (Mux tarda ~5-10 min en generar transcripción)
              │
              └── Polling: GET /api/classroom/check-transcript?lessonId=xxx
                    (cron job o invocación manual, máx 3 reintentos espaciados 5 min)
        │
        ▼
  Fetch transcripción: GET https://mux.com/[ASSET_ID]/text
        │
        ▼
  Guardar en `lesson_transcripts` (cache local)
        │
        ▼
  Enviar a OpenAI (gpt-5.4-mini) con system prompt educativo
        │
        ▼
  Parsear respuesta estructurada (JSON mode)
        │
        ▼
  Guardar en `lesson_summaries`
        │
        ▼
  Resumen disponible para el alumno
```

### 6.2 Trigger: cuándo se genera el resumen

**Trigger principal:** webhook `video.asset.ready` de Mux (ya implementado en `/api/webhooks/mux`).

El handler actual actualiza los campos de la lección (`mux_asset_id`, `mux_playback_id`, etc.). Se extiende para agregar un paso adicional:

1. Después de actualizar la lección, verificar si la transcripción está disponible.
2. Mux genera transcripciones automáticamente, pero puede tardar unos minutos después de que el asset esté ready.
3. **Estrategia:** intentar fetch inmediato de la transcripción. Si falla (404), insertar un registro en `lesson_transcripts` con `status = 'pending'`.
4. Un cron endpoint (`/api/cron/process-pending-transcripts`) revisa cada 5 minutos los pendientes y reintenta.
5. Máximo 3 reintentos. Si después de 3 intentos no hay transcripción, marcar como `status = 'failed'`.

**Trigger manual:** el admin puede forzar la generación desde el dashboard con el botón "Regenerar resumen" (US-RS03).

### 6.3 Fetch de transcripción desde Mux

Mux expone la transcripción como texto plano vía:

```
GET https://stream.mux.com/{PLAYBACK_ID}/text
```

Requiere que el asset tenga `auto_generated_captions` habilitado (comportamiento por defecto en assets nuevos). La respuesta es plain text (sin timestamps), ideal para enviar a un LLM.

**Consideraciones:**
- Si el asset usa signed playback, la URL de transcripción también necesita token de firma.
- La transcripción viene en el idioma del audio (español en nuestro caso).

### 6.4 Almacenamiento intermedio en `lesson_transcripts`

Antes de enviar a OpenAI, se guarda la transcripción en Supabase. Razones:
- Evitar re-fetch a Mux si se necesita regenerar el resumen.
- Permitir futura búsqueda full-text sobre transcripciones.
- Auditoría y debugging.

### 6.5 Llamada a OpenAI

**Modelo:** `gpt-5.4-mini` (400K context window) — elegido por calidad superior en razonamiento y coding. Para una transcripción de clase de 45 min (~8,000 tokens de input + ~800 tokens de output), el costo es ~$0.01 USD por resumen.

**Modo:** JSON mode (`response_format: { type: "json_object" }`).

**System prompt:**

```
Eres un asistente educativo para Capital Academy, una plataforma de educación ejecutiva
en Chile especializada en el sector inmobiliario, liderazgo y negocios.

Tu tarea es generar un resumen estructurado de una clase grabada a partir de su
transcripción. El público son profesionales chilenos del sector inmobiliario
(corredores, desarrolladores, inversionistas, asesores).

Genera un JSON con la siguiente estructura:

{
  "suggested_title": "Título conciso y descriptivo de la clase (máx 80 caracteres)",
  "key_points": [
    "Punto clave 1 — una oración clara y accionable",
    "Punto clave 2",
    "Punto clave 3"
  ],
  "summary": "Resumen narrativo de 2-3 párrafos. Primer párrafo: contexto y tema principal. Segundo párrafo: desarrollo de los conceptos clave. Tercer párrafo (opcional): conclusiones o aplicaciones prácticas.",
  "glossary": [
    { "term": "Término técnico", "definition": "Definición clara y breve en contexto inmobiliario/financiero chileno" }
  ]
}

Reglas:
1. Escribe en español neutro latinoamericano (sin jerga argentina ni peninsular).
2. key_points: mínimo 3, máximo 5. Cada punto debe ser autocontenido y útil sin leer el resumen.
3. summary: entre 150 y 400 palabras. Evita repetir los key_points textualmente.
4. glossary: solo términos técnicos o conceptos que un profesional nuevo en el rubro podría no conocer. Mínimo 2, máximo 8 términos.
5. Si la transcripción menciona regulaciones chilenas específicas (Ley de Copropiedad, DFL-2, normativa de la CMF, etc.), incluye el nombre oficial en el glosario.
6. No inventes información. Si la transcripción es ambigua o incompleta, refleja eso en el resumen.
7. Si la transcripción es muy corta (<500 palabras) o claramente corrupta, responde con: { "error": "transcript_too_short" } o { "error": "transcript_corrupted" }.
```

### 6.6 Manejo de la respuesta

1. Parsear el JSON de la respuesta de OpenAI.
2. Validar la estructura (todos los campos requeridos presentes, key_points es array de 3-5, etc.).
3. Si la respuesta incluye `error`, marcar el resumen como `status = 'failed'` con el motivo.
4. Si es válida, insertar/actualizar en `lesson_summaries`.
5. Registrar el `model_used`, `prompt_version`, `input_token_count`, `output_token_count` para tracking de costos.

## 7. Modelo de datos

### 7.1 Tabla `lesson_transcripts`

Almacena la transcripción de texto obtenida de Mux. Sirve como cache y fuente para regeneraciones.

```sql
CREATE TABLE lesson_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  mux_asset_id TEXT NOT NULL,
  transcript_text TEXT, -- NULL si status != 'ready'
  language TEXT DEFAULT 'es',
  word_count INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'fetching', 'ready', 'failed')),
  fetch_attempts INTEGER DEFAULT 0,
  last_fetch_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_lesson_transcript UNIQUE (lesson_id)
);

-- Índices
CREATE INDEX idx_lesson_transcripts_status ON lesson_transcripts(status);
CREATE INDEX idx_lesson_transcripts_lesson ON lesson_transcripts(lesson_id);
```

### 7.2 Tabla `lesson_summaries`

Almacena el resumen estructurado generado por OpenAI.

```sql
CREATE TABLE lesson_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  transcript_id UUID REFERENCES lesson_transcripts(id) ON DELETE SET NULL,

  -- Contenido del resumen
  suggested_title TEXT,
  key_points JSONB NOT NULL DEFAULT '[]',
    -- Estructura: ["punto 1", "punto 2", ...]
  summary_text TEXT NOT NULL,
  glossary JSONB NOT NULL DEFAULT '[]',
    -- Estructura: [{"term": "...", "definition": "..."}, ...]

  -- Metadata de generación
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'ready', 'failed', 'manually_edited')),
  model_used TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
  prompt_version TEXT NOT NULL DEFAULT 'v1',
  input_token_count INTEGER,
  output_token_count INTEGER,
  generation_count INTEGER DEFAULT 1,
  error_message TEXT,

  -- Edición manual
  is_manually_edited BOOLEAN DEFAULT false,
  edited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ,

  -- Timestamps
  generated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_lesson_summary UNIQUE (lesson_id)
);

-- Índices
CREATE INDEX idx_lesson_summaries_lesson ON lesson_summaries(lesson_id);
CREATE INDEX idx_lesson_summaries_status ON lesson_summaries(status);
```

### 7.3 RLS Policies

```sql
-- lesson_transcripts: solo admin/ops pueden leer (contiene texto completo)
ALTER TABLE lesson_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage transcripts"
  ON lesson_transcripts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ops')
    )
  );

-- lesson_summaries: alumnos pueden leer, admin/ops pueden todo
ALTER TABLE lesson_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enrolled students can view summaries"
  ON lesson_summaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM enrollments e
      JOIN lessons l ON l.module_id = (
        SELECT module_id FROM lessons WHERE lessons.id = lesson_summaries.lesson_id
      )
      WHERE e.user_id = auth.uid()
      AND e.status = 'active'
    )
  );

CREATE POLICY "Admins can manage summaries"
  ON lesson_summaries FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ops')
    )
  );
```

## 8. API Routes

### 8.1 `POST /api/classroom/generate-summary`

**Acceso:** solo admin/ops (verificar rol en session).

**Request body:**
```json
{
  "lessonId": "uuid",
  "forceRegenerate": false
}
```

**Flujo:**
1. Verificar que el usuario tiene rol admin u ops.
2. Verificar que la lección existe y tiene `mux_asset_id`.
3. Buscar transcripción en `lesson_transcripts`.
   - Si no existe o `status != 'ready'`, intentar fetch desde Mux.
   - Si el fetch falla, retornar error 422 con mensaje descriptivo.
4. Si `forceRegenerate = false` y ya existe un resumen con `status = 'ready'`, retornar 409 Conflict.
5. Si `forceRegenerate = true` y el resumen existente tiene `is_manually_edited = true`, requerir header `X-Confirm-Overwrite: true`.
6. Insertar/actualizar registro en `lesson_summaries` con `status = 'generating'`.
7. Enviar transcripción a OpenAI.
8. Parsear y validar respuesta.
9. Actualizar `lesson_summaries` con el contenido generado y `status = 'ready'`.
10. Retornar el resumen generado.

**Response (200):**
```json
{
  "id": "uuid",
  "lessonId": "uuid",
  "suggestedTitle": "Técnicas de cierre en ventas inmobiliarias",
  "keyPoints": ["...", "...", "..."],
  "summaryText": "...",
  "glossary": [{ "term": "...", "definition": "..." }],
  "modelUsed": "gpt-5.4-mini",
  "promptVersion": "v1",
  "generatedAt": "2026-05-27T..."
}
```

**Errores:**
| Código | Caso |
|---|---|
| 401 | No autenticado |
| 403 | No es admin/ops |
| 404 | Lección no existe |
| 409 | Resumen ya existe (sin forceRegenerate) |
| 422 | Lección sin video, transcripción no disponible, o transcripción muy corta |
| 429 | Rate limit de OpenAI alcanzado |
| 500 | Error de OpenAI o error interno |

### 8.2 `PATCH /api/classroom/summary/[summaryId]`

**Acceso:** solo admin/ops.

**Request body (parcial):**
```json
{
  "keyPoints": ["...", "..."],
  "summaryText": "...",
  "glossary": [{ "term": "...", "definition": "..." }]
}
```

Solo se actualizan los campos enviados. Al guardar:
- `is_manually_edited = true`
- `edited_by = auth.uid()`
- `edited_at = now()`
- `status = 'manually_edited'`

### 8.3 `GET /api/classroom/summary/[lessonId]`

**Acceso:** alumnos matriculados (verificar enrollment activo) + admin/ops.

Retorna el resumen de la lección, o `404` si no existe.

### 8.4 `POST /api/cron/process-pending-transcripts`

**Acceso:** Vercel Cron (header `Authorization: Bearer CRON_SECRET`).

**Frecuencia:** cada 5 minutos.

**Flujo:**
1. Seleccionar registros de `lesson_transcripts` donde `status = 'pending'` y `fetch_attempts < 3`.
2. Para cada uno, intentar fetch de transcripción desde Mux.
3. Si exitoso: actualizar `status = 'ready'`, guardar `transcript_text`, disparar generación de resumen.
4. Si falla: incrementar `fetch_attempts`, actualizar `last_fetch_at`.
5. Si `fetch_attempts >= 3`: marcar `status = 'failed'`.

## 9. UI — Vista del alumno

### 9.1 Ubicación

El resumen se muestra debajo del video player y debajo de los recursos, dentro de la vista de lección (`/classroom/[cohortId]/[moduleId]/[lessonId]`).

### 9.2 Wireframe

```
┌──────────────────────────────────────────────────┐
│                  VIDEO PLAYER                     │
│                  (MuxPlayer)                      │
└──────────────────────────────────────────────────┘

  Lección 3: Técnicas de cierre
  Duración: 45 min  │  Visto: 65%

  📎 Recursos
  ├ 📄 Guía de cierre.pdf
  └ 🔗 Artículo complementario

  ┌──────────────────────────────────────────────────┐
  │ 📝 Resumen de la clase                    [▼/▲] │
  ├──────────────────────────────────────────────────┤
  │                                                  │
  │  ■ Puntos clave                           [▲]   │
  │  • El cierre consultivo supera al cierre         │
  │    agresivo en un 73% en el sector...            │
  │  • La objeción más frecuente en Chile es...      │
  │  • El timing de cierre depende de señales        │
  │    verbales y no verbales del prospecto.         │
  │                                                  │
  │  ■ Resumen                                [▼]   │
  │  (colapsado por defecto)                         │
  │                                                  │
  │  ■ Glosario                               [▼]   │
  │  (colapsado por defecto)                         │
  │                                                  │
  └──────────────────────────────────────────────────┘
```

### 9.3 Componente

**`<LessonSummary lessonId={string} />`**

- Implementar con shadcn/ui `Collapsible` o `Accordion`.
- Fetch del resumen en el server component de la página de lección (SSR).
- Si `status = 'generating'`, mostrar skeleton con texto "Generando resumen...".
- Si `status = 'failed'` o no existe, mostrar "Resumen no disponible" en tono sutil (no error rojo).
- El glosario renderiza como una `<dl>` semántica con `<dt>` y `<dd>`.

## 10. UI — Vista del admin

### 10.1 En la vista de gestión de lección

Agregar una sección "Resumen IA" en la página de administración de la lección con:

- **Estado actual:** badge con el status del resumen (Generando / Listo / Editado / Error / Sin resumen).
- **Botón "Generar resumen"** (si no existe) o **"Regenerar"** (si existe).
- **Vista previa** del resumen actual con las tres secciones.
- **Botón "Editar"** que habilita la edición inline de cada sección.
- **Metadata:** modelo usado, versión del prompt, fecha de generación, tokens consumidos, número de regeneraciones.
- **Estado de transcripción:** badge con status de `lesson_transcripts` (Pendiente / Listo / Error).

## 11. Estimación de costos

### 11.1 Costos de OpenAI (gpt-5.4-mini)

| Concepto | Valor |
|---|---|
| Precio input | ~$0.75 / 1M tokens |
| Precio output | ~$4.50 / 1M tokens |
| Transcripción promedio (45 min de clase) | ~8,000 tokens |
| System prompt + instrucciones | ~500 tokens |
| Respuesta promedio (resumen estructurado) | ~800 tokens |
| **Costo por resumen** | **~$0.01 USD** |
| Costo por 100 lecciones | ~$1.00 USD |
| Costo por 500 lecciones (proyección anual) | ~$5.00 USD |

### 11.2 Costos de Mux

- Transcripción automática: **incluida sin costo adicional** en assets con audio.
- No hay costo extra por el fetch del `.txt`.

### 11.3 Conclusión

El costo es despreciable. Incluso regenerando cada resumen 5 veces, el costo anual para 500 lecciones sería < $5 USD. No se requiere presupuesto adicional para este feature.

## 12. Edge Cases

| Caso | Manejo |
|---|---|
| **Video muy corto (<3 min)** | La transcripción tendrá <500 palabras. El prompt instruye al modelo retornar `{ "error": "transcript_too_short" }`. Se marca `status = 'failed'` con motivo descriptivo. El admin puede forzar generación manualmente. |
| **Audio inaudible o corrupto** | La transcripción de Mux será basura (repeticiones, caracteres sueltos). El prompt instruye al modelo detectar esto y retornar `{ "error": "transcript_corrupted" }`. Se marca como failed. |
| **Video sin audio (presentación muda)** | Mux no genera transcripción. El fetch retorna 404. Se marca `lesson_transcripts.status = 'failed'` con motivo "No transcript available". |
| **Clase en idioma mixto (español + inglés)** | Común en el sector inmobiliario chileno (anglicismos). El prompt no necesita instrucción especial — gpt-5.4-mini maneja code-switching bien. El glosario puede incluir términos en inglés con definición en español. |
| **Transcripción muy larga (>3h de video, >25K tokens)** | gpt-5.4-mini tiene contexto de 400K tokens, no es limitante. Sin embargo, para optimizar calidad, si la transcripción supera 20K tokens, dividir en chunks con overlap de 500 tokens y generar resúmenes parciales que se fusionan en un paso final. |
| **Rate limiting de OpenAI** | Implementar retry con exponential backoff (1s, 2s, 4s). Máximo 3 reintentos. Si persiste, marcar como failed y loggear. Los tier de OpenAI para gpt-5.4-mini son generosos (500 RPM en Tier 1). |
| **Resumen generado es de baja calidad** | El admin puede regenerar (US-RS03) o editar manualmente (US-RS04). El campo `generation_count` permite detectar lecciones que requieren regeneración frecuente (señal de que el prompt necesita ajuste). |
| **Mux aún no tiene la transcripción cuando llega el webhook `asset.ready`** | Comportamiento esperado — la transcripción tarda unos minutos más que el asset. El sistema de polling con reintentos cada 5 min cubre este caso. |
| **Lección sin video asignado** | No se intenta generar resumen. El botón "Generar resumen" en admin aparece deshabilitado con tooltip "Esta lección no tiene video asignado". |
| **Admin edita resumen y luego regenera** | Diálogo de confirmación advierte que se perderán los cambios manuales. Se requiere confirmación explícita. El resumen anterior no se versiona (no-scope para MVP). |

## 13. Prompt Engineering — Consideraciones

### 13.1 Versionamiento del prompt

El prompt se almacena en código (`lib/ai/prompts/lesson-summary.ts`) y se versiona con el campo `prompt_version` en `lesson_summaries`. Esto permite:

- Saber qué versión del prompt generó cada resumen.
- Regenerar resúmenes masivamente cuando se mejora el prompt.
- A/B testing de prompts en el futuro.

### 13.2 Contexto chileno inmobiliario

El system prompt incluye contexto específico porque:

- Los términos inmobiliarios en Chile tienen particularidades (UF, contribuciones, DFL-2, subsidios DS-1, EGIS, etc.).
- Las regulaciones mencionadas en clase son chilenas (CMF, SII, Conservador de Bienes Raíces, etc.).
- El glosario debe usar definiciones relevantes para el contexto local, no definiciones genéricas.

### 13.3 Evolución del prompt

El prompt v1 es deliberadamente simple. Iteraciones futuras pueden incluir:

- Contexto del programa y módulo (e.g., "Esta clase pertenece al Módulo 2: Aspectos Legales del Diplomado en Ventas Inmobiliarias").
- Resúmenes anteriores del mismo módulo para dar continuidad narrativa.
- Instrucciones de formato más específicas según feedback de alumnos.

## 14. Seguridad

| Vector | Mitigación |
|---|---|
| Transcripción contiene información confidencial | Las transcripciones solo son accesibles por admin/ops vía RLS. Los resúmenes (que son procesados) son accesibles por alumnos matriculados. |
| API key de OpenAI expuesta | Se almacena en variable de entorno (`OPENAI_API_KEY`), nunca en el cliente. La llamada a OpenAI se hace exclusivamente server-side. |
| Prompt injection vía transcripción | Riesgo bajo — la transcripción es generada por Mux, no por input del usuario. Sin embargo, un alumno podría decir algo durante la clase que se transcriba como instrucción. Mitigación: el prompt es explícito sobre su tarea y la transcripción se envía como user message, no como system message. |
| Admin no autorizado regenera resúmenes masivamente | Rate limit en el endpoint: máximo 10 regeneraciones por admin por hora. |
| Costos descontrolados de OpenAI | El costo es inherentemente bajo (~$0.002/resumen). Como protección adicional, el cron de pending transcripts procesa máximo 20 transcripciones por ejecución. |

## 15. Implementación por fases

### Fase 1 — Pipeline completo (backend)
- Migración SQL: crear tablas `lesson_transcripts` y `lesson_summaries`.
- Extender webhook handler de Mux para crear registro en `lesson_transcripts`.
- Implementar fetch de transcripción desde Mux (`lib/mux/transcripts.ts`).
- Implementar llamada a OpenAI (`lib/ai/generate-summary.ts`).
- Crear system prompt versionado (`lib/ai/prompts/lesson-summary.ts`).
- API route `POST /api/classroom/generate-summary`.
- API route `GET /api/classroom/summary/[lessonId]`.
- Cron endpoint `POST /api/cron/process-pending-transcripts`.

### Fase 2 — UI alumno
- Componente `<LessonSummary />` con Collapsible/Accordion.
- Integrar en la página de lección debajo de recursos.
- Estados: loading, ready, generating, failed, no-summary.

### Fase 3 — UI admin
- Sección "Resumen IA" en la vista de gestión de lección.
- Botón generar/regenerar con confirmaciones.
- Edición inline de cada sección.
- API route `PATCH /api/classroom/summary/[summaryId]`.
- Badge de estado y metadata de generación.

### Fase 4 — Automatización y mejoras
- Cron automático para procesar transcripciones pendientes.
- Dashboard de estado: lecciones sin resumen, lecciones con resumen fallido.
- Regeneración masiva por prompt version (cuando se actualiza el prompt).

## 16. Métricas de éxito

| Métrica | Target | Cómo se mide |
|---|---|---|
| Cobertura | 90% de lecciones con video tienen resumen generado exitosamente | `lesson_summaries WHERE status = 'ready'` / `lessons WHERE mux_asset_id IS NOT NULL` |
| Calidad | <10% de resúmenes requieren edición manual por admin | `lesson_summaries WHERE is_manually_edited = true` / total |
| Adopción | 50% de alumnos expanden al menos una sección del resumen | Evento de analytics: `summary_section_expanded` |
| Costo | <$1 USD/mes total en OpenAI para este feature | Sumar `input_token_count + output_token_count` × pricing |
| Latencia | Resumen disponible <10 min después de asset ready | `lesson_summaries.generated_at` - `lessons.mux_asset_ready_at` |

## 17. Dependencias y prerequisitos

| Dependencia | Estado | Bloqueante |
|---|---|---|
| Módulo Classroom con videos en Mux | ✅ Implementado | Sí |
| Webhook `video.asset.ready` funcional | ✅ Implementado | Sí |
| Cuenta OpenAI con API key | ⏳ Configurar | Sí |
| Paquete `openai` (npm) instalado | ⏳ Instalar | Sí |
| Mux auto-generated transcripts habilitado | ✅ Por defecto en assets nuevos | Sí |
| Vercel Cron configurado | ⏳ Configurar | No (se puede procesar manualmente al inicio) |

## 18. Preguntas abiertas

| # | Pregunta | Impacto | Decisor |
|---|---|---|---|
| 1 | ¿Queremos mostrar la transcripción completa al alumno además del resumen? Esto habilita búsqueda textual dentro de la clase. | UX, feature scope | Producto |
| 2 | ¿Se deben generar resúmenes para videos existentes que ya están en Mux (backfill), o solo para nuevos uploads? | Pipeline, costo (mínimo) | Ops |
| 3 | ¿El `suggested_title` del resumen debe sobreescribir el título de la lección, o es solo informativo para el admin? | UX, data model | Producto |
| 4 | ¿Se quiere implementar feedback del alumno sobre la calidad del resumen (thumbs up/down)? | UX, métricas | Producto |
| 5 | ¿Los resúmenes deben ser parte del contenido indexable por Google (SEO) o son contenido privado detrás de login? | SEO, visibilidad | Marketing |
