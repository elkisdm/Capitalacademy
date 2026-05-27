# PRD — Busqueda en Transcripciones + Capitulos Automaticos

> Product Requirements Document para dos features complementarias del modulo Classroom:
> **A) In-Video Search** (busqueda full-text sobre transcripciones) y
> **B) Auto-Generated Chapter Markers** (marcadores de capitulos generados con IA).

- **Autor:** Equipo Capital Academy
- **Fecha:** 2026-05-27
- **Estado:** Draft
- **Dependencias:** PRD Classroom ([PRD-classroom.md](PRD-classroom.md)), ADR-0001 (Mux), ADR-0002 (Arquitectura Classroom), ADR-0003 (Tracking progreso)
- **Tabla existente requerida:** `lesson_transcripts` (columnas `content_text`, `content_vtt`)

---

## 1. Problema

Capital Academy tiene clases grabadas de 45-120 minutos. Un alumno que quiere repasar un tema especifico (por ejemplo, "cierre de venta" o "fideicomiso") tiene que recordar en cual leccion y en que minuto el profesor lo menciono. Hoy eso implica abrir cada video y buscar manualmente, lo cual es inviable cuando el programa tiene 20+ lecciones.

Ademas, los videos largos no tienen puntos de referencia visual. El progress bar del reproductor es una linea continua: no hay indicacion de donde empieza un tema nuevo. El reproductor actual tiene marcadores de capitulo hardcodeados en `CHAPTER_MARKERS = [12, 28, 55, 78]` (posiciones en % de la duracion) en `components/classroom/video-player.tsx`, pero son estaticos y no corresponden a contenido real.

## 2. Objetivo

### Feature A: In-Video Search

Permitir al alumno buscar un termino o frase y obtener EXACTAMENTE en que leccion y en que segundo el profesor habla de ese tema, con un snippet de contexto. Click en el resultado navega directamente al momento del video.

### Feature B: Auto-Generated Chapter Markers

Generar automaticamente marcadores de capitulo (titulo + timestamp) analizando la transcripcion con OpenAI `gpt-5.4-mini`, y mostrarlos como puntos de navegacion en el progress bar del reproductor y en un panel lateral.

Ambas features dependen de la misma infraestructura: transcripciones almacenadas en `lesson_transcripts`.

## 3. No-scope

- Busqueda semantica con embeddings (vectores). El MVP usa full-text search con `pg_trgm`. Si la calidad no es suficiente, se evalua embeddings en una iteracion posterior.
- Traduccion de transcripciones a otros idiomas.
- Edicion manual del texto de la transcripcion (el VTT se toma como fuente de verdad).
- Capitulos manuales creados desde cero sin transcripcion (se podria agregar despues).
- Subtitulos/captions renderizados sobre el video (feature separada, puede usar el mismo VTT).
- Busqueda cross-programa (un alumno solo busca dentro de las lecciones de su cohorte).

## 4. Usuarios y roles

| Rol | Acciones |
|---|---|
| **Alumno** | Buscar en transcripciones de su cohorte. Ver capitulos en el reproductor. Navegar por capitulos. |
| **Ops/Admin** | Disparar generacion de capitulos. Editar/eliminar capitulos generados. Agregar capitulos manuales. Ver estado de indexacion de transcripciones. |

## 5. Prerequisitos de datos

### 5.1 Tabla `lesson_transcripts`

La tabla ya existe con las columnas:

| Columna | Tipo | Descripcion |
|---|---|---|
| `content_text` | `text` | Transcripcion plana (sin timestamps) |
| `content_vtt` | `text` | Transcripcion en formato WebVTT (con timestamps) |

**Origen de las transcripciones:** Mux genera transcripciones automaticas (auto-captions). Tambien se puede subir un archivo `.srt`/`.vtt` manualmente. El contenido se almacena en `lesson_transcripts` vinculado por `lesson_id`.

### 5.2 Extension `pg_trgm`

Supabase soporta `pg_trgm` (disponible para habilitar). Se requiere para busqueda fuzzy e insensible a acentos.

---

## Feature A: In-Video Search

### A.1 User Stories

**US-S01: Buscar un tema en todas mis lecciones**
> Como alumno, quiero escribir "cierre de venta" y ver en que lecciones y minutos el profesor habla de eso, para ir directamente al momento relevante.

