# Auditoría de Performance — Classroom (alumno)

**Fecha:** 2026-07-06
**Alcance:** superficie del alumno (`app/(classroom)/**`) — dashboard, lección/video, quiz, calendario, recursos, conversaciones, clase en vivo, certificado, guía, perfil.
**Método:** orquestación multi-agente read-only — 1 agente de medición (bundle real por ruta) + 5 auditores por dimensión (bundle/JS · RSC-fetching · render/jank · imágenes/media · red/caché). Sonnet en paralelo, síntesis por Opus.
**Objetivo del usuario:** "dejar toda la interfaz como una seda".

---

## TL;DR — los 5 que mueven la aguja

1. **Triple validación de sesión (`getUser`) por cada navegación** — proxy → layout → page, 3 round-trips secuenciales al Auth de Supabase ANTES de pintar, en TODA página del classroom. **Detectado por 3 agentes independientes.** Es la latencia base que se siente en cada clic. `cache()` de React mata 2 de 3; un header desde el proxy mata el tercero. *(impacto ALTO · esfuerzo S–M)*
2. **Jank durante el video**: el context de `currentTime` re-renderiza TODO el árbol de la lección cada ~400ms (incluido un consumidor que ni usa el valor). Compite con el propio video → micro-tirones. *(ALTO · S–M)*
3. **Avatares sin optimizar (hasta 2 MB)** servidos crudos en el sidebar de cada página + cada comentario. Causa raíz: el host de Supabase no está en `remotePatterns`, así que se esquivó el optimizador. *(ALTO · M)*
4. **La ruta más pesada es el detalle de un hilo** (214 KB gzip): `thread-detail.tsx` es client component e importa todo `react-markdown` (~44 KB gzip) al navegador, para texto que ya llega resuelto del server. El patrón correcto YA existe en la página de lección. *(ALTO · M)*
5. **Waterfalls de queries secuenciales** que son independientes entre sí (access + cohorte, profile + cohorte, etc.), pudiendo ir en `Promise.all`. El patrón correcto ya está en `[moduleSlug]/page.tsx`. *(ALTO · S)*

---

## Metodología y límites honestos

- **Next.js 16 eliminó la tabla `Size / First Load JS` de `next build`** (documentado en `version-16.md`: la consideran inexacta en arquitecturas RSC). Las cifras de bundle se reconstruyeron leyendo `.next/diagnostics/route-bundle-stats.json` + gzip real por chunk. Es fidedigno, pero no es literalmente el output de `next build`.
- **Core Web Vitals / Lighthouse en vivo sobre el classroom quedan pendientes**: requieren sesión iniciada (no había credenciales). La parte medida se apoya en bundle del build + análisis estático. Recomendado: Vercel/Netlify Analytics o Lighthouse autenticado como siguiente paso.
- **Bug ajeno detectado (no de performance):** `pnpm build` falla intermitentemente en el paso TypeScript ("Property `author` does not exist on `ThreadRow`/`CommentRow`") con línea distinta cada vez y sin corresponder al código real; `tsc --noEmit` pasa siempre. Apunta a un race en el typechecker paralelo de Turbopack (Next 16.2.4), NO a un error de tipos. Riesgo para CI — considerar reportarlo upstream y confiar en `tsc --noEmit`.

### Bundle por ruta (gzip, First Load)
Baseline compartido: **~129 KB gzip** (React 19 + runtime Next, en todas las rutas de la app). Rutas classroom: 165–184 KB, **salvo el detalle de hilo: 214 KB** (outlier por Markdown en cliente). El resto de deltas por ruta (quiz +13, lección +19) son código propio de UI moderado, sin librerías de terceros mal ubicadas.

---

## Hallazgos priorizados

Leyenda severidad: 🔴 alta · 🟡 media · ⚪ baja. Esfuerzo: S/M/L.

### 🔴 Cross-cutting (afecta toda la superficie)

| # | Hallazgo | Archivo(s) | Sev | Esf |
|---|----------|-----------|-----|-----|
| 1 | **Triple `getUser()` por navegación** (proxy → layout → page), sin `cache()`, 3 RTT al Auth server en serie antes de pintar | `lib/supabase/middleware.ts:27`, `app/(classroom)/layout.tsx:19`, cada `page.tsx` | 🔴 | S–M |
| 2 | Middleware llama `getUser()` en CADA request, incluso antes de evaluar `isPublic` (se paga en rutas públicas) | `lib/supabase/middleware.ts:27` | 🔴 | M |

