# PRD — Subtitulos Auto-Generados y Transcripcion

> Product Requirements Document para la generacion automatica de subtitulos en espanol y almacenamiento de transcripciones.

- **Autor:** Equipo Capital Academy
- **Fecha:** 2026-05-27
- **Estado:** Draft
- **Dependencias:** [PRD-Classroom](PRD-classroom.md), [ADR-0001 Mux](adr/0001-mux-como-video-provider.md)
- **Pregunta abierta resuelta:** PRD-Classroom #1 ("Se necesita subtitulos/captions?") — SI

---

## 1. Problema

Los videos del Classroom de Capital Academy se reproducen sin subtitulos. Esto genera tres problemas concretos:

1. **Accesibilidad.** Alumnos con discapacidad auditiva o que consumen contenido en ambientes ruidosos no pueden seguir la clase.
2. **Comprension.** Los programas ejecutivos contienen terminologia tecnica del sector inmobiliario chileno. Los subtitulos refuerzan la retencion y comprension, especialmente en sesiones largas (+45 min).
3. **Perdida de valor del contenido.** Sin transcripcion en texto, el contenido de video no es buscable, no alimenta features de IA (resumen, quiz, busqueda semantica), y no se puede reutilizar para blog, SEO ni material complementario.

## 2. Objetivo

Habilitar subtitulos automaticos en espanol en **todos** los videos del Classroom y almacenar la transcripcion en texto plano para uso inmediato y para alimentar features de IA downstream.

### Resultados esperados

| Resultado | Medida |
|---|---|
| Todo video nuevo tiene subtitulos ES disponibles automaticamente | 100% de assets creados despues del deploy incluyen track de texto |
| Los videos existentes reciben subtitulos retroactivamente | 100% de assets existentes con captions en un plazo de 48h post-deploy |
| La transcripcion se almacena en Supabase | Toda leccion con video tiene registro en `lesson_transcripts` |
| El alumno puede activar/desactivar CC desde el reproductor | Toggle CC visible en la barra de controles |

## 3. Scope

### 3.1 En scope

1. Modificar la creacion de assets en Mux para incluir `generated_subtitles` con idioma espanol.
2. Almacenar el `track_id` del text track en la tabla `lessons`.
3. Agregar boton CC toggle en el video player custom (`components/classroom/video-player.tsx`).
4. Crear endpoint API para obtener la transcripcion en texto desde Mux y cachearla en Supabase.
5. Crear tabla `lesson_transcripts` para persistir la transcripcion.
6. Script de backfill para generar subtitulos en assets existentes.
7. Handler de webhook para `video.asset.track.ready`.

### 3.2 Fuera de scope

- Traduccion a otros idiomas (solo espanol por ahora).
- Edicion manual de subtitulos por admin.
- UI de visualizacion de transcripcion inline (debajo del video) — se implementa en un PRD posterior.
- Busqueda semantica sobre transcripciones — este PRD solo almacena el texto.
- Subtitulos en sesiones en vivo (el Classroom solo usa VOD).

## 4. Contexto tecnico: como funciona en Mux

Mux utiliza Whisper (OpenAI) para generar subtitulos automaticos. Es una feature **gratuita** incluida en todos los planes.

### 4.1 Generacion en assets nuevos

Cuando creas un upload o asset, puedes pasar `generated_subtitles` dentro del primer objeto de `inputs` (para direct uploads, el primer input omite `url`):

```typescript
// En new_asset_settings de mux.video.uploads.create()
{
  inputs: [
    {
      generated_subtitles: [
        {
          language_code: "es",
          name: "Espanol (auto)",
        },
      ],
    },
  ],
  playback_policy: ["signed"],
  encoding_tier: "baseline",
}
```

> **Nota importante:** `generated_subtitles` NO va en el top-level de `new_asset_settings`. Va dentro de `inputs[0]`. Para direct uploads, el primer input no lleva `url` — Mux entiende que el archivo viene del upload.

Despues del ingest, el track de subtitulos queda en estado `preparing`. Cuando esta listo, Mux envia el webhook `video.asset.track.ready` con el `track_id` y `asset_id`.

### 4.2 Generacion retroactiva (backfill)

Para assets que ya existen sin subtitulos, el SDK expone:

```typescript
await mux.video.assets.generateSubtitles(
  assetId,
  audioTrackId, // el track de audio del asset — tipo "audio", status "ready"
  {
    generated_subtitles: [
      { language_code: "es", name: "Espanol (auto)" },
    ],
  },
);
```

