# PRD — Transcripcion Interactiva con Click-to-Seek

> Product Requirements Document para el panel de transcripcion sincronizada con el reproductor de video.

- **Autor:** Equipo Capital Academy
- **Fecha:** 2026-05-27
- **Estado:** Draft
- **Epica relacionada:** E13 (Recursos/Comentarios), E5 (Sesiones/grabaciones)
- **ADRs relacionados:** [0001](adr/0001-mux-como-video-provider.md), [0002](adr/0002-arquitectura-modulo-classroom.md)
- **PRD padre:** [PRD-classroom](PRD-classroom.md)

---

## 1. Problema

Los alumnos de Capital Academy consumen clases grabadas de 30 a 60 minutos. Hoy no tienen forma de:

1. **Buscar un tema especifico** dentro de una clase sin adelantar/retroceder manualmente el video.
2. **Leer el contenido** de la clase sin reproducir el video completo (util en ambientes sin audio o para repaso rapido).
3. **Navegar directamente** a un momento especifico del video donde se discutio un concepto.
4. **Copiar fragmentos** del contenido hablado para sus notas personales.

Mux genera transcripciones automaticas en formato WebVTT (`.vtt`) con marcas de tiempo. Este contenido ya existe pero no se expone al alumno.

## 2. Objetivo

Construir un panel de transcripcion interactiva (`TranscriptPanel`) que:

1. Muestre la transcripcion completa del video segmentada y sincronizada con el tiempo de reproduccion.
2. Destaque visualmente el segmento que se esta reproduciendo en ese momento.
3. Permita al alumno hacer click en cualquier segmento para saltar a ese punto del video.
4. Ofrezca busqueda por texto dentro de la transcripcion.
5. Permita copiar segmentos individuales al portapapeles.

### Metricas de exito

| Metrica | Target | Medicion |
|---|---|---|
| Adopcion | 30% de sesiones de video con al menos 1 click-to-seek en transcripcion | Evento analytics `transcript_seek` |
| Busqueda | 15% de sesiones de video usan el filtro de busqueda | Evento analytics `transcript_search` |
| Copia | 10% de sesiones de video copian al menos 1 segmento | Evento analytics `transcript_copy` |
| Rendimiento | Panel renderiza en <100ms para transcripciones de hasta 500 segmentos | Lighthouse / performance profiling |

## 3. No-scope

- Edicion o correccion manual de transcripciones por admin (se aborda en iteracion futura).
- Traduccion automatica de transcripciones.
- Generacion de transcripciones desde la plataforma (Mux las genera; nosotros solo las consumimos y cacheamos).
- Subtitulos superpuestos sobre el video (track nativo de `<video>` — funcionalidad separada).
- Exportar transcripcion completa como PDF o documento.
- Resumen automatico con IA del contenido de la clase.

## 4. Usuarios

| Rol | Interaccion con transcripcion |
|---|---|
| **Alumno** | Lee, busca, navega (click-to-seek), copia segmentos |
| **Ops/Admin** | Ve la transcripcion como la ve el alumno (sin edicion en MVP) |

## 5. User Stories

### US-T01: Ver la transcripcion de una clase

> Como alumno, quiero ver la transcripcion completa de la clase debajo del video para poder leer el contenido hablado.

**Criterios de aceptacion:**
- Debajo del video, junto a la tab "Recursos", aparece una tab "Transcripcion".
- Al seleccionar "Transcripcion", se muestra un panel scrollable con todos los segmentos de la transcripcion.
- Cada segmento muestra: marca de tiempo (formato `mm:ss`) + texto.
- Si la leccion no tiene transcripcion disponible, la tab no aparece.

### US-T02: Seguir la transcripcion mientras el video se reproduce

> Como alumno, quiero que la transcripcion destaque automaticamente el segmento que se esta reproduciendo para seguir la lectura en sincronizacion con el video.