Criterios de aceptacion:
- Input de busqueda visible en el sidebar o top bar del classroom.
- Los resultados muestran: nombre del modulo, titulo de la leccion, snippet de texto con el termino resaltado, y timestamp.
- Al hacer click en un resultado, navego a la leccion en el segundo exacto.
- La busqueda es insensible a mayusculas y acentos (`tecnica` encuentra `tecnica`).
- Si no hay resultados, veo un mensaje claro.
- La busqueda solo retorna lecciones de la cohorte del alumno.

**US-S02: Busqueda fuzzy tolerante a errores**
> Como alumno, quiero que la busqueda tolere typos menores (por ejemplo, "fidecoimiso" deberia encontrar "fideicomiso").

Criterios de aceptacion:
- Se usa `pg_trgm` con `similarity()` o `word_similarity()` para matching aproximado.
- El threshold de similitud es configurable (default: 0.3).
- Los resultados se ordenan por relevancia (similitud descendente).

### A.2 Modelo de datos

**Indices nuevos en `lesson_transcripts`:**

```sql
-- Habilitar extension (una sola vez)
create extension if not exists pg_trgm;

-- Indice GIN para full-text search con tsvector
alter table public.lesson_transcripts
  add column if not exists content_tsv tsvector
  generated always as (
    to_tsvector('spanish', coalesce(content_text, ''))
  ) stored;

create index if not exists lesson_transcripts_tsv_idx
  on public.lesson_transcripts using gin(content_tsv);

-- Indice GIN para trigram (fuzzy / accent-insensitive)
create index if not exists lesson_transcripts_trgm_idx
  on public.lesson_transcripts using gin(content_text gin_trgm_ops);
```

**Nota sobre acentos:** PostgreSQL `unaccent` se puede combinar con `pg_trgm` para normalizar acentos. Se crea un diccionario de busqueda:

```sql
create extension if not exists unaccent;

create text search configuration spanish_unaccent (copy = spanish);
alter text search configuration spanish_unaccent
  alter mapping for hword, hword_part, word
  with unaccent, spanish_stem;
```

Y el `content_tsv` usaria `to_tsvector('spanish_unaccent', ...)`.

### A.3 API

**Endpoint:** `GET /api/classroom/search`

**Query params:**

| Param | Tipo | Requerido | Descripcion |
|---|---|---|---|
| `q` | string | Si | Termino de busqueda (min 2 caracteres) |
| `cohortId` | string (uuid) | Si | Cohorte del alumno (para scope de seguridad) |
| `limit` | number | No | Max resultados (default: 20, max: 50) |

**Response:**

```json
{
  "results": [
    {
      "lessonId": "uuid",
      "lessonTitle": "Tecnicas de cierre inmobiliario",
      "moduleId": "uuid",
      "moduleName": "Modulo 02: Ventas",
      "modulePosition": 2,
      "matches": [
        {
          "text": "...entonces la tecnica de **cierre de venta** que mas funciona en el sector inmobiliario es...",
          "timestampSeconds": 1847,
          "timestampFormatted": "30:47"
        },
        {
          "text": "...vamos a repasar las tres fases del **cierre de venta**: primera, la preparacion...",
          "timestampSeconds": 2103,
          "timestampFormatted": "35:03"
        }
      ]
    }
  ],
  "query": "cierre de venta",
  "totalMatches": 7
}
```

**Logica del endpoint:**

1. Verificar autenticacion (`auth.uid()`).
2. Verificar que el usuario tiene enrollment activo en `cohortId`.
3. Obtener `program_id` de la cohorte.
4. Obtener todas las lecciones del programa que tengan transcripcion.
5. Ejecutar query de busqueda (full-text + trigram fallback).
6. Para cada match en `content_text`, buscar el timestamp mas cercano en `content_vtt` (parseando el VTT para mapear texto a timestamp).
7. Retornar resultados agrupados por leccion, ordenados por relevancia.

**Query SQL principal (full-text):**

```sql
select
  lt.lesson_id,
  l.title as lesson_title,
  pm.id as module_id,
  pm.title as module_name,
  pm.position as module_position,
  ts_headline('spanish_unaccent', lt.content_text,
    plainto_tsquery('spanish_unaccent', :query),
    'StartSel=**, StopSel=**, MaxFragments=3, MaxWords=25, MinWords=10'
  ) as snippet,
  ts_rank(lt.content_tsv, plainto_tsquery('spanish_unaccent', :query)) as rank
from lesson_transcripts lt
join lessons l on l.id = lt.lesson_id
join program_modules pm on pm.id = l.module_id
where pm.program_id = :programId
  and lt.content_tsv @@ plainto_tsquery('spanish_unaccent', :query)
order by rank desc
limit :limit;
```

