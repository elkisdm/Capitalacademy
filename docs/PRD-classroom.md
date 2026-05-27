# PRD — Módulo Classroom

> Product Requirements Document para el módulo de aula virtual de Capital Academy.

- **Autor:** Equipo Capital Academy
- **Fecha:** 2026-05-26
- **Estado:** Draft
- **Épicas relacionadas:** E5 (Sesiones/grabaciones), E9 (Progreso), E13 (Recursos/Comentarios)
- **ADRs:** [0001](adr/0001-mux-como-video-provider.md), [0002](adr/0002-arquitectura-modulo-classroom.md), [0003](adr/0003-tracking-progreso-video.md)

---

## 1. Problema

Capital Academy imparte programas ejecutivos (Diplomado en Ventas, Liderazgo, Ruta Inmobiliaria, Masterclass) con componente presencial y online. Hoy las grabaciones de clase se comparten ad-hoc (links de Drive, WeTransfer) sin control de acceso, sin tracking de quién vio qué, y sin una experiencia unificada para el alumno.

La reunión del 20 de mayo 2026 confirmó la decisión de **grabar TODO desde ya** — clases presenciales, online y masterclass — para alimentar blog, SEO, comunidad, Reels/Shorts y, sobre todo, la plataforma de aprendizaje.

## 2. Objetivo

Construir el módulo Classroom dentro de la plataforma Capital Academy donde los alumnos matriculados puedan:

1. **Ver clases grabadas** con un reproductor de alta calidad.
2. **Retomar donde dejaron** (reanudación automática).
3. **Ver su progreso** por lección y por módulo.
4. **Acceder a recursos** (PDF, links, plantillas) asociados a cada lección.

Y donde ops/admin pueda:

5. **Subir videos** directamente a la plataforma.
6. **Ver el progreso de los alumnos** por cohorte y módulo.

## 3. No-scope (MVP)

- Sesiones en vivo embebidas (se mantiene link externo a Zoom/Meet).
- Comentarios e hilos de discusión por lección (E13 parcial, se aborda después).
- Evaluaciones y tareas integradas en el Classroom (E7, E8, módulos separados).
- Anti-skip de video (si el alumno hace seek al 90%, se marca como completado).
- Notificaciones push cuando hay nuevo contenido.
- App móvil nativa (responsive web es suficiente).

## 4. Usuarios y roles

| Rol | Acciones en Classroom |
|---|---|
| **Alumno** (student) | Ver contenido de su cohorte, ver progreso, descargar recursos |
| **Profesor** (teacher) | Ver progreso de alumnos de sus módulos |
| **Ops** (ops) | Subir videos, gestionar recursos, ver progreso de todos |
| **Admin** (admin) | Todo lo de ops + configuración del programa |

## 5. User Stories

### 5.1 Alumno

**US-C01: Ver mis módulos y lecciones**
> Como alumno, quiero ver la lista de módulos de mi cohorte con el estado de cada lección (bloqueada, disponible, completada) para saber qué debo ver.

Criterios de aceptación:
- Veo los módulos ordenados por posición.
- Cada lección muestra: título, duración, thumbnail, estado (lock/available/in-progress/completed).
- Las lecciones con `unlock_at` en el futuro aparecen como bloqueadas con la fecha.
- Las lecciones sin video asignado aparecen como "próximamente".

**US-C02: Ver una clase grabada**
> Como alumno, quiero ver una lección grabada con un reproductor de video de alta calidad.

Criterios de aceptación:
- El video se reproduce con calidad adaptativa (ABR).
- Si ya vi parte del video antes, se reanuda desde donde lo dejé.
- Puedo pausar, adelantar, retroceder, cambiar velocidad (0.5x a 2x).
- Controles de pantalla completa.
- El video NO es descargable (signed URL + no download button).

**US-C03: Ver mi progreso**
> Como alumno, quiero ver cuánto llevo de cada módulo y del programa completo.

Criterios de aceptación:
- Cada lección muestra el % de video visto.
- Cada módulo muestra: "X de Y lecciones completadas".
- Barra de progreso visual por módulo.
- Una lección se marca como completada cuando vi ≥90% del video.

**US-C04: Acceder a recursos de la lección**
> Como alumno, quiero descargar los recursos asociados a una lección (PDF, plantillas, links).

Criterios de aceptación:
- Debajo del video, veo la lista de recursos con ícono por tipo.
- PDFs y documentos se descargan directamente.
- Links externos se abren en nueva pestaña.

### 5.2 Ops/Admin