**Criterios de aceptacion:**
- El segmento activo se distingue visualmente con:
  - Borde izquierdo de color lime (`#c5f122`) de 3px.
  - Texto en bold.
  - Fondo ligeramente resaltado (`rgba(197, 241, 34, 0.06)`).
- El panel se auto-desplaza para mantener el segmento activo visible.
- El scroll usa `scrollIntoView({ behavior: 'smooth', block: 'nearest' })` para no ser intrusivo.
- Si el alumno hace scroll manual, el auto-scroll se pausa hasta que el segmento activo vuelva a estar fuera de la vista.

### US-T03: Saltar a un punto del video desde la transcripcion

> Como alumno, quiero hacer click en cualquier segmento de la transcripcion para que el video salte a ese momento exacto.

**Criterios de aceptacion:**
- El cursor cambia a `pointer` al pasar sobre cualquier segmento.
- Al hacer click, el video salta a `segment.start` segundos.
- La marca de tiempo de cada segmento funciona como indicador visual de "clickeabilidad" (color violet al hover).
- El video NO inicia reproduccion automatica si estaba pausado — solo cambia la posicion.

### US-T04: Buscar dentro de la transcripcion

> Como alumno, quiero filtrar los segmentos de la transcripcion por texto para encontrar rapidamente donde se habla de un tema especifico.

**Criterios de aceptacion:**
- En la parte superior del panel hay un input de busqueda con placeholder "Buscar en transcripcion...".
- Al escribir, se filtran los segmentos que contienen el texto (case-insensitive, sin acentos).
- Los segmentos que no coinciden se ocultan.
- El texto coincidente dentro de cada segmento visible se resalta con fondo amarillo (highlight).
- Al limpiar el input, se muestran todos los segmentos nuevamente.
- Si no hay resultados, se muestra un mensaje "Sin resultados para [query]".
- Debounce de 200ms en el filtrado para no bloquear el input.

### US-T05: Copiar un segmento de la transcripcion

> Como alumno, quiero copiar el texto de un segmento especifico para pegarlo en mis notas.

**Criterios de aceptacion:**
- Al hacer hover sobre un segmento, aparece un boton de copiar (icono clipboard) en la esquina superior derecha.
- Al hacer click en el boton, se copia el texto del segmento al portapapeles via `navigator.clipboard.writeText()`.
- Se muestra un feedback visual breve: el icono cambia a check por 1.5 segundos.
- En mobile, el boton de copiar es visible permanentemente (no depende del hover).

### US-T06: Navegacion por teclado

> Como alumno que usa teclado, quiero navegar entre segmentos de la transcripcion sin necesidad del mouse.

**Criterios de aceptacion:**
- Con foco en el panel de transcripcion, `ArrowDown` / `ArrowUp` mueven el foco entre segmentos.
- `Enter` en un segmento con foco ejecuta click-to-seek.
- El segmento activo (en reproduccion) tiene `aria-current="true"`.
- Cada segmento es un `<button>` con `role` implicito, con `aria-label` descriptivo: "Ir a [mm:ss] — [texto truncado]".

## 6. Arquitectura

### 6.1 Modelo de datos

**Nueva tabla: `lesson_transcripts`**

```sql
CREATE TABLE lesson_transcripts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  language    text NOT NULL DEFAULT 'es',
  content_vtt text NOT NULL,              -- WebVTT crudo completo
  segment_count integer,                  -- Cantidad de cues (calculado al insertar)
  source      text NOT NULL DEFAULT 'mux', -- 'mux' | 'manual' | 'whisper'
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (lesson_id, language)
);

-- RLS: alumnos con enrollment activo en la cohorte de la leccion pueden leer
CREATE POLICY "Enrolled students can read transcripts"
  ON lesson_transcripts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lessons l
      JOIN program_modules pm ON pm.id = l.module_id
      JOIN cohorts c ON c.program_id = pm.program_id
      JOIN enrollments e ON e.cohort_id = c.id
      WHERE l.id = lesson_transcripts.lesson_id
        AND e.student_id = auth.uid()
        AND e.status = 'active'
    )
  );

-- Admins y ops pueden leer y escribir
CREATE POLICY "Admin/ops full access to transcripts"
  ON lesson_transcripts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'ops')
    )
  );
```