**Fallback con trigram** (si full-text retorna 0 resultados):

```sql
select
  lt.lesson_id,
  similarity(lt.content_text, :query) as sim
from lesson_transcripts lt
join lessons l on l.id = lt.lesson_id
join program_modules pm on pm.id = l.module_id
where pm.program_id = :programId
  and lt.content_text % :query
order by sim desc
limit :limit;
```

### A.4 Mapeo texto-a-timestamp

El `content_vtt` tiene formato WebVTT:

```
WEBVTT

00:00:00.000 --> 00:00:05.200
Buenas tardes, bienvenidos a la clase de hoy

00:00:05.200 --> 00:00:12.400
Vamos a hablar sobre tecnicas de cierre de venta
```

**Algoritmo:**

1. Parsear el VTT en un array de `{ start: number, end: number, text: string }`.
2. Para cada snippet de texto encontrado en la busqueda full-text, buscar la linea del VTT que contenga el texto (o la mayor superposicion de palabras).
3. Retornar el `start` en segundos como `timestampSeconds`.
4. Este parsing se hace en el servidor (Node.js), no en SQL. Se puede cachear el VTT parseado si el rendimiento lo requiere.

**Libreria sugerida:** `webvtt-parser` (npm) o un parser minimal propio (~30 lineas).

### A.5 UI

**Ubicacion:** Barra de busqueda en el sidebar del classroom, arriba de la lista de lecciones.

```
┌──────────────────────────────┐
│  🔍 Buscar en transcripciones │  <-- Input con placeholder
├──────────────────────────────┤
│                              │
│  Resultados para "cierre"    │
│                              │
│  Mod. 02 · Lec. 03           │
│  Tecnicas de cierre          │
│  "...la tecnica de **cierre  │
│   de venta** que mas..."     │
│  ⏱ 30:47                    │  <-- Click navega a /classroom/{cohort}/{mod}/{lesson}?t=1847
│                              │
│  Mod. 02 · Lec. 05           │
│  Negociacion avanzada        │
│  "...retomando el **cierre** │
│   que vimos en la clase..."  │
│  ⏱ 12:03                    │
│                              │
└──────────────────────────────┘
```

**Comportamiento:**

- Debounce de 300ms en el input.
- Minimo 2 caracteres para disparar busqueda.
- Spinner mientras carga.
- Click en resultado: `router.push(/classroom/${cohortId}/${moduleId}/${lessonId}?t=${timestampSeconds})`.
- La pagina de leccion lee el query param `t` y lo pasa como `initialPosition` al `VideoPlayer`.
- Si el alumno ya esta en una leccion y busca, los resultados de ESA leccion aparecen primero (con badge "Esta leccion").

### A.6 Edge cases

| Caso | Comportamiento |
|---|---|
| Leccion sin transcripcion | No aparece en resultados. No se muestra error. |
| Busqueda de palabra muy comun ("el", "la", "de") | `ts_rank` las penaliza. Se puede agregar un minimo de `rank > 0.01`. |
| Acentos (`tecnica` vs `tecnica`) | `unaccent` + `spanish_unaccent` config lo maneja transparente. |
| Query vacio o < 2 chars | No se ejecuta busqueda. Se muestra placeholder. |
| Alumno busca en cohorte donde no esta inscrito | 403 Forbidden. |
| VTT corrupto o ausente para una leccion | Se retorna el match sin timestamp (`timestampSeconds: null`). El UI muestra "ir a leccion" sin minuto exacto. |

### A.7 Performance

- **Volumen esperado:** ~50-100 lecciones por programa, transcripciones de ~5,000-15,000 palabras cada una.
- **Indice GIN** sobre `content_tsv` hace el full-text search O(log n) con scan de indice. Para 100 lecciones es instantaneo.
- **Trigram** es mas costoso, pero con 100 documentos es irrelevante (<50ms).
- **No se necesita Elasticsearch ni ningun servicio externo** en esta escala.
- **Cache:** No es necesario en MVP. Si se detecta latencia, se puede agregar cache por query+cohortId con TTL de 5 minutos (los transcripts no cambian frecuentemente).

