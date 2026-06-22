# Handoff QA — Recursos, editor de módulo y calendario (2026-06-22)

> Para el auditor QA. Todo lo listado **ya está en producción** (`https://capitalacademy.cl`),
> rama `main`, último deploy `f3d4a5a` (Netlify, estado `ready`). Migraciones aplicadas en el
> Supabase de prod (`igatsyghbadccbrjiurl`). Probar con una cuenta **admin/ops**.

## Contexto rápido del modelo (clave para entender qué probar)

- Hay **dos tipos de "clase"**:
  - **Lección grabada** (`lessons`) — video Mux. Pertenece al **programa**. Hoy solo el **Workshop** tiene (5).
  - **Clase en vivo** (`class_sessions`) — calendario. Pertenece a la **cohorte**. El **Diplomado IV** tiene 24 (0 grabadas).
- Cada una cuelga de un **módulo**. El Diplomado tiene 2 módulos: **Teórico** (8 clases) y **Práctico** (16).
- Recursos: `lesson_resources` (de lecciones) y `session_resources` (de clases en vivo). Ambos ahora soportan **archivo subido** además de enlace.

---

## 1. Subida de archivos a recursos de LECCIÓN grabada (`df66c7d`)
**Dónde:** Admin → Recursos (`/admin/resources`) → seleccionar **programa Workshop** → elegir lección.
**Probar:**
- [ ] "Agregar recurso" → toggle **"Subir archivo"** → seleccionar PDF/imagen/doc → se sube y aparece en la lista.
- [ ] Rechaza archivos > 50 MB (mensaje claro).
- [ ] Acepta cualquier tipo (documento o multimedia).
- [ ] Toggle **"Link externo"** sigue funcionando (URL http/https; rechaza `javascript:`/`data:`).
- [ ] Como **alumno** del Workshop: el recurso subido se descarga desde el reproductor de la lección (enlace temporal firmado).
- [ ] Borrar el recurso lo quita y elimina el archivo del almacenamiento.
**Nota:** el Diplomado **no** aparece acá con lecciones (tiene 0 grabadas). Eso es esperado — sus recursos van por el calendario (ver punto 6).

## 2. Subida de archivos a recursos de CLASE EN VIVO / calendario (`f3d4a5a`)
**Dónde:** Admin → Cohortes → **Diplomado IV Generación** → Sesiones/Calendario → editar una clase → **"Material de la clase"**.
**Probar:**
- [ ] Toggle **"Subir archivo"** → seleccionar archivo (≤50 MB, cualquier tipo) → "Agregar material" → aparece como "Archivo subido".
- [ ] Toggle **"Enlace externo"** sigue funcionando.
- [ ] Rechaza > 50 MB.
- [ ] Como **alumno** del Diplomado: el archivo se descarga desde **Calendario** y desde la página del **módulo** (enlace firmado temporal).
- [ ] Borrar el recurso elimina también el archivo del almacenamiento.
**Pendiente de contenido:** falta subir "El camino del lobo" (2 PDFs) a la **primera clase** ("Apertura, autoridad y conexión") — lo hará el equipo por esta misma UI.

## 3. Recursos y lecciones SCOPADOS por programa (`da00004`)
**Dónde:** `/admin/resources` y `/admin/lessons`.
**Probar:**
- [ ] Hay un **selector de programa** arriba; al cambiarlo solo se ven los módulos/lecciones de ESE programa (Diplomado / Workshop / Liderazgo).
- [ ] Ya **no se mezclan** recursos/lecciones de distintos programas en una sola lista.

## 4. Editor de módulo unificado (`7b9ce47`)
**Dónde:** `/admin/lessons` → seleccionar **programa + cohorte**.
**Probar:**
- [ ] Cada módulo muestra **lecciones grabadas** y, debajo, **clases en vivo (calendario)** de la cohorte elegida.
- [ ] **Mover lección grabada** a otro módulo con el dropdown "Mover a…" (probar en Workshop). Debe quedar al final del módulo destino.
- [ ] **Mover clase en vivo** a otro módulo desde el dropdown "Mover a…" (probar en Diplomado). Verificar que el cambio se refleja también en el **editor de calendario** (es la misma data).
- [ ] No se puede mover una lección/clase a un módulo de **otro programa** (validación server).

## 5. Diplomado: módulos muestran sus clases (`2b1218f` + migración 0037)
**Dónde:** Classroom del Diplomado IV (`/classroom/diplomado-iv-generacion`) como alumno.
**Probar:**
- [ ] Los módulos muestran **"8 clases" / "16 clases"** (antes decían "0 lecciones").
- [ ] Al entrar a un módulo se ven sus **clases en vivo** (fecha, modalidad, docente).
- [ ] El reparto Teórico (8) / Práctico (16) es coherente.

## 6. Integridad calendario ↔ módulo (`f00ad86`)
**Probar:**
- [ ] Crear/editar una sesión y asignarle un módulo: solo deja elegir módulos del **programa de la cohorte**.
- [ ] Eliminar un módulo que tiene **clases de calendario vinculadas** → se **bloquea con aviso** (no las deja huérfanas).
- [ ] Eliminar un módulo/lección con **progreso de alumnos** → bloqueado con 409.

---

## Trabajo relacionado de quizes/certificación (del equipo, también en prod)
Contexto por si QA lo cruza (commits `c3d6a62`, `ba9a01f`, `5fe5d9e`, `342d880`, `5c66afb`):
- Quizes por clase (lección/módulo) además del examen final; 4 tipos de pregunta.
- Quiz↔lección: tabla `evaluations` con `scope='lesson'` + `lesson_id` (un quiz activo por lección), gestionado en `/admin/lessons/[lessonId]`.
- Endurecimiento del modelo de evaluaciones y del cálculo del certificado (solo el examen FINAL certifica).

## Migraciones aplicadas en prod (verificadas)
`0033` evaluations · `0034` storage lecciones · `0035` hardening quiz · `0036` índice intento por evaluación · `0037` vínculo sesiones↔módulo Diplomado · `0038` storage recursos de sesión.

## Estado de calidad
- `tsc` limpio · **216 tests** (vitest) verde · ESLint limpio · deploy `f3d4a5a` `ready`.

## Gaps conocidos / fuera de alcance (no son bugs)
- En `/admin/resources` el Diplomado no lista lecciones (no tiene grabadas); sus recursos van por el calendario (punto 2).
- No existe "recurso a nivel módulo" como entidad: los recursos se adjuntan a una lección o a una clase específica.
- Falta cargar el contenido pendiente que pidió la Dirección Académica (presentaciones, prompt+video de IA, evaluación de Educación Financiera) — aún no entregados.
- Asistencia (E6) y tareas/entregas (E8) no existen en el sistema.