**Tipo TypeScript:**

```typescript
// lib/classroom/types.ts
export type LessonTranscript = {
  id: string;
  lesson_id: string;
  language: string;
  content_vtt: string;
  segment_count: number | null;
  source: 'mux' | 'manual' | 'whisper';
  created_at: string;
  updated_at: string;
};

export type TranscriptSegment = {
  index: number;       // posicion ordinal en el VTT
  start: number;       // segundos (float)
  end: number;         // segundos (float)
  text: string;        // texto del cue, sin tags HTML
};
```

### 6.2 Parser WebVTT

**Archivo:** `lib/classroom/parse-vtt.ts`

Responsabilidad: recibir el string crudo del WebVTT y devolver `TranscriptSegment[]`.

```typescript
export function parseVTT(raw: string): TranscriptSegment[] {
  // 1. Dividir por bloques vacios (double newline)
  // 2. Ignorar header "WEBVTT" y metadata
  // 3. Para cada cue:
  //    a. Extraer timestamps "HH:MM:SS.mmm --> HH:MM:SS.mmm"
  //    b. Convertir a segundos (float)
  //    c. Extraer texto (quitar tags <c>, <b>, etc.)
  //    d. Construir TranscriptSegment con index incremental
  // 4. Retornar array ordenado por start
}

function parseTimestamp(ts: string): number {
  // "00:01:23.456" -> 83.456
  const parts = ts.split(':');
  // Soportar tanto HH:MM:SS.mmm como MM:SS.mmm
}
```

**Nota de implementacion:** El parsing se hace en el cliente (es texto plano, tipicamente <50KB para 45 minutos de video). No se necesita Web Worker ni procesamiento server-side.

### 6.3 Componentes

#### `TranscriptPanel`

**Archivo:** `components/classroom/transcript-panel.tsx`

```
Props:
  segments: TranscriptSegment[]
  currentTime: number              // tiempo actual del video en segundos
  onSeek: (time: number) => void   // callback para cambiar posicion del video
```

**Estructura interna:**

```
TranscriptPanel
├── SearchInput (input de busqueda con debounce)
├── SegmentList (contenedor scrollable)
│   └── SegmentRow[] (fila por cada segmento)
│       ├── Timestamp (mm:ss, clickeable)
│       ├── SegmentText (texto, con highlight si hay busqueda)
│       └── CopyButton (visible en hover / siempre en mobile)
└── EmptyState (cuando no hay resultados de busqueda)
```

**Logica de segmento activo:**

```typescript
// El segmento activo es aquel donde: segment.start <= currentTime < segment.end
const activeIndex = segments.findIndex(
  (s) => currentTime >= s.start && currentTime < s.end
);
```

**Logica de auto-scroll:**

```typescript
// Ref al segmento activo
const activeRef = useRef<HTMLButtonElement>(null);

// Auto-scroll solo si el usuario no hizo scroll manual reciente
const [userScrolled, setUserScrolled] = useState(false);
const userScrollTimer = useRef<ReturnType<typeof setTimeout>>();

// En el onScroll del contenedor:
const onContainerScroll = () => {
  setUserScrolled(true);
  clearTimeout(userScrollTimer.current);
  userScrollTimer.current = setTimeout(() => setUserScrolled(false), 5000);
};

// Cuando cambia activeIndex y no hay scroll manual:
useEffect(() => {
  if (!userScrolled && activeRef.current) {
    activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}, [activeIndex, userScrolled]);
```

### 6.4 Integracion con VideoPlayer

El `VideoPlayer` actual (en `components/classroom/video-player.tsx`) maneja `currentTime` internamente via el listener `timeupdate` del `<video>`. Para exponer este valor al componente padre (la pagina de leccion), se necesita:

**Opcion elegida: callback prop `onTimeUpdate`**

```typescript
// VideoPlayerProps (extender las props existentes)
type VideoPlayerProps = {
  // ... props existentes ...
  onTimeUpdate?: (currentTime: number) => void;
};
```

Dentro del efecto que escucha `timeupdate` (linea 352-360 del video-player.tsx actual), invocar el callback:

```typescript
const onTimeUpdate = () => {
  const t = video.currentTime;
  setCurrentTime(t);
  handleTimeUpdate(t);
  onTimeUpdate?.(t);  // <-- NUEVO: propagar al padre
  // ... buffer logic ...
};
```

**En la pagina de leccion** (`app/(classroom)/classroom/[cohortId]/[moduleId]/[lessonId]/page.tsx`):

La pagina se convierte en un Client Component wrapper que:
1. Recibe datos server-side via props (o un RSC con boundary).
2. Mantiene `currentTime` en estado local.
3. Pasa `currentTime` al `TranscriptPanel`.
4. Pasa un `onSeek` callback que invoca `videoRef.current.currentTime = t` (expuesto via `VideoPlayer`).

**Alternativa descartada:** Context API. Razon: agrega complejidad innecesaria para una relacion padre-hijo directa. El `TranscriptPanel` y el `VideoPlayer` son hermanos dentro de la misma pagina — elevar estado al padre es la solucion idomiatica de React.

**Nota sobre seek:** Para que `TranscriptPanel` pueda hacer seek, `VideoPlayer` necesita exponer un metodo o aceptar un prop `seekTo`:

```typescript
// Opcion A: ref imperativa (useImperativeHandle)
export type VideoPlayerHandle = {
  seekTo: (time: number) => void;
};

// Opcion B: prop controlada
type VideoPlayerProps = {
  // ...
  pendingSeek?: number | null;
  onSeekComplete?: () => void;
};
```

**Recomendacion:** Opcion A (`useImperativeHandle`) es mas limpia. El padre obtiene un ref al `VideoPlayer` y llama `videoPlayerRef.current.seekTo(time)` cuando el alumno hace click en un segmento.

### 6.5 Data flow completo

```
[Supabase: lesson_transcripts]
        |
        | (1) Server Component: query en pagina de leccion
        v
[content_vtt: string]
        |
        | (2) Client Component: parseVTT(content_vtt)
        v
[TranscriptSegment[]]
        |
        | (3) Pasar a TranscriptPanel como prop
        v
[TranscriptPanel]
   |          ^
   |          | currentTime (via onTimeUpdate callback)
   |          |
   v          |
[onSeek] --> [VideoPlayer.seekTo(time)]
```

### 6.6 Integracion en la UI de la leccion

La pagina de leccion actual tiene esta estructura debajo del video:

```
Video
Title block
Recursos (si hay)
Prev / Next navigation
```

**Cambio propuesto:**

```
Video
Title block
[Tab bar: "Transcripcion" | "Recursos ({count})"]
  - Tab Transcripcion: TranscriptPanel (scrollable, max-height fijo)
  - Tab Recursos: lista de recursos actual
Prev / Next navigation
```

**Detalles del tab bar:**
- Usa el mismo estilo de la tab "Recursos" actual (borde inferior violet para tab activa).
- La tab "Transcripcion" solo aparece si hay transcripcion disponible.
- La tab "Recursos" solo aparece si hay recursos. Si solo hay uno de los dos, se muestra directamente sin tabs.
- Si hay ambos, "Transcripcion" es la tab activa por defecto (es la funcionalidad principal).

**Altura del panel:**
- Desktop: `max-h-[480px]` con overflow-y auto (aproximadamente 10-12 segmentos visibles).
- Mobile: `max-h-[320px]`.

## 7. Responsive