---

## Feature B: Auto-Generated Chapter Markers

### B.1 User Stories

**US-CH01: Ver capitulos en el reproductor**
> Como alumno, quiero ver marcadores de capitulo en la barra de progreso del video para saber donde empieza cada tema.

Criterios de aceptacion:
- Los marcadores aparecen como ticks blancos en el progress bar (reemplazando los hardcodeados actuales).
- Al hacer hover sobre un marcador, veo un tooltip con el titulo del capitulo.
- El capitulo activo se resalta (tick mas grande o de color diferente).
- En dispositivos moviles, los tooltips funcionan con tap.

**US-CH02: Navegar por capitulos**
> Como alumno, quiero ver una lista de capitulos con titulo y timestamp para saltar directamente a un tema.

Criterios de aceptacion:
- Panel o dropdown debajo del video (o tab en la seccion de recursos) que lista los capitulos.
- Cada entrada muestra: titulo del capitulo + timestamp formateado.
- Click en un capitulo salta el video a ese segundo.
- El capitulo actualmente en reproduccion se resalta.

**US-CH03: Generar capitulos automaticamente (admin)**
> Como ops/admin, quiero presionar un boton para generar automaticamente los capitulos de una leccion usando IA.

Criterios de aceptacion:
- En el panel de administracion de la leccion, hay un boton "Generar capitulos".
- El boton esta deshabilitado si la leccion no tiene transcripcion.
- Al presionar, se muestra un spinner/estado de carga.
- Los capitulos generados se muestran en una lista editable.
- Si ya existen capitulos generados, se pregunta si quiere reemplazarlos.
- Los capitulos manuales NO se eliminan al regenerar.

**US-CH04: Editar capitulos (admin)**
> Como ops/admin, quiero editar el titulo, timestamp y orden de los capitulos generados o manuales.

Criterios de aceptacion:
- Lista editable con inputs para titulo y timestamp.
- Boton para agregar capitulo manual.
- Boton para eliminar un capitulo individual.
- Los cambios se guardan al hacer click en "Guardar".
- Cada capitulo muestra un badge "auto" o "manual".

### B.2 Modelo de datos

**Nueva tabla `lesson_chapters`:**

```sql
create table public.lesson_chapters (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  position_seconds int not null,
  title text not null,
  sort_order int not null default 0,
  is_generated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lesson_chapters_lesson_idx
  on public.lesson_chapters(lesson_id);

-- RLS
alter table public.lesson_chapters enable row level security;

-- Todos los autenticados leen (los capitulos son contenido publico de la leccion)
create policy lesson_chapters_authenticated_select on public.lesson_chapters
  for select using (auth.uid() is not null);

-- Solo staff escribe
create policy lesson_chapters_staff_insert on public.lesson_chapters
  for insert with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('ops', 'admin')
    )
  );

create policy lesson_chapters_staff_update on public.lesson_chapters
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('ops', 'admin')
    )
  );

create policy lesson_chapters_staff_delete on public.lesson_chapters
  for delete using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('ops', 'admin')
    )
  );
```

### B.3 Pipeline de generacion

**API route:** `POST /api/admin/chapters/generate`

**Request body:**

```json
{
  "lessonId": "uuid"
}
```

**Flujo:**

1. Verificar que el usuario es ops/admin.
2. Obtener la leccion y su transcripcion (`content_text` de `lesson_transcripts`).
3. Obtener el `content_vtt` para tener timestamps disponibles.
4. Enviar a OpenAI `gpt-5.4-mini`:

```
System: Eres un asistente que analiza transcripciones de clases ejecutivas en espanol.
Tu tarea es identificar los cambios de tema principales y generar marcadores de capitulo.

User: Dada esta transcripcion de la clase "{lesson_title}" (duracion: {duration_seconds}s),
identifica entre 3 y 8 capitulos. Para cada uno, indica:
- El segundo exacto donde empieza (basandote en los timestamps del VTT)
- Un titulo corto y descriptivo (maximo 60 caracteres)

Responde SOLO con un JSON array:
[
  { "position_seconds": 0, "title": "Introduccion y bienvenida" },
  { "position_seconds": 342, "title": "Tecnicas de cierre de venta" },
  ...
]

Reglas:
- El primer capitulo SIEMPRE empieza en el segundo 0.
- Los titulos deben ser descriptivos del CONTENIDO, no genericos ("Parte 1", "Tema 2" NO sirven).
- Usa espanol neutro latinoamericano.
- No incluyas timestamps que excedan la duracion total del video.

Transcripcion (formato VTT):
{content_vtt}
```