Se necesita el `audioTrackId`, que se obtiene de `asset.tracks` filtrando por `type === "audio"`.

### 4.3 Acceso a la transcripcion

Una vez que el text track esta `ready`, Mux expone:

| Formato | URL |
|---|---|
| Texto plano | `https://stream.mux.com/{PLAYBACK_ID}/text/{TRACK_ID}.txt` |
| WebVTT (con timestamps) | `https://stream.mux.com/{PLAYBACK_ID}/text/{TRACK_ID}.vtt` |

Para playback policies `signed`, estas URLs requieren un JWT de tipo `video` con el playback ID.

### 4.4 Subtitulos en HLS

Cuando el asset tiene un text track, el manifiesto HLS (`{PLAYBACK_ID}.m3u8`) lo incluye automaticamente como un subtitle track. hls.js lo expone via `hls.subtitleTracks` y se puede activar/desactivar con `hls.subtitleTrack = index` (o `-1` para desactivar).

En Safari (HLS nativo), el `<video>` element expone los text tracks via `video.textTracks`.

## 5. Modelo de datos

### 5.1 Columna nueva en `lessons`

```sql
ALTER TABLE lessons
  ADD COLUMN mux_track_id TEXT DEFAULT NULL;

COMMENT ON COLUMN lessons.mux_track_id IS
  'ID del text track de subtitulos auto-generados en Mux. Se popula via webhook video.asset.track.ready.';
```

### 5.2 Tabla nueva: `lesson_transcripts`

```sql
CREATE TABLE lesson_transcripts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  language    TEXT NOT NULL DEFAULT 'es',
  content_text TEXT,          -- transcripcion en texto plano (sin timestamps)
  content_vtt  TEXT,          -- transcripcion WebVTT completa (con timestamps)
  generated_at TIMESTAMPTZ,   -- cuando Mux genero el track
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- cuando nosotros lo descargamos
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_lesson_transcripts_lesson_lang UNIQUE (lesson_id, language)
);

-- RLS: alumnos con enrollment activo pueden leer, admin/ops pueden todo
ALTER TABLE lesson_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enrolled students can read transcripts"
  ON lesson_transcripts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lessons l
      JOIN program_modules pm ON pm.id = l.module_id
      JOIN cohorts c ON c.program_id = pm.program_id
      JOIN enrollments e ON e.cohort_id = c.id
      WHERE l.id = lesson_transcripts.lesson_id
        AND e.user_id = auth.uid()
        AND e.status = 'active'
    )
  );

CREATE POLICY "Admin/ops can manage transcripts"
  ON lesson_transcripts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'ops')
    )
  );
```

### 5.3 Indice

```sql
CREATE INDEX idx_lesson_transcripts_lesson_id
  ON lesson_transcripts(lesson_id);
```

## 6. Cambios en API routes

### 6.1 Modificar `POST /api/admin/mux/upload` (asset creation)

**Archivo:** `app/api/admin/mux/upload/route.ts`

**Cambio:** Agregar `inputs` con `generated_subtitles` en `new_asset_settings`.

```typescript
// ANTES
const upload = await mux.video.uploads.create({
  new_asset_settings: {
    playback_policy: [
      process.env.MUX_SIGNING_KEY_ID ? "signed" : "public",
    ],
    encoding_tier: "baseline",
  },
  cors_origin: req.headers.get("origin") ?? "*",
});

// DESPUES
const upload = await mux.video.uploads.create({
  new_asset_settings: {
    inputs: [
      {
        generated_subtitles: [
          {
            language_code: "es",
            name: "Espanol (auto)",
          },
        ],
      },
    ],
    playback_policy: [
      process.env.MUX_SIGNING_KEY_ID ? "signed" : "public",
    ],
    encoding_tier: "baseline",
  },
  cors_origin: req.headers.get("origin") ?? "*",
});
```

### 6.2 Modificar `POST /api/webhooks/mux` (webhook handler)

**Archivo:** `app/api/webhooks/mux/route.ts`

**Cambio:** Agregar handler para el evento `video.asset.track.ready`.

Cuando llega el evento:
1. Extraer `id` (track ID), `asset_id`, `type`, `text_source`, `language_code` del payload.
2. Filtrar: solo procesar tracks donde `type === "text"` y `text_source === "generated_vod"`.
3. Buscar la leccion por `mux_asset_id`.
4. Actualizar `lessons.mux_track_id` con el track ID.
5. Obtener la transcripcion (texto plano y VTT) desde las URLs de Mux.
6. Insertar/upsert en `lesson_transcripts`.

