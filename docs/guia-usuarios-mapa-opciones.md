# Capital Academy — Mapa de opciones y configuraciones (base para la guía de usuarios)

> Auditoría final 2026-06-22. Inventario de **toda pantalla, botón, opción y configuración** del
> sistema, organizado por rol, para construir la guía de usuarios. Incluye estado funcional
> (verificado en prod esta sesión) y limitaciones conocidas. Todo está en producción
> (`capitalacademy.cl`), rama `main`.

---

## 1. Roles y accesos

**Rol de plataforma (`system_role`)** — define el acceso al panel admin:
| Rol | Puede |
|-----|-------|
| `admin` | Todo: crear cualquier rol, cambiar roles de plataforma, toda la gestión |
| `ops` | Casi todo, EXCEPTO crear/editar usuarios `ops`/`admin` |
| `user` (alumno) | Solo su classroom (no ve el panel admin; `/admin/*` lo redirige) |

**Rol por cohorte (`cohort_roles`)** — qué hace dentro de un programa:
| Rol | Puede |
|-----|-------|
| `student` (alumno) | Ve contenido, rinde evaluaciones, ve calendario. Tiene matrícula (`enrollment`) |
| `teacher` (profesor) | Imparte clases, gestiona sus módulos |
| `assistant` (ayudante) | Apoya al profesor |

> **Gotcha**: ser `admin` de plataforma NO te da datos de una cohorte donde no tienes rol; el acceso es `(system_role staff) O (cohort_role en esa cohorte)`. El staff entra a cualquier classroom sin matrícula.

---

## 2. PANEL ADMIN

### 2.1 Usuarios — `/admin/users`
**Qué es**: gestión de todas las cuentas. **Acceso**: ops/admin.

| Opción | Qué hace | Valores / default |
|--------|----------|-------------------|
| Búsqueda | Filtra por nombre o email | texto libre |
| Filtro **Entorno** | Filtra por programa | Todos / Diplomado / Workshop |
| Filtro **Estado** | Por activación de cuenta | Todos / Activos / Pendientes |
| Pills de **rol** | Por rol | Todos · Admin · Ops · Profesores · Alumnos (contadores respetan entorno+estado) |
| **Nuevo usuario** | Crea cuenta (nombre, email, teléfono, rol, cohorte opcional, enviar invitación) | rol default `user`; invitación marcada |
| **Importar CSV** | Carga masiva (máx ~50 filas): columnas nombre/email/teléfono/RUT, elige cohorte, envía invitaciones | plantilla descargable |
| Fila → **Ver perfil** | `/admin/users/[id]`: métricas, cohortes, actividad reciente | — |
| **Editar** | Cambia nombre/teléfono/rol (email es inmutable) | ops no puede subir a ops/admin |
| **Asignar a cohorte** | Asigna rol student/teacher/assistant en una cohorte | si teacher, asigna módulos |
| **Enviar invitación** | (Re)envía email de onboarding | solo si pendiente |
| **Desactivar** | Bloquea acceso, cierra sesiones (no borra datos) | — |
| Toggle **Capital Inteligente** (en perfil) | Marca segmento del alumno → ve clases exclusivas de ese segmento | manual, por matrícula |

**Onboarding del alumno** (tras invitación): link por email (72h) → set-password → completar perfil → classroom. El estado pasa de "Pendiente" a "Activo".

### 2.2 Lecciones y módulos — `/admin/lessons` (sidebar: "Lecciones")
**Qué es**: estructura de contenido. Selector de **Programa** + **Cohorte** (la cohorte filtra las clases en vivo mostradas).

**Módulos**:
| Opción | Campos / default |
|--------|------------------|
| **Nuevo módulo** | código (único por programa), título, descripción |
| **Editar módulo** | código, título, descripción (el slug no se edita) |
| **Eliminar módulo** | bloqueado si hay lecciones con progreso o clases del calendario vinculadas (aviso 409) |

**Lecciones grabadas** (pertenecen al **programa**):
| Opción | Campos / default |
|--------|------------------|
| **Nueva lección** | título, tipo (Grabada VOD / live online / presencial; default Grabada), descripción |
| **Editar lección** (`/admin/lessons/[id]`) | título, descripción, tipo, **apertura por calendario** (`unlock_at`: vacío = siempre disponible; con fecha = bloqueada hasta ese momento) |
| **Reordenar** | flechas ↑↓ |
| **Mover a otro módulo** | dropdown "Mover a…" (solo módulos del mismo programa) |
| **Eliminar** | bloqueado si tiene progreso de alumnos |
| **Video (Mux)** | subir/reemplazar (MP4/MOV/WebM, hasta 12 GB, upload directo); procesa ~2-5 min vía webhook |
| **Recursos** | ver §2.4 |
| **Evaluación de la clase** | ver §2.5 (quizzes formativos) |