5. Parsear la respuesta JSON de OpenAI.
6. Validar: min 3 capitulos, max 8, position_seconds dentro del rango [0, duration], primer capitulo en 0.
7. Si ya existen capitulos generados (`is_generated = true`), eliminarlos.
8. Insertar los nuevos capitulos con `is_generated = true` y `sort_order` secuencial.
9. Retornar los capitulos creados.

**Response:**

```json
{
  "chapters": [
    { "id": "uuid", "position_seconds": 0, "title": "Introduccion y bienvenida", "sort_order": 0, "is_generated": true },
    { "id": "uuid", "position_seconds": 342, "title": "Tecnicas de cierre de venta", "sort_order": 1, "is_generated": true },
    { "id": "uuid", "position_seconds": 1205, "title": "Role-play: objeciones del comprador", "sort_order": 2, "is_generated": true },
    { "id": "uuid", "position_seconds": 2480, "title": "Preguntas y cierre", "sort_order": 3, "is_generated": true }
  ],
  "model": "gpt-5.4-mini",
  "tokenUsage": { "prompt": 3200, "completion": 180, "total": 3380 }
}
```

### B.4 Costo

Con `gpt-5.4-mini`:
- Input: ~3,000-10,000 tokens por transcripcion (promedio ~5,000) × $0.75/1M = ~$0.004.
- Output: ~100-200 tokens (JSON corto) × $4.50/1M = ~$0.001.
- Costo por leccion: ~$0.005 USD.
- Para 100 lecciones: ~$0.50 USD total. **Negligible.**

### B.5 Integracion con el reproductor

**Estado actual** (en `components/classroom/video-player.tsx`):

```typescript
// Linea 211 — hardcodeado
const CHAPTER_MARKERS = [12, 28, 55, 78];
```

Los marcadores se renderizan en la linea 871-882 como divs absolutos sobre el progress bar.

**Cambio necesario:**

1. **Prop nueva en `VideoPlayer`:**

```typescript
type ChapterMarker = {
  id: string;
  positionSeconds: number;
  title: string;
};

type VideoPlayerProps = {
  // ... props existentes
  chapters?: ChapterMarker[];
};
```

2. **Eliminar** la constante `CHAPTER_MARKERS`.

3. **Calcular posiciones como %** a partir de `chapters`:

```typescript
const chapterPositions = (chapters ?? []).map(ch => ({
  ...ch,
  percent: durationSeconds > 0
    ? (ch.positionSeconds / durationSeconds) * 100
    : 0,
}));
```

4. **Renderizar marcadores** con tooltip:

```tsx
{chapterPositions.map((ch) => (
  <div
    key={ch.id}
    className="absolute top-1/2 -translate-y-1/2 rounded-full cursor-pointer group"
    style={{
      left: `${ch.percent}%`,
      height: (hoverBar ? 6 : 4) + 2,
      width: 3,
      background: "rgba(255,255,255,0.65)",
    }}
    onClick={(e) => {
      e.stopPropagation();
      if (videoRef.current) videoRef.current.currentTime = ch.positionSeconds;
    }}
  >
    {/* Tooltip */}
    <div className="absolute -top-9 left-1/2 -translate-x-1/2 hidden group-hover:block
      whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-bold text-white"
      style={{
        background: "rgba(20,22,58,0.92)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      {ch.title}
    </div>
  </div>
))}
```

5. **Panel de capitulos** debajo del video o como tab:

```
┌─────────────────────────────────────────────┐
│  Capitulos (5)                      ▾       │
├─────────────────────────────────────────────┤
│  ▸ 00:00  Introduccion y bienvenida         │
│    05:42  Tecnicas de cierre de venta       │  <-- activo (resaltado)
│    20:05  Role-play: objeciones             │
│    41:20  Analisis de casos reales          │
│    58:30  Preguntas y cierre                │
└─────────────────────────────────────────────┘
```