| Breakpoint | Comportamiento |
|---|---|
| **Desktop** (lg+) | Video a la izquierda, sidebar playlist a la derecha. Tabs (Transcripcion/Recursos) debajo del video. TranscriptPanel con `max-h-[480px]`. |
| **Tablet** (md) | Mismo layout sin sidebar (playlist oculta). TranscriptPanel con `max-h-[400px]`. |
| **Mobile** (<md) | Video full-width. Debajo: titulo, luego tabs. TranscriptPanel colapsado por defecto con boton "Ver transcripcion" para expandir. `max-h-[320px]` cuando expandido. Boton de copiar visible siempre (no hover). |

## 8. Rendimiento

### 8.1 Tamano tipico del contenido

Para un video de 45 minutos con segmentos de ~6 segundos promedio:
- ~450 segmentos.
- ~15-25KB de texto WebVTT crudo.
- Parsing: <5ms en dispositivos modernos.

### 8.2 Estrategia de renderizado

- **Para <=500 segmentos** (caso comun): renderizar todos los segmentos. React 19 es suficientemente rapido para manejar ~500 `<button>` con texto.
- **Para >500 segmentos** (caso excepcional, videos de >50 min con segmentos cortos): virtualizar con `@tanstack/react-virtual`. Solo renderizar los segmentos visibles en el viewport del panel.
- **Deteccion automatica:** el componente verifica `segments.length > 500` y activa virtualizacion condicionalmente.

### 8.3 Optimizacion del currentTime

El evento `timeupdate` del `<video>` dispara ~4 veces por segundo. Para evitar re-renders innecesarios en el `TranscriptPanel`:

- El `activeIndex` se computa con `useMemo` basado en `currentTime`.
- Solo se re-renderiza `TranscriptPanel` cuando `activeIndex` cambia, no en cada `timeupdate`.
- Implementar con un ref para `currentTime` y un `useState` solo para `activeIndex`:

```typescript
const currentTimeRef = useRef(0);
const [activeIndex, setActiveIndex] = useState(-1);

// En el callback onTimeUpdate:
const handleVideoTimeUpdate = useCallback((time: number) => {
  currentTimeRef.current = time;
  const newIndex = segments.findIndex(
    (s) => time >= s.start && time < s.end
  );
  setActiveIndex((prev) => prev !== newIndex ? newIndex : prev);
}, [segments]);
```

Esto reduce los re-renders de ~4/segundo a ~1 cada 6 segundos (cuando cambia de segmento).

### 8.4 Busqueda

- Debounce de 200ms en el input de busqueda.
- Normalizacion de texto (quitar acentos) con `String.prototype.normalize('NFD').replace(/[̀-ͯ]/g, '')`.
- Busqueda lineal sobre el array de segmentos (para 500 elementos, <1ms).

## 9. Accesibilidad

| Aspecto | Implementacion |
|---|---|
| **Semantica** | El panel es un `<section aria-label="Transcripcion del video">`. Cada segmento es un `<button>`. |
| **Segmento activo** | `aria-current="true"` en el segmento que corresponde al tiempo actual del video. |
| **Navegacion por teclado** | `ArrowDown` / `ArrowUp` mueven foco entre segmentos. `Enter` ejecuta seek. `Escape` regresa foco al input de busqueda. |
| **Screen reader** | Cada segmento tiene `aria-label="Ir a [mm:ss], [texto del segmento truncado a 80 chars]"`. |
| **Busqueda** | El input tiene `role="searchbox"`, `aria-label="Buscar en la transcripcion"`. Los resultados se anuncian via `aria-live="polite"`: "[N] resultados encontrados". |
| **Contraste** | El texto de la transcripcion usa `text-ca-ink` sobre `bg-ca-surface` (ratio >7:1). La marca de tiempo usa `text-ca-violet` (ratio >4.5:1). |
| **Reduced motion** | Si `prefers-reduced-motion` esta activo, el `scrollIntoView` usa `behavior: 'instant'` en lugar de `'smooth'`. |

