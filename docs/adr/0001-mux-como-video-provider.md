# ADR-0001: Mux como video provider del Classroom

- **Status:** accepted
- **Date:** 2026-05-26
- **Deciders:** Equipo técnico Capital Academy
- **Tags:** video, infra, classroom

## Contexto

Capital Academy necesita un sistema de video para el módulo Classroom donde los alumnos consumen clases grabadas (VOD). Los requisitos son:

1. **Upload manual** por ops/admin desde un dashboard interno.
2. **Playback adaptativo** (ABR) — alumnos con conexiones variables en Chile y LatAm.
3. **Tracking de progreso** — saber cuánto vio cada alumno (posición, % completado).
4. **Seguridad** — los videos no deben ser descargables ni compartibles fuera de la plataforma.
5. **Escalabilidad** — hoy son ~20-25 alumnos por cohorte, pero hay múltiples programas planificados (Diplomado, Liderazgo, Ruta Inmobiliaria, Masterclass).
6. **Stack compatible** — Next.js 16 + React 19 + Supabase.

La decisión de grabar TODO (clases presenciales, online, masterclass) fue tomada en la reunión del 20 de mayo 2026, lo que significa volumen creciente de contenido.

## Decisión

Usar **Mux** como video provider para upload, transcoding, delivery y playback.

- `@mux/mux-node@14.x` para server-side (upload, asset management, signed URLs).
- `@mux/mux-player-react@3.x` para el reproductor en el cliente.
- Mux Data (incluido) para métricas de video quality y engagement.
- Signed playback URLs para proteger el contenido.

## Opciones consideradas

### Opción A — Mux (elegida)
- **Pros:**
  - SDK ya instalado y cliente configurado (`lib/mux/client.ts`).
  - Player React oficial con soporte nativo para eventos de progreso (`timeupdate`, `ended`).
  - Transcoding automático con ABR (HLS).
  - Signed URLs y DRM básico (domain restriction).
  - Mux Data integrado: métricas de buffering, startup time, engagement sin código extra.
  - Pricing predecible: por minuto de video almacenado + minuto de streaming.
  - Direct uploads desde el browser (no pasa por nuestro server).
- **Contras:**
  - Costo por volumen (vs self-hosted).
  - Vendor lock-in en formato de assets (mitigable: siempre tenemos el archivo original).
  - No incluye DRM Widevine/FairPlay en el plan base (no requerido para MVP).

### Opción B — Supabase Storage + video.js
- **Pros:**
  - Sin costo adicional de video provider.
  - Control total del almacenamiento.
- **Contras:**
  - Sin transcoding: hay que servir el archivo original (sin ABR).
  - Sin CDN de video optimizado.
  - Playback inconsistente en browsers/dispositivos.
  - Todo el tracking de progreso es manual sin métricas de calidad.
  - Costos de bandwidth de Supabase escalan peor que Mux para video.

### Opción C — Cloudflare Stream
- **Pros:**
  - Pricing competitivo.
  - Buen CDN global.
- **Contras:**
  - SDK menos maduro para React.
  - Sin player oficial React con eventos granulares.
  - Menos ecosistema de integraciones educativas.
  - No hay SDK instalado ni configurado.

## Consecuencias

### Positivas
- Cero infra de video que mantener.
- Playback de alta calidad desde día 1.
- Eventos del player (`timeupdate`, `ended`, `seeked`) permiten tracking granular del lado del cliente.
- Direct uploads reducen carga en nuestro server.
- Mux Data da visibilidad de calidad de experiencia sin desarrollo adicional.

### Negativas
- Costo mensual proporcional al volumen de contenido.
- Dependencia en un tercero para un componente core del producto.

### Riesgos
- Si Mux cambia pricing agresivamente, migrar a otra plataforma requiere re-upload de assets (mitigación: conservar archivos originales en storage propio o Drive).
- Latencia de transcoding (~2-5 min por video) puede confundir a ops si esperan disponibilidad inmediata post-upload.

## Referencias

- Mux Direct Uploads: https://docs.mux.com/guides/direct-upload
- Mux Player React: https://docs.mux.com/guides/mux-player-react
- Mux Data: https://docs.mux.com/guides/data/monitor-mux-player
- Mux Signed URLs: https://docs.mux.com/guides/secure-video-playback