```typescript
if (event.type === "video.asset.track.ready") {
  const { id: trackId, asset_id, type, text_source, language_code } = event.data;

  // Solo procesar text tracks auto-generados
  if (type !== "text" || text_source !== "generated_vod") {
    return NextResponse.json({ received: true });
  }

  const supabase = createAdminClient();

  // Buscar leccion por asset_id
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, mux_playback_id")
    .eq("mux_asset_id", asset_id)
    .single();

  if (!lesson) {
    return NextResponse.json({ received: true });
  }

  // Guardar track ID en la leccion
  await supabase
    .from("lessons")
    .update({ mux_track_id: trackId })
    .eq("id", lesson.id);

  // Fetch transcript desde Mux
  const playbackId = lesson.mux_playback_id;
  if (playbackId && trackId) {
    const [txtRes, vttRes] = await Promise.all([
      fetch(`https://stream.mux.com/${playbackId}/text/${trackId}.txt`),
      fetch(`https://stream.mux.com/${playbackId}/text/${trackId}.vtt`),
    ]);

    const contentText = txtRes.ok ? await txtRes.text() : null;
    const contentVtt = vttRes.ok ? await vttRes.text() : null;

    await supabase.from("lesson_transcripts").upsert(
      {
        lesson_id: lesson.id,
        language: language_code ?? "es",
        content_text: contentText,
        content_vtt: contentVtt,
        generated_at: new Date().toISOString(),
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id,language" },
    );
  }
}
```

> **Nota sobre signed playback:** Si el playback policy es `signed`, las URLs `stream.mux.com/{PLAYBACK_ID}/text/{TRACK_ID}.txt` requieren un token JWT. El webhook handler corre server-side, asi que tiene acceso a la signing key. Generar el token con `lib/mux/signing.ts` existente y pasarlo como query param: `?token={JWT}`.

### 6.3 Nuevo endpoint: `GET /api/classroom/transcript`

**Archivo:** `app/api/classroom/transcript/route.ts`

**Proposito:** Endpoint para que el frontend (o features futuras de IA) obtengan la transcripcion de una leccion.

**Query params:** `lessonId` (UUID)

**Flujo:**
1. Verificar autenticacion.
2. Verificar enrollment del usuario en la cohorte de la leccion.
3. Buscar en `lesson_transcripts` por `lesson_id`.
4. Si existe, retornar `{ text, vtt, language, generatedAt }`.
5. Si no existe pero la leccion tiene `mux_track_id`, hacer fetch desde Mux, cachear en `lesson_transcripts`, y retornar.
6. Si no existe y no hay `mux_track_id`, retornar `404`.

**Response:**

```json
{
  "text": "Bienvenidos a la masterclass de hoy...",
  "vtt": "WEBVTT\n\n00:00:01.000 --> 00:00:04.500\nBienvenidos a la masterclass de hoy...",
  "language": "es",
  "generatedAt": "2026-05-27T14:00:00Z"
}
```

## 7. Cambios en el video player

### 7.1 Resumen

El video player custom (`components/classroom/video-player.tsx`) ya usa hls.js para playback HLS. Los subtitulos auto-generados por Mux se incluyen automaticamente en el manifiesto HLS como subtitle tracks.

### 7.2 Nueva prop

```typescript
type VideoPlayerProps = {
  // ... props existentes
  hasCaptions?: boolean; // true si la leccion tiene mux_track_id
};
```

### 7.3 Estado nuevo

```typescript
const [ccEnabled, setCcEnabled] = useState(false);
```

### 7.4 Logica de activacion de subtitulos

**Con hls.js (Chrome, Firefox, Edge):**

```typescript
// Cuando hls.js carga el manifiesto, detectar subtitle tracks
hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
  // Los tracks estan disponibles en hls.subtitleTracks
  // Cada track tiene: id, name, lang, type
});

// Para activar:
hls.subtitleTrack = 0;          // index del track de subtitulos
hls.subtitleDisplay = true;