**Fix recomendado (los dos juntos):** helper `getAuthUser = cache(async () => (await createClient()).auth.getUser())` reutilizado en layout + pages (elimina 2 RTT); mover el chequeo `isPublic` antes de `getUser` en el proxy; y evaluar `getClaims()` (verificación local del JWT, sin red) si el proyecto usa firma asimétrica, o propagar el user validado desde el proxy vía header (como ya se hace con `x-pathname`). Esto solo, bien hecho, es el mayor salto de "seda" del classroom.

### 🔴 Render / suavidad (lo que literalmente se siente)

| # | Hallazgo | Archivo | Sev | Esf |
|---|----------|---------|-----|-----|
| 3 | Context de video re-renderiza todo el árbol de la lección cada ~400ms; `lesson-video-section.tsx:56` lee `currentTime` y **nunca lo usa** (suscripción muerta) | `components/classroom/video-sync-context.tsx:29` | 🔴 | S (quick) → M (completo) |
| 4 | Árbol de comentarios (filter+Map+sort) reconstruido en cada render sin `useMemo`, duplicado en 2 componentes | `comment-section.tsx:546`, `conversaciones/thread-detail.tsx:526` | 🟡 | S |
| 5 | `VideoPlayer` (~1350 líneas) se re-renderiza entero en cada `timeupdate`; la barra de progreso anima `width` (layout) en vez de `transform` (compositor) | `components/classroom/video-player.tsx:436,964` | 🟡 | M |

### 🔴 Imágenes / media

| # | Hallazgo | Archivo | Sev | Esf |
|---|----------|---------|-----|-----|
| 6 | Avatares hasta 2 MB sin optimizar (`<img>` crudo o `next/image unoptimized`) en el sidebar de cada página + cada comentario. Host Supabase falta en `remotePatterns` | `primitives.tsx:114`, `comment-section.tsx:158`, `conversaciones/thread-*`, `next.config.ts` | 🔴 | M |
| 7 | Miniaturas Mux del módulo con `<img>` crudo sin `loading="lazy"` (se descargan todas de una); `lesson-card.tsx` ya lo hace bien con `next/image` | `[cohortSlug]/[moduleSlug]/page.tsx:57` | 🟡 | S |

### 🔴 Bundle / JavaScript

| # | Hallazgo | Archivo | Sev | Esf |
|---|----------|---------|-----|-----|
| 8 | `thread-detail.tsx` (client) importa todo `react-markdown` (~44 KB gzip) para pintar `thread.body` que ya llega del server → ruta más pesada (214 KB) | `conversaciones/thread-detail.tsx:7` | 🔴 | M |
| 9 | `QuizRunner` importa las 5 pantallas del flujo (start/in-progress/locked/pass/fail, ~2.800 líneas) estáticas; solo se ve una por vez | `components/classroom/quiz-runner.tsx:5` | 🔴 | M |
| 10 | `LessonVideoSection` empaqueta `SummaryCard`+`CommentSection`+`TranscriptPanel` estáticos (contenido tras pestañas/drawer) — es la página de mayor tráfico | `lesson-video-section.tsx:4` | 🟡 | M |
| 11 | `GuideIndexClient` embebe 22 KB de contenido (ambas audiencias) en el bundle cliente por una caja de búsqueda | `guide/guide-index-client.tsx:7` | ⚪ | S |

**Fix patrón (8, 10, 11):** renderizar el contenido en el Server Component padre y pasarlo como `children`/prop al wrapper cliente, en vez de importar el parser/contenido dentro del módulo `"use client"`. **Fix (9):** `next/dynamic` por fase con skeleton (las transiciones ya tienen fetch, el spinner es imperceptible).

### 🟡 RSC / fetching de datos (waterfalls)