El capitulo activo se determina comparando `currentTime` contra los `positionSeconds` de cada capitulo: el activo es el ultimo cuyo `positionSeconds <= currentTime`.

### B.6 Carga de datos

En la pagina de la leccion (`app/(classroom)/classroom/[cohortId]/[moduleId]/[lessonId]/page.tsx`), se agrega una query para cargar los capitulos:

```typescript
const { data: chapters } = await supabase
  .from("lesson_chapters")
  .select("id, position_seconds, title, sort_order")
  .eq("lesson_id", lessonId)
  .order("sort_order", { ascending: true });
```

Y se pasa al componente:

```tsx
<VideoPlayer
  playbackId={muxPlaybackId}
  lessonId={lessonId}
  lessonTitle={lesson.title}
  durationSeconds={videoDuration}
  initialPosition={progress?.playback_position_seconds ?? 0}
  initialWatchPercentage={watchPct}
  initialCompleted={progress?.completed ?? false}
  chapters={(chapters ?? []).map(ch => ({
    id: ch.id,
    positionSeconds: ch.position_seconds,
    title: ch.title,
  }))}
/>
```

### B.7 Admin UI

En la vista de administracion de una leccion:

1. **Seccion "Capitulos"** con la lista actual (si existe).
2. **Boton "Generar con IA"** (solo habilitado si hay transcripcion).
3. **Lista editable:**
   - Cada fila: `[timestamp input] [titulo input] [badge auto/manual] [boton eliminar]`
   - Boton "+ Agregar capitulo" al final.
   - Boton "Guardar cambios" que hace `PATCH /api/admin/chapters` con el array completo.
4. **Confirmacion** si ya existen capitulos generados: "Ya hay X capitulos generados. Se reemplazaran los generados y se conservaran los manuales."

### B.8 Edge cases

| Caso | Comportamiento |
|---|---|
| Leccion sin transcripcion | Boton "Generar" deshabilitado con tooltip explicativo. |
| Leccion sin capitulos | El progress bar no muestra marcadores (como antes del feature). |
| Transcripcion muy corta (<1 min) | OpenAI genera 1-2 capitulos. El minimo de 3 se relaja si la duracion es <5 min. |
| OpenAI retorna JSON invalido | Se reintenta 1 vez. Si falla de nuevo, se muestra error al admin. |
| Capitulos manuales + generados | La regeneracion solo reemplaza los `is_generated = true`. Los manuales se conservan. |
| Timestamp generado excede la duracion | Se descarta ese capitulo silenciosamente y se loguea un warning. |
| Duracion del video desconocida (`video_duration_seconds` null) | Boton "Generar" deshabilitado. Sin duracion no se puede validar timestamps. |

---

## 6. Flujos principales

### 6.1 Alumno busca un tema

```
Alumno en /classroom/{cohortId}/{modId}/{lessonId}
  → Escribe "fideicomiso" en el input de busqueda del sidebar
  → Debounce 300ms → GET /api/classroom/search?q=fideicomiso&cohortId=xxx
  → Server: auth check → enrollment check → full-text query → timestamp mapping
  → Response: 3 resultados en 2 lecciones distintas
  → UI: muestra resultados agrupados por leccion con snippets + timestamps
  → Alumno hace click en "Mod 03 · Lec 02 · 15:42"
  → router.push(/classroom/{cohortId}/{mod03Id}/{lec02Id}?t=942)
  → Lesson page: lee ?t=942 → pasa initialPosition=942 al VideoPlayer
  → Video arranca en 15:42
```

### 6.2 Admin genera capitulos

```
Admin en /admin/lessons/{lessonId}
  → Ve seccion "Capitulos" vacia
  → Click "Generar con IA"
  → POST /api/admin/chapters/generate { lessonId }
  → Server: fetch transcripcion → send to OpenAI gpt-5.4-mini → parse JSON
  → Valida timestamps → inserta en lesson_chapters
  → Response: 5 capitulos generados
  → UI: lista editable con los 5 capitulos
  → Admin ajusta el titulo del capitulo 3
  → Click "Guardar"
  → PATCH /api/admin/chapters { lessonId, chapters: [...] }
  → Guardado. Los alumnos ven los capitulos en el reproductor.
```

### 6.3 Alumno navega por capitulos