// Para desactivar:
hls.subtitleTrack = -1;
```

**Con HLS nativo (Safari):**

```typescript
const video = videoRef.current;
const tracks = video.textTracks;
for (let i = 0; i < tracks.length; i++) {
  if (tracks[i].kind === "subtitles" || tracks[i].kind === "captions") {
    tracks[i].mode = ccEnabled ? "showing" : "hidden";
  }
}
```

### 7.5 Boton CC en la barra de controles

Ubicacion: en el grupo `RIGHT` de controles, entre el boton de speed y el de quality.

```
[ Speed ] [ CC ] [ Quality ] [ PiP ] [ Fullscreen ]
```

Comportamiento:
- Si `hasCaptions` es `false`, el boton no se renderiza.
- Estado ON: borde lime, icono blanco, indicador lime pulsante.
- Estado OFF: estilo ghost como los demas botones.
- Click: toggle `ccEnabled`.
- Keyboard shortcut: tecla `c`.

### 7.6 Icono CC

Nuevo icono `"cc"` en la funcion `VPIcon`:

```typescript
case "cc":
  return (
    <svg {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <text
        x="12" y="15"
        textAnchor="middle"
        fontSize="9"
        fontWeight="bold"
        fill={color}
        stroke="none"
      >
        CC
      </text>
    </svg>
  );
```

### 7.7 Persistencia de preferencia CC

Guardar la preferencia del usuario en `localStorage` con la key `ca-cc-enabled`. Leer al montar el componente.

```typescript
const [ccEnabled, setCcEnabled] = useState(() => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("ca-cc-enabled") === "true";
});