**Clases en vivo** (pertenecen a la **cohorte**, vía calendario): aparecen bajo cada módulo; "Mover a…" entre módulos del mismo programa.

### 2.3 Calendario / clases en vivo — `/admin/cohorts/[cohortId]/sesiones`
**Qué es**: agenda de clases en vivo de una cohorte (vista lista o mes).
| Opción | Campos / default |
|--------|------------------|
| **Nueva sesión** | título, inicio/fin (zona Santiago), modalidad (online/presencial/grabada; default online), instructor, URL de reunión, módulo, audiencia (`all` o `capital_inteligente`), estado (programada/en curso/finalizada/cancelada) |
| **Editar** | todos los campos; reprogramar registra el cambio |
| **Eliminar** | directo |
| **Material de la clase** | recursos de la sesión (ver §2.4) |
| Vincular a **módulo** | solo módulos del programa de la cohorte |

La plataforma envía **recordatorios automáticos** por email antes de cada clase (cron cada 30 min). Las clases canceladas se marcan y no ofrecen "Entrar".

### 2.4 Recursos — `/admin/resources` ("Recursos por lección")
**Qué es**: materiales de cada clase. Selector de **Programa**. Navegación módulo → lección.
- **Lecciones grabadas**: panel de recursos con **Subir archivo** (≤50 MB, cualquier tipo: pdf/link/template/document/other) o **Link externo** (solo http/https). Eliminar borra archivo del storage.
- **Clases en vivo**: bajo cada módulo aparece la sección "Clases en vivo" con cada clase y un **acceso directo al editor de calendario**, donde se carga su material (mismo flujo archivo/link). *(Las clases en vivo no tienen lección grabada/video; por eso su material se gestiona en el calendario.)*
- También se gestionan los recursos de lección desde el **editor de cada lección** (§2.2).
- El alumno descarga con **enlace firmado temporal** (bucket privado, 1 hora).

> **Gotcha resuelto esta sesión**: la subida de archivos estaba rota (las lecciones/sesiones usan UUIDs semilla que el validador estricto rechazaba con 422). Corregido — ahora funciona en todas.

### 2.5 Evaluaciones / Quizzes
Hay **dos tipos**, en la misma tabla `evaluations`, distinguidos por `scope`:

**A) Examen FINAL — `/admin/quizzes`** (el único que **emite certificado**):
| Tab | Qué hace |
|-----|----------|
| **Preguntas** | Pool del examen. Agregar manual o **Generar con IA** (usa transcripciones del programa). ⚠️ **Solo opción única A–D** (ver limitación abajo) |
| **Configuración** | min_completion_pct (def. 80 — % de contenido a completar antes de rendir), passing_grade_pct (def. 70 — nota para aprobar), questions_per_attempt (def. todas), max_attempts (def. 1 para el final), time_limit_minutes (opcional), is_active |
| **Intentos** | Historial de intentos del examen final (no mezcla formativos) |
| **Certificados** | Lista, descarga y reemisión |

**B) Quizzes POR CLASE (formativos) — editor de lección → "Evaluación de la clase"**:
- **NO emiten certificado, NO bloquean el avance** (son práctica).
- Crear evaluación → agregar preguntas de **4 tipos**: opción única (2–6 opciones), opción múltiple (varias correctas), verdadero/falso, respuesta corta (corrige normalizando mayúsculas/tildes/espacios). Activar/desactivar (no se activa sin preguntas).
- Config: passing_grade_pct (def. 70), max_attempts (def. 3).

**Vista del alumno**: el final en `/classroom/[cohorte]/quiz` (estados: bloqueado por completitud / sin intentos / listo / aprobado→certificado). Los formativos, al final de cada lección (intro → responder → resultado con revisión; reintentos hasta el tope; sin certificado).

**Anti-bypass (ambos)**: el servidor fija el set de preguntas y el denominador, puntúa server-side, cierre atómico. El alumno no puede forjar la nota.

### 2.6 Certificación
- Plantilla PDF por programa; se emite **solo al aprobar el examen FINAL** (+ completitud). Uno por matrícula.
- Verificación pública en `/verificar/[código]` (con QR, sin login).
- Reintento de emisión si la generación falla (solo si aprobó el final).

### 2.7 Progreso de cohorte — `/admin/progress`
Selector de cohorte. Métricas: promedio de la cohorte, cuántos completaron (≥90%), en riesgo (<30%), total. Tabla por alumno con % global y por módulo (drilldown). El progreso se calcula del avance de video (`completed` ≥ 90% visto).

### 2.8 Cobros y pagos
| Flujo | Ruta | Opciones |
|-------|------|----------|
| **Cobro genérico** (admin) | `/admin/cobros` | monto (1–5.000.000), concepto; genera link firmado (HMAC) para compartir; el cliente paga contado / 6 / 12 cuotas (recargo automático) |
| Checkout **Diplomado** | `/pago` | datos + plan (contado/6/12) + **cupón** de descuento (%) |
| Inscripción **Liderazgo** | `/pago/liderazgo` | datos + plan (contado/4-6/7-12) + **código de lanzamiento** `LIDERAZGO20` |
| Cobro firmado | `/pago/cobro?monto=&sig=` | el monto va firmado; no se puede alterar |