**US-C05: Subir un video a una lección**
> Como ops, quiero subir un video a una lección para que los alumnos puedan verlo.

Criterios de aceptación:
- En el panel de gestión de lecciones, hay un botón "Subir video".
- El video se sube directamente a Mux (direct upload) sin pasar por nuestro server.
- Veo un indicador de progreso durante el upload.
- Después del upload, veo estado "Procesando..." hasta que Mux termine el transcoding.
- Cuando está listo, veo el thumbnail y la duración.
- Puedo reemplazar el video (sube uno nuevo, el anterior se elimina de Mux).

**US-C06: Gestionar recursos de una lección**
> Como ops, quiero agregar, editar y eliminar recursos asociados a una lección.

Criterios de aceptación:
- Puedo subir PDFs a Supabase Storage.
- Puedo agregar links externos.
- Puedo reordenar los recursos (drag & drop o flechas).
- Puedo eliminar un recurso.

**US-C07: Ver progreso de alumnos**
> Como ops, quiero ver el progreso de video de todos los alumnos de una cohorte para identificar quién está atrasado.

Criterios de aceptación:
- Tabla: alumno × módulo con % de avance.
- Filtro por cohorte.
- Indicador visual (rojo/amarillo/verde) según % completado.
- Poder hacer drill-down a nivel de lección por alumno.

## 6. Flujos principales

### 6.1 Upload de video (ops)

```
Ops → Dashboard admin → Selecciona programa → Selecciona módulo → Selecciona lección
  → Click "Subir video"
  → Browser solicita Direct Upload URL a POST /api/admin/mux/upload
  → Mux retorna upload URL
  → Browser sube archivo directo a Mux (progress bar)
  → Upload completo → lesson.mux_upload_id guardado
  → Mux procesa el video (async, ~2-5 min)
  → Webhook POST /api/webhooks/mux (event: video.asset.ready)
  → Server actualiza lesson: mux_asset_id, mux_playback_id, video_duration_seconds, thumbnail_url
  → Lección aparece con video disponible para alumnos
```

### 6.2 Consumo de video (alumno)

```
Alumno → Login → Classroom → Mi cohorte → Módulo X → Lección Y
  → Server genera signed playback URL (1h expiry)
  → MuxPlayer renderiza con playback URL
  → Si existe video_progress → set startTime a playback_position_seconds
  → Alumno ve el video
  → Cada 15s (o pause/close) → PATCH /api/classroom/progress
  → Server hace UPSERT en video_progress
  → Si watch_percentage >= 90 → completed = true
  → UI actualiza progreso del módulo
```

### 6.3 Reporte de progreso (ops)

```
Ops → Dashboard → Reportes → Progreso por cohorte
  → Selecciona cohorte
  → Ve tabla: alumno × módulo con % de lecciones completadas
  → Click en celda → drill-down: lecciones de ese módulo para ese alumno
  → Ve: nombre lección, % visto, última vez visto, estado
```

## 7. Modelo de datos

Ver [ADR-0002](adr/0002-arquitectura-modulo-classroom.md) para el schema completo.

Resumen de entidades nuevas:
- `lessons` — se extiende con columnas de Mux (`mux_asset_id`, `mux_playback_id`, `video_duration_seconds`, `thumbnail_url`).
- `video_progress` — nueva tabla (enrollment_id × lesson_id) con posición, %, completado.
- `lesson_resources` — nueva tabla (lesson_id) con título, tipo, URL, orden.

Entidades existentes que se reutilizan sin cambios:
- `programs`, `cohorts`, `program_modules`, `enrollments`, `profiles`.

## 8. Integraciones

| Sistema | Uso | Dirección |
|---|---|---|
| **Mux** (Video) | Upload, transcoding, playback, thumbnails | Bidireccional (API + webhook) |
| **Supabase Auth** | Autenticación del alumno | Lectura |
| **Supabase Storage** | Almacenamiento de recursos (PDFs) | Escritura/lectura |
| **Supabase DB** | Persistencia de progreso y metadata | CRUD |

## 9. Wireframes (descripción textual)

### 9.1 Vista alumno — Dashboard de cohorte