useEffect(() => {
  localStorage.setItem("ca-cc-enabled", String(ccEnabled));
}, [ccEnabled]);
```

## 8. Script de backfill para assets existentes

**Archivo:** `scripts/backfill-mux-subtitles.ts`

**Flujo:**

1. Consultar Supabase: todas las lecciones con `mux_asset_id` no nulo y `mux_track_id` nulo.
2. Para cada leccion:
   a. Obtener el asset de Mux: `mux.video.assets.retrieve(assetId)`.
   b. Verificar si ya tiene un text track de tipo `generated_vod`. Si si, guardar el track ID y la transcripcion.
   c. Si no tiene text track, obtener el audio track ID de `asset.tracks` (`type === "audio"`).
   d. Llamar a `mux.video.assets.generateSubtitles(assetId, audioTrackId, { generated_subtitles: [{ language_code: "es", name: "Espanol (auto)" }] })`.
   e. El webhook `video.asset.track.ready` se encarga del resto.
3. Rate limiting: maximo 3 requests concurrentes, 1 segundo entre batches (respetar limites de Mux API: 5 req/s).
4. Log con progreso: `[2/5] Generando subtitulos para "MasterClass Matamala" (asset: abc123)...`

**Ejecucion:**

```bash
npx tsx scripts/backfill-mux-subtitles.ts
```

## 9. Migracion de datos

### 9.1 Orden de ejecucion

1. **Migracion SQL:** Crear columna `lessons.mux_track_id` + tabla `lesson_transcripts` + RLS policies + indice.
2. **Deploy codigo:** Upload route modificado + webhook handler actualizado + endpoint de transcript + video player con CC.
3. **Backfill:** Ejecutar script para assets existentes.
4. **Verificacion:** Confirmar que todos los assets tienen track de texto via Mux dashboard o query.

### 9.2 Rollback

- La columna `mux_track_id` es nullable y no rompe nada si se queda en `NULL`.
- La tabla `lesson_transcripts` es nueva y no tiene dependencias.
- El video player muestra el boton CC solo si `hasCaptions` es `true` — no hay impacto si no hay tracks.
- Si hay que revertir, basta con hacer rollback del codigo. Los tracks de subtitulos en Mux pueden dejarse (no generan costo adicional) o eliminarse con `mux.video.assets.deleteTrack(assetId, trackId)`.

## 10. Consideraciones de seguridad

| Punto | Mitigacion |
|---|---|
| Las URLs de transcripcion en Mux son publicas si el playback policy es `public` | Nuestros assets usan `signed` — las URLs requieren JWT |
| El endpoint `/api/classroom/transcript` expone texto | Verificar enrollment antes de responder. RLS en Supabase como segunda capa |
| El webhook no valida firma criptografica (bug actual) | Fuera del scope de este PRD, pero se deberia implementar `mux.webhooks.verifySignature()` |
| Transcripciones cacheadas en Supabase podrian tener datos sensibles | Los programas son educativos, no hay PII en las clases. Bajo riesgo |

## 11. Metricas de exito

| Metrica | Target | Como se mide |
|---|---|---|
| Cobertura de subtitulos | 100% de lecciones con video | `SELECT COUNT(*) FROM lessons WHERE mux_asset_id IS NOT NULL AND mux_track_id IS NULL` = 0 |
| Adopcion de CC | >= 30% de sesiones de video usan CC al menos una vez | Evento analytics `cc_toggled` + `localStorage` check |
| Latencia de generacion | < 10 min desde asset ready hasta track ready | Delta entre webhooks `video.asset.ready` y `video.asset.track.ready` |
| Completitud de transcripciones | 100% de lecciones con track tienen transcript en DB | `lesson_transcripts` count vs `lessons` con `mux_track_id` |
| Tasa de error en generacion | < 5% | Webhook `video.asset.track.errored` count / total |

## 12. Fases de implementacion

### Fase 1 — Subtitulos en assets nuevos + backfill (3-4h)

- [ ] Migracion SQL: columna `mux_track_id` + tabla `lesson_transcripts`
- [ ] Modificar `POST /api/admin/mux/upload` para incluir `generated_subtitles`
- [ ] Agregar handler `video.asset.track.ready` en webhook
- [ ] Crear y ejecutar script de backfill
- [ ] Verificar que los 5 assets existentes reciben tracks

### Fase 2 — Video player con CC (2-3h)

- [ ] Agregar icono CC a `VPIcon`
- [ ] Agregar estado `ccEnabled` y logica de toggle en hls.js y Safari
- [ ] Agregar boton CC a la barra de controles
- [ ] Agregar shortcut `c` para toggle CC
- [ ] Persistir preferencia en `localStorage`
- [ ] Pasar prop `hasCaptions` desde la page de leccion

### Fase 3 — Endpoint de transcript + cache (1-2h)

- [ ] Crear `GET /api/classroom/transcript`
- [ ] Logica de cache: leer de `lesson_transcripts`, si no existe hacer fetch y cachear
- [ ] Tests manuales con signed playback

### Fase 4 — Verificacion y cleanup (1h)

- [ ] Verificar cobertura 100% de subtitulos en assets existentes
- [ ] Verificar que nuevos uploads generan subtitulos automaticamente
- [ ] Verificar CC toggle en Chrome, Safari y mobile
- [ ] Documentar en CHANGELOG

**Estimacion total:** 7-10 horas de desarrollo.

## 13. Dependencias y prerequisitos

| Dependencia | Estado | Bloqueante |
|---|---|---|
| Mux SDK `@mux/mux-node@14.x` con soporte para `generateSubtitles` | Verificado en types | No (ya instalado) |
| hls.js con soporte de subtitle tracks | Verificado: `hls.subtitleTracks` disponible | No (ya instalado) |
| Webhook endpoint recibiendo eventos de Mux | Existente: `app/api/webhooks/mux/route.ts` | No |
| Assets existentes en estado `ready` | 5 masterclasses subidas | No |
| Supabase migration access | Disponible via MCP | No |

## 14. Preguntas abiertas

| # | Pregunta | Impacto | Decisor |
|---|---|---|---|
| 1 | Queremos mostrar la transcripcion como texto debajo del video (tipo YouTube)? | UX, scope adicional | Producto |
| 2 | El admin deberia poder editar la transcripcion para corregir errores de Whisper? | UX, feature extra | Producto |
| 3 | Se habilita busqueda de texto dentro de la transcripcion? | Feature de IA downstream | Tech lead |
| 4 | Cuanto texto almacenar en `content_text`? Una masterclass de 1h puede generar ~8,000 palabras (~50KB) | Storage, costos marginales | Tech lead |
| 5 | Se activan los subtitulos por defecto o requieren click del alumno? | UX, accesibilidad | Direccion academica |

## 15. Referencias

- Mux Auto-Generated Captions: https://docs.mux.com/guides/add-autogenerated-captions-and-use-transcripts
- Mux Generate Subtitles API (retroactive): https://docs.mux.com/guides/add-autogenerated-captions-and-use-transcripts#retroactively-enable-auto-generated-captions
- hls.js Subtitle API: https://github.com/video-dev/hls.js/blob/master/docs/API.md#subtitle-tracks
- Mux SDK `@mux/mux-node@14.0.1` types: `node_modules/.pnpm/@mux+mux-node@14.0.1/node_modules/@mux/mux-node/resources/video/assets.d.ts`
- Video player component: `components/classroom/video-player.tsx`
- Upload API route: `app/api/admin/mux/upload/route.ts`
- Webhook handler: `app/api/webhooks/mux/route.ts`