Provider: **Flow**. Al confirmarse el pago del Diplomado, el comprador queda matriculado y recibe el correo de activación.

---

## 3. VISTA DEL ALUMNO (classroom)

| Pantalla | Ruta | Qué puede hacer |
|----------|------|-----------------|
| **Mis programas** | `/classroom` | Ver sus cohortes/programas |
| **Home del programa** | `/classroom/[cohorte]` | Módulos + timeline; estado por módulo (disponible/en progreso/completado/bloqueado por `unlock_at`) |
| **Lecciones del módulo** | `/classroom/[cohorte]/[módulo]` | Lista de lecciones con estado |
| **Reproductor de lección** | `…/[lección]` | Video Mux (controles, velocidad, CC, capítulos, PiP), tabs transcripción/resumen IA/comentarios, marcar completada, y al final el **quiz formativo** si está activo. Recursos descargables |
| **Calendario** | `/classroom/[cohorte]/calendario` | Clases en vivo (lista/mes), material de cada clase, link de reunión, recordatorios |
| **Perfil** | `/classroom/profile` | Editar foto, RUT, teléfono, cumpleaños |
| **Quiz final** | `/classroom/[cohorte]/quiz` | Rendir el examen final (gateado por completitud + intentos) |
| **Certificado** | `/classroom/[cohorte]/certificado` | Ver/descargar el certificado (solo si aprobó el final); si no, mensaje de qué falta |

---

## 4. Entornos (branding por programa)
Cada programa (Diplomado / Workshop / Liderazgo) tiene **login y onboarding branded** (color, nombre, textos) vía `lib/programs/registry.ts`, keyed por slug estable. Misma cuenta por usuario. Para un entorno nuevo: agregar una entrada al registro (slug, programId, code, marca, copy) → se generan `/login/<slug>`, `/onboarding/<slug>/...` automáticamente.

---

## 5. Estado funcional (verificado en prod esta sesión)

✅ **Funciona, probado en vivo**:
- Crear/editar lección y módulo; reordenar; mover entre módulos.
- Quizzes por clase: crear evaluación, agregar los **4 tipos** de pregunta (verificado en DB con formas correctas), activar.
- Flujo del alumno formativo: rendir, 100%, resultado con revisión, **sin certificado**.
- **Límite del certificado**: un formativo aprobado NO emite certificado (verificado en la página de certificado en vivo).
- Recursos: link externo; **subida de archivo** (fix de UUID verificado: `upload-url` → 200).
- `/admin/resources` lista clases en vivo con link al calendario (verificado, navega correctamente).
- Filtros de Usuarios (entorno/estado) + contadores facetados.

## 6. Limitaciones conocidas (documentar en la guía / posibles mejoras)
1. **El examen FINAL solo soporta opción única A–D.** Su submit valida respuestas `A/B/C/D` y puntúa con `correct_option`. Los 4 tipos de pregunta y las N opciones (E/F) son **solo para los quizzes formativos por clase**. ⚠️ **Riesgo**: el editor de preguntas del final (compartido) permite agregar otros tipos; si se agrega uno no-single al pool del final, ese examen se rompería. *Mejora sugerida: restringir el editor del final a opción única, o actualizar el submit del final a `scoreAnswer`.*
2. **`time_limit_minutes` no se aplica en el servidor** (es metadato; el temporizador es solo del cliente, evadible).
3. **Generación IA de preguntas: solo para el examen final** (por programa). Los quizzes por clase se cargan manualmente.
4. **Opción múltiple**: sin puntuación parcial (set exacto). **Respuesta corta**: corrección automática normalizada, sin corrección manual.
5. **Recursos de lección vs. de clase en vivo** son entidades separadas (lección grabada vs. sesión del calendario).

## 7. Defaults de configuración (referencia rápida)
| Config | Default |
|--------|---------|
| Examen final — completitud mínima | 80% |
| Examen final — nota de aprobación | 70% |
| Examen final — intentos | 1 |
| Quiz por clase — nota de aprobación | 70% |
| Quiz por clase — intentos | 3 |
| Opciones por pregunta (formativo) | 2–6 (A–F) |
| Tamaño máximo de archivo (recursos) | 50 MB |
| Expiración de enlace de descarga | 1 hora |
| Invitación de onboarding | 72 horas |

---

*Pendientes menores marcados por la auditoría que conviene confirmar manualmente: campos exactos del perfil del alumno (cumpleaños confirmado; contacto de emergencia no confirmado), y la visualización de recursos de sesión en el calendario del alumno.*