## 10. Flujos principales

### 10.1 Alumno ve la transcripcion mientras mira un video

```
Alumno -> Lesson page -> Video se reproduce
  -> Tab "Transcripcion" activa por defecto (si hay transcript)
  -> Panel muestra todos los segmentos
  -> Mientras el video avanza, el segmento activo se destaca (lime border + bold)
  -> El panel se auto-desplaza para mantener el segmento activo visible
  -> Alumno lee en sincronizacion con el audio
```

### 10.2 Alumno busca un tema especifico

```
Alumno -> Escribe "cierre de ventas" en input de busqueda
  -> Despues de 200ms, los segmentos se filtran
  -> Solo se muestran los segmentos que contienen "cierre de ventas"
  -> El texto coincidente se resalta en amarillo
  -> Alumno ve 3 resultados
  -> Hace click en el segundo resultado
  -> Video salta al timestamp de ese segmento
  -> Alumno limpia la busqueda para volver a la vista completa
```

### 10.3 Alumno copia un fragmento

```
Alumno -> Hace hover sobre un segmento
  -> Aparece icono de clipboard
  -> Click en el icono
  -> Texto del segmento se copia al portapapeles
  -> Icono cambia a check por 1.5s
  -> Alumno pega en sus notas
```

## 11. Wireframe textual

### 11.1 Desktop — Transcripcion activa

```
┌─────────────────────────────────────────────────────────────────────┐
│  Lesson page                                                        │
├────────────────────────────────────────┬────────────────────────────┤
│                                        │  Sidebar playlist          │
│           VIDEO PLAYER                 │  ● Lecc 01                │
│         (16:9, rounded)                │  ▶ Lecc 02 (actual)       │
│                                        │  ○ Lecc 03                │
│  ── progress strip ──────────────────  │                            │
│                                        │                            │
│  Lec. 02 · Tecnicas de cierre          │                            │
│  45 min · 65% visto · En progreso      │                            │
│                                        │                            │
│  ┌──────────────────────────────────┐  │                            │
│  │ Transcripcion (450) │ Recursos (3)│ │                            │
│  │ ━━━━━━━━━━━━━━━━━━━ │            │  │                            │
│  ├──────────────────────────────────┤  │                            │
│  │ 🔍 Buscar en transcripcion...    │  │                            │
│  ├──────────────────────────────────┤  │                            │
│  │  02:15  Entonces lo primero que  │  │                            │
│  │         debemos entender es...   │  │                            │
│  │                                  │  │                            │
│  │▌ 02:21  El cierre de ventas no  │  │                            │
│  │▌        es una tecnica, es un   │  │  ◄── segmento activo       │
│  │▌        proceso completo de...  │  │      (lime border + bold)  │
│  │                                  │  │                            │
│  │  02:28  Por eso les digo siempre│  │                            │
│  │         que la preparacion...    │  │                            │
│  │                                  │  │                            │
│  │  02:34  Vamos a ver tres        │  │                            │
│  │         ejemplos concretos...   [📋]│ ◄── copy button on hover  │
│  │                                  │  │                            │
│  └──────────────────────────────────┘  │                            │
│                                        │                            │
│  ← Anterior          Siguiente →       │                            │
└────────────────────────────────────────┴────────────────────────────┘
```

### 11.2 Mobile — Transcripcion colapsada

```
┌────────────────────────┐
│    VIDEO PLAYER        │
│    (full-width)        │
│                        │
│  Lec. 02 · 45 min     │
│  Tecnicas de cierre    │
│                        │
│  ┌──────────────────┐  │
│  │ Transcripcion    │  │
│  │ ▼ Ver (450 seg.) │  │   ◄── colapsado por defecto
│  └──────────────────┘  │
│                        │
│  Recursos (3)          │
│  📄 Guia de cierre.pdf │
└────────────────────────┘
```

### 11.3 Mobile — Transcripcion expandida