```
┌─────────────────────────────────────────────────┐
│  Capital Academy          [Avatar] Mi cuenta    │
├──────────┬──────────────────────────────────────┤
│ Sidebar  │  Diplomado Ejecutivo — Cohorte 4     │
│          │                                       │
│ Módulo 1 │  ┌─────────┐ ┌─────────┐             │
│  ██████  │  │ Mod. 1  │ │ Mod. 2  │             │
│ Módulo 2 │  │ 3/5 ✓   │ │ 0/4     │             │
│  ███░░░  │  │ ████░░  │ │ ░░░░░░  │             │
│ Módulo 3 │  └─────────┘ └─────────┘             │
│  🔒      │  ┌─────────┐ ┌─────────┐             │
│          │  │ Mod. 3  │ │ Mod. 4  │             │
│          │  │ 🔒 Jun 15│ │ 🔒 Jul 1│             │
│          │  └─────────┘ └─────────┘             │
└──────────┴──────────────────────────────────────┘
```

### 9.2 Vista alumno — Lección con video

```
┌─────────────────────────────────────────────────┐
│  ← Módulo 1: Fundamentos    Lección 3 de 5     │
├──────────┬──────────────────────────────────────┤
│ Sidebar  │  ┌──────────────────────────────┐    │
│          │  │                                │    │
│ ● Lecc 1 │  │        VIDEO PLAYER           │    │
│ ● Lecc 2 │  │        (MuxPlayer)            │    │
│ ▶ Lecc 3 │  │                                │    │
│ ○ Lecc 4 │  └──────────────────────────────┘    │
│ 🔒Lecc 5 │                                       │
│          │  Lecc. 3: Técnicas de cierre          │
│          │  Duración: 45 min  │  Visto: 65%      │
│          │                                       │
│          │  📎 Recursos                          │
│          │  ├ 📄 Guía de cierre.pdf              │
│          │  └ 🔗 Artículo complementario         │
└──────────┴──────────────────────────────────────┘

● = completada  ▶ = en progreso  ○ = disponible  🔒 = bloqueada
```

## 10. Métricas de éxito

| Métrica | Target MVP | Cómo se mide |
|---|---|---|
| Adopción | 80% de alumnos ven al menos 1 video en la primera semana | video_progress count / enrollments |
| Completación | 60% de lecciones con video son completadas (≥90%) | video_progress where completed = true |
| Reanudación | <5s para resumir un video previamente visto | Mux Data: time to first frame |
| Upload success | 95% de uploads terminan en asset ready | Mux webhook events |

## 11. Dependencias y prerequisitos

| Dependencia | Estado | Bloqueante |
|---|---|---|
| Mux cuenta con API keys | ✅ Configurado (.env) | Sí |
| Supabase proyecto en producción | ⏳ Pendiente (Sprint 0) | Sí |
| Schema E1-E5 corrido en Supabase | ⏳ Pendiente | Sí |
| Dominio configurado para Mux domain restriction | ⏳ Pendiente | No (solo para prod) |
| Contenido grabado (videos) | ⏳ En proceso (acordado 20-may) | No (se puede probar con video de prueba) |

## 12. Fases de implementación

### Fase 1 — Fundación (Sprint 3 del roadmap)
- Migración SQL: columnas Mux en lessons + tabla video_progress + tabla lesson_resources.
- API route: Mux direct upload.
- Webhook: `video.asset.ready` → actualizar lesson.
- UI admin: upload de video a una lección.
- UI alumno: vista de módulos y lecciones con estado.
- MuxPlayer con signed URLs.
- Hook `useVideoProgress` + endpoint PATCH de progreso.
- Reanudación automática.

### Fase 2 — Recursos y reportes (Sprint 3-4)
- Upload de recursos (Supabase Storage).
- Lista de recursos por lección.
- Vista ops: progreso de alumnos por cohorte.
- Drill-down de progreso por alumno y módulo.

### Fase 3 — Refinamiento (Sprint 5+)
- Thumbnails personalizados.
- Notificación cuando se sube nuevo contenido.
- Integración con E9 (progreso de video como input del progreso académico global).
- Integración con E7/E8 (lección requiere video completado + evaluación aprobada).

## 13. Preguntas abiertas

| # | Pregunta | Impacto | Decisor |
|---|---|---|---|
| 1 | ¿Se necesita subtítulos/captions en los videos? Mux ofrece auto-generated captions. | UX, accesibilidad | Dirección académica |
| 2 | ¿Los videos se organizan solo por módulo/lección, o habrá una "biblioteca" con búsqueda? | Navegación, schema | Producto |
| 3 | ¿El profesor puede subir videos o solo ops/admin? | Permisos, UI | Operación |
| 4 | ¿Se quiere limitar cuántas veces un alumno puede ver un video? | Política, negocio | Dirección |
| 5 | ¿Los archivos originales se conservan en Google Drive como backup o solo en Mux? | Storage, costos | Operación |