| # | Hallazgo | Archivo | Sev | Esf |
|---|----------|---------|-----|-----|
| 12 | `getClassroomAccess` + `getCohortWithProgram` (independientes) esperados en serie en 6 pages → `Promise.all` (ya existe en `[moduleSlug]/page.tsx:273`) | `[cohortSlug]/page.tsx:154`, `calendario`, `conversaciones`, `conversaciones/[threadId]`, `recursos`, `quiz` | 🟡 | S |
| 13 | Layout: `profile` → `cohort/enrollment` en serie siendo independientes | `app/(classroom)/layout.tsx:26` | 🟡 | S |
| 14 | `getModulesWithLessons` trae `lessons(*)` incluyendo `content` (markdown) de TODAS las lecciones; el dashboard solo necesita título/posición | `lib/classroom/queries.ts:84` | 🟡 | M |
| 15 | `profiles(full_name, avatar_url)` re-consultado en 5 pages que el layout ya trajo | `[lessonSlug]/page.tsx:149` y 4 más | 🟡 | S |
| 16 | Lección: `access` + `getSessionRecordingRedirect` (independientes) en serie → `Promise.all` | `[lessonSlug]/page.tsx:49` | ⚪ | S |
| 17 | Recursos: `getCohortSchedule` en serie tras módulos+recursos siendo independiente | `recursos/page.tsx:74` | ⚪ | S |
| 18 | `getThreadWithComments` trae TODOS los comentarios sin `.limit()`/paginación (a diferencia del feed) | `lib/conversaciones/queries.ts:210` | ⚪ | M |
| 19 | Layout resuelve el cohorte con query cruda propia en vez de reusar `resolveCohortSlug` (ya cacheado) | `app/(classroom)/layout.tsx:68` | ⚪ | M |
| 20 | `prefetch={false}` en todos los links del sidebar mientras cada página tiene waterfall — confirmar si es intencional | `components/classroom/sidebar.tsx:145` | ⚪ | S |

### Fuera de alcance de perf (decisión de arquitectura)
- `QuizRunner` duplica la lógica de render de preguntas que ya existe en el sistema unificado `evaluations` (`quiz-in-progress.tsx` vs `evaluation/question-input.tsx`). Consolidar es una decisión de producto, no un fix de bundle. *(L)*

---

## Roadmap sugerido (impacto × esfuerzo)

### 🚀 Fase 1 — Quick wins (S, alto impacto) — "la mayor seda por el menor esfuerzo"
1. **Dedup `getUser()` con `cache()`** + mover `isPublic` antes de `getUser` en el proxy (#1, #2).
2. **Quitar la lectura muerta de `currentTime`** en `lesson-video-section.tsx:56` (#3, parte rápida).
3. **`useMemo` del árbol de comentarios** en los 2 componentes (#4).
4. **`Promise.all`** en los 6 pages con access+cohorte (#12), layout (#13) y lección (#16).
5. **Miniaturas Mux → `next/image` lazy** (#7).

### 🔧 Fase 2 — Medio (M, alto impacto)
6. **Avatares con `next/image`** + host Supabase en `remotePatterns` + resize server-side en upload (#6).
7. **Markdown de hilos al server** (`thread-detail` recibe body renderizado como children) (#8).
8. **`next/dynamic`** en QuizRunner (#9) y en las pestañas de la lección (#10).
9. **Aislar la barra de progreso del VideoPlayer** + `transform: scaleX` (#5); separar el context de `currentTime` (#3 completo).
10. **Select explícito sin `content`** en `getModulesWithLessons` (#14).

### 🧹 Fase 3 — Pulido (según se mida)
11. Helper `getViewerProfile` cacheado (#15), dedupe de resolución de cohorte en layout (#19), paginación de comentarios de hilo (#18), reconsiderar `prefetch` del sidebar (#20).

---

## Lo que YA está bien (no tocar)
- ✅ `hls.js` se carga con `import()` dinámico — NO viaja en el first load de la lección/clase.
- ✅ El `<Markdown>` de la **lección de texto** ya se renderiza en el server (0 JS al cliente) — es el patrón a replicar en conversaciones.
- ✅ `lesson-card.tsx` ya usa `next/image` + `fill` + `sizes` + `loading="lazy"` correctamente.
- ✅ Migración correcta a `proxy.ts` (Next 16 renombró `middleware.ts`).
- ✅ El feed de conversaciones ya pagina (`DEFAULT_LIST_LIMIT=50`).

---

## Recomendación
Empezar por **Fase 1 completa** (todo S, riesgo bajo, sin cambios de arquitectura) y medir. Solo el fix #1 (auth) debería recortar latencia perceptible en cada navegación del classroom. Después evaluar Fase 2 con métricas reales (Lighthouse autenticado / Analytics).