```
┌────────────────────────┐
│  ┌──────────────────┐  │
│  │ Transcripcion    │  │
│  │ ▲ Ocultar        │  │
│  ├──────────────────┤  │
│  │🔍 Buscar...      │  │
│  ├──────────────────┤  │
│  │ 02:15 Entonces.. │  │
│  │                  │  │
│  │▌02:21 El cierre.│  │   ◄── max-h-[320px]
│  │▌ (activo)      📋│  │   ◄── copy siempre visible
│  │                  │  │
│  │ 02:28 Por eso.. │  │
│  └──────────────────┘  │
└────────────────────────┘
```

## 12. Dependencias y prerequisitos

| Dependencia | Estado | Bloqueante |
|---|---|---|
| Mux auto-generated transcripts (WebVTT) | Disponible (Mux lo genera automaticamente para assets con audio) | Si |
| Tabla `lesson_transcripts` en Supabase | Pendiente (migracion SQL) | Si |
| RLS policies para `lesson_transcripts` | Pendiente (en la migracion) | Si |
| Script para descargar VTT de Mux y cachear en Supabase | Pendiente | Si |
| `VideoPlayer` expone `onTimeUpdate` y `seekTo` | Pendiente (modificacion menor) | Si |
| `@tanstack/react-virtual` (solo si >500 segmentos) | No instalado, instalar condicionalmente | No |

## 13. Fases de implementacion

### Fase 1 — Fundacion (Sprint actual)

1. **Migracion SQL:** crear tabla `lesson_transcripts` + RLS policies.
2. **Parser:** `lib/classroom/parse-vtt.ts` — parsear WebVTT a `TranscriptSegment[]`.
3. **Script ingesta:** `scripts/fetch-mux-transcripts.ts` — descargar VTT de Mux API y guardar en `lesson_transcripts`.
4. **Refactor VideoPlayer:** agregar prop `onTimeUpdate` + `useImperativeHandle` para exponer `seekTo`.
5. **Componente `TranscriptPanel`:** renderizado basico con segmentos, highlighting del segmento activo, click-to-seek.
6. **Integracion en pagina de leccion:** tabs Transcripcion/Recursos, client component wrapper.

### Fase 2 — Refinamiento (Sprint siguiente)

7. **Busqueda:** input con debounce, filtrado, highlight de coincidencias.
8. **Copia:** boton de copiar al portapapeles con feedback visual.
9. **Auto-scroll inteligente:** pausa de auto-scroll cuando el usuario scrollea manualmente.
10. **Responsive mobile:** colapso por defecto, boton expandir/ocultar.
11. **Accesibilidad:** navegacion por teclado, ARIA attributes, reduced motion.

### Fase 3 — Optimizacion (Futuro)

12. **Virtualizacion:** activar `@tanstack/react-virtual` para transcripciones >500 segmentos.
13. **Analytics:** eventos `transcript_seek`, `transcript_search`, `transcript_copy`.
14. **Webhook automatico:** cuando Mux termina de generar un transcript, un webhook descarga y cachea automaticamente en `lesson_transcripts`.

## 14. Preguntas abiertas

| # | Pregunta | Impacto | Decisor |
|---|---|---|---|
| 1 | Los transcripts de Mux en espanol tienen calidad suficiente, o se necesita Whisper como fallback? | Calidad del contenido, costo | Ops + Dev |
| 2 | Se necesita que el admin pueda editar/corregir transcripciones desde el panel de gestion? | UI admin adicional, scope | Producto |
| 3 | Cuantos segmentos tipicos genera Mux para un video de 45 min? (validar assumption de ~450) | Decision de virtualizacion | Dev (verificar con asset real) |
| 4 | El alumno deberia poder descargar la transcripcion como texto plano? | UX, scope | Producto |
| 5 | Se quiere tracking de cuales segmentos son mas clickeados para detectar temas de mayor interes? | Analytics, schema adicional | Producto + Data |