```
Alumno viendo una leccion con 5 capitulos
  → Ve 5 marcadores blancos en el progress bar
  → Hover sobre el marcador en 20:05 → tooltip "Role-play: objeciones"
  → Click en el marcador → video salta a 20:05
  → Abre el panel de capitulos debajo del video
  → Ve la lista con el capitulo "Role-play: objeciones" resaltado como activo
  → Click en "Analisis de casos reales" (41:20) → video salta a 41:20
```

---

## 7. Modelo de datos completo (resumen)

### Tablas nuevas

| Tabla | Columnas clave | Relacion |
|---|---|---|
| `lesson_chapters` | `id`, `lesson_id`, `position_seconds`, `title`, `sort_order`, `is_generated`, `created_at`, `updated_at` | `lesson_id` FK → `lessons.id` |

### Columnas nuevas en tablas existentes

| Tabla | Columna nueva | Tipo | Descripcion |
|---|---|---|---|
| `lesson_transcripts` | `content_tsv` | `tsvector` (generated stored) | Vector de busqueda full-text, generado automaticamente desde `content_text` |

### Indices nuevos

| Tabla | Indice | Tipo | Columna |
|---|---|---|---|
| `lesson_transcripts` | `lesson_transcripts_tsv_idx` | GIN | `content_tsv` |
| `lesson_transcripts` | `lesson_transcripts_trgm_idx` | GIN (trgm) | `content_text` |
| `lesson_chapters` | `lesson_chapters_lesson_idx` | B-tree | `lesson_id` |

### Extensions

| Extension | Proposito |
|---|---|
| `pg_trgm` | Fuzzy matching, similarity search |
| `unaccent` | Normalizacion de acentos (tecnica = tecnica) |

---

## 8. API Routes (resumen)

| Metodo | Ruta | Autorizacion | Descripcion |
|---|---|---|---|
| `GET` | `/api/classroom/search` | Alumno (enrollment activo) | Busqueda full-text en transcripciones de la cohorte |
| `POST` | `/api/admin/chapters/generate` | Ops/Admin | Genera capitulos con OpenAI a partir de transcripcion |
| `GET` | `/api/admin/chapters?lessonId=xxx` | Ops/Admin | Lista capitulos de una leccion (para edicion) |
| `PATCH` | `/api/admin/chapters` | Ops/Admin | Actualiza capitulos (bulk upsert/delete) |
| `DELETE` | `/api/admin/chapters/:id` | Ops/Admin | Elimina un capitulo individual |

---

## 9. Integraciones

| Sistema | Uso | Direccion |
|---|---|---|
| **Supabase DB** | Storage de transcripciones, capitulos, indices de busqueda | CRUD + full-text queries |
| **Supabase pg_trgm** | Fuzzy matching para busqueda tolerante a typos | Lectura (via indice) |
| **OpenAI API** (`gpt-5.4-mini`) | Generacion de capitulos a partir de transcripciones | Request/response (sin streaming) |
| **Mux** | Fuente de transcripciones auto-generadas (ya existente) | Lectura (webhook o API) |

---

## 10. Metricas de exito

| Metrica | Target | Como se mide |
|---|---|---|
| **Adopcion de busqueda** | 30% de alumnos activos usan busqueda al menos 1 vez por semana | Conteo de requests a `/api/classroom/search` por usuario |
| **Click-through de busqueda** | 50% de busquedas resultan en click a un resultado | Evento analytics: search → navigation |
| **Uso de capitulos** | 40% de sesiones de video incluyen al menos 1 click en capitulo | Evento: chapter_click por sesion de video |
| **Calidad de capitulos** | <20% de capitulos generados son editados por admin | Ratio de `lesson_chapters` donde `updated_at > created_at + 1min` AND `is_generated = true` |
| **Latencia de busqueda** | p95 < 500ms | Logs del API route |

---

## 11. Dependencias y prerequisitos

| Dependencia | Estado | Bloqueante |
|---|---|---|
| Tabla `lesson_transcripts` con datos | Tabla existe, datos pendientes de poblar | **Si** (sin transcripciones no hay busqueda ni capitulos) |
| Extension `pg_trgm` habilitada en Supabase | Disponible, por habilitar | **Si** (para Feature A) |
| Extension `unaccent` habilitada en Supabase | Disponible, por habilitar | **Si** (para acentos en Feature A) |
| OpenAI API key configurada en `.env` | Por configurar | **Si** (para Feature B) |
| Video player funcional con progress bar | Implementado | No |
| Sidebar del classroom | Implementado | No |
| Panel de admin para lecciones | Parcialmente implementado | No (se puede agregar la seccion de capitulos) |

---

## 12. Fases de implementacion

### Fase 1 — Infraestructura de busqueda

**Estimacion:** 2-3 dias

1. Habilitar extensions `pg_trgm` y `unaccent` en Supabase.
2. Crear text search configuration `spanish_unaccent`.
3. Agregar columna `content_tsv` (generated stored) a `lesson_transcripts`.
4. Crear indices GIN (`content_tsv` y `content_text` con trgm).
5. Implementar API route `GET /api/classroom/search`.
6. Implementar parser de VTT (utility function en `lib/classroom/vtt-parser.ts`).
7. Implementar mapeo texto-a-timestamp.
8. Tests: query con acentos, query fuzzy, query sin resultados, query cross-cohorte bloqueada.

### Fase 2 — UI de busqueda

**Estimacion:** 2 dias

1. Componente `TranscriptSearch` en el sidebar del classroom.
2. Input con debounce + estado de carga.
3. Lista de resultados con snippets y timestamps.
4. Navegacion al hacer click (con query param `?t=`).
5. Lectura de `?t=` en la lesson page para pasar `initialPosition`.
6. Indicador "Esta leccion" para resultados de la leccion actual.

### Fase 3 — Tabla y API de capitulos

**Estimacion:** 1-2 dias

1. Migracion SQL: tabla `lesson_chapters` + RLS.
2. API routes: `POST /api/admin/chapters/generate`, `GET`, `PATCH`, `DELETE`.
3. Integracion con OpenAI: prompt, parsing de respuesta, validacion.
4. Tests: generacion, regeneracion, capitulos manuales preservados.

### Fase 4 — Capitulos en el reproductor

**Estimacion:** 2 dias

1. Agregar prop `chapters` al `VideoPlayer`.
2. Eliminar constante `CHAPTER_MARKERS` hardcodeada.
3. Renderizar marcadores dinamicos con tooltips.
4. Panel de capitulos (dropdown o tab).
5. Resaltado del capitulo activo.
6. Cargar capitulos en la lesson page y pasarlos al player.

### Fase 5 — Admin UI de capitulos

**Estimacion:** 1-2 dias

1. Seccion "Capitulos" en la vista de administracion de lecciones.
2. Boton "Generar con IA" con spinner y confirmacion.
3. Lista editable (titulo, timestamp, delete).
4. Agregar capitulo manual.
5. Guardar cambios (bulk update).

**Total estimado: 8-11 dias de desarrollo.**

---

## 13. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| Transcripciones de baja calidad (auto-generated por Mux) afectan precision de busqueda y capitulos | Media | Alto | Permitir upload manual de VTT corregido. Los capitulos se pueden editar manualmente. |
| `gpt-5.4-mini` genera capitulos con timestamps incorrectos | Baja | Medio | Validacion server-side de timestamps vs duracion. Admin puede editar. |
| La busqueda full-text en espanol no maneja bien jerga inmobiliaria chilena | Media | Medio | `pg_trgm` como fallback fuzzy. Se puede agregar un diccionario custom de terminos del sector. |
| Latencia de OpenAI en generacion de capitulos | Baja | Bajo | Es operacion de admin, no de alumno. No necesita ser instantanea. Se muestra spinner. |

---

## 14. Preguntas abiertas

| # | Pregunta | Impacto | Decisor |
|---|---|---|---|
| 1 | Las transcripciones de Mux son suficientemente buenas para el espanol chileno, o necesitamos Whisper/otro servicio? | Calidad de busqueda y capitulos | Ops (evaluar con videos reales) |
| 2 | Se deben generar capitulos automaticamente al subir un video (trigger en webhook) o solo bajo demanda del admin? | Automatizacion vs control | Producto |
| 3 | La busqueda deberia incluir tambien titulos y descripciones de lecciones, o solo transcripciones? | Scope de busqueda | Producto |
| 4 | Los capitulos se muestran en la lista de lecciones (sidebar), o solo dentro del reproductor? | UI, scope de integracion | Diseno |
| 5 | Se quiere permitir que los alumnos reporten capitulos mal ubicados (feedback loop)? | Calidad, complejidad | Producto |
