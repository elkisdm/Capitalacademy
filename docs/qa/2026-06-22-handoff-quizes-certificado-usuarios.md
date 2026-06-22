# Handoff QA — Quizes por clase, certificación y filtros de usuarios (2026-06-22)

> Para el auditor QA. Probar en **producción** (`https://capitalacademy.cl`) con una cuenta
> **admin/ops** y, donde se indique, con una cuenta **alumno** matriculada. Migraciones
> aplicadas en el Supabase de prod. Complementa al handoff de recursos/editor/calendario.

## Contexto del modelo (clave)

- **Dos clases de quiz**, en la MISMA tabla `evaluations`, distinguidos por `scope`:
  - **Examen FINAL** (`scope='final'`, uno por programa) — **es el único que emite certificado**. Exige % de completitud del contenido + nota de aprobación. Se gestiona en **`/admin/quizzes`**.
  - **Quizes por clase / formativos** (`scope='lesson'` o `'module'`) — **práctica, NO certifican, NO bloquean el avance**. Se gestionan en el **editor de la lección** (`/admin/lessons/[lessonId]` → "Evaluación de la clase").
- **4 tipos de pregunta**: opción única (N opciones), opción múltiple (varias correctas), verdadero/falso, respuesta corta.
- El alumno rinde el quiz formativo **al final de la página de la lección**.

---

## 1. Autoría: crear y gestionar el quiz de una clase
**Dónde:** `/admin/lessons` → elegir programa/cohorte → entrar a una **lección** → sección **"Evaluación de la clase"**.
**Probar:**
- [ ] Si la clase no tiene evaluación: aparece "Crear evaluación de la clase" → al crearla queda en estado **"Borrador", 0 preguntas, aprueba con 70%**.
- [ ] "Agregar pregunta manual" abre el editor con selector de **tipo** (4 botones).
- [ ] El editor cambia según el tipo (ver punto 2).
- [ ] Cada pregunta agregada aparece como tarjeta (#01, #02…) con su badge de tipo y la respuesta correcta marcada.
- [ ] **Editar** una pregunta existente y guardar mantiene la respuesta correcta.
- [ ] **Activar para alumnos** cambia el badge a "Activa" y el botón a "Desactivar".
- [ ] **No se puede activar una evaluación sin preguntas** (intentarlo da error).
- [ ] Solo **una** evaluación activa por lección.

## 2. Editor dinámico de preguntas — los 4 tipos
**Dónde:** dentro del editor de pregunta del punto 1.
**Probar cada tipo:**
- [ ] **Opción única**: 2–6 opciones (botón "Agregar opción", máx 6; eliminar opción), **un** círculo de correcta. No deja guardar sin marcar correcta ni con opciones vacías.
- [ ] **Opción múltiple**: checkboxes cuadrados, **varias** correctas; exige ≥1. (Puntuación = set exacto.)
- [ ] **Verdadero/Falso**: dos botones Verdadero/Falso; el cuerpo de opciones desaparece.
- [ ] **Respuesta corta**: lista de "Respuestas aceptadas" (+ "Agregar variante aceptada"); nota "se corrige ignorando mayúsculas, espacios y tildes".
- [ ] Cambiar de tipo a mitad de carga no deja guardar un estado incoherente (el botón Guardar se deshabilita hasta que sea válido).

## 3. Generación de quiz por IA (examen final)
**Dónde:** `/admin/quizzes` → tab **Preguntas** → "Generar con IA".
**Probar:**
- [ ] Genera preguntas (opción única) para el **examen final** del programa.
- [ ] Si hay un intento de quiz **en curso**, bloquea la regeneración con aviso.
- [ ] Las preguntas IA quedan asociadas al examen final (no contaminan los quizes por clase).

## 4. Flujo del alumno — rendir un quiz formativo
**Dónde:** como **alumno** matriculado, entrar a una lección que tenga evaluación **activa** → bloque al final de la página.
**Probar:**
- [ ] Intro muestra "Aprueba con X% · Intentos: n/N" y "Comenzar evaluación".
- [ ] Al comenzar se ven las preguntas con el input según el tipo (radio / checkbox / V-F / texto).
- [ ] "Enviar respuestas" muestra **nota %**, "¡Aprobaste!/Sigue practicando", `n/total correctas`, y la **revisión** (correcta en verde, elegida-incorrecta en rojo).
- [ ] **NO aparece ningún certificado ni botón de certificado** (es formativo).
- [ ] "Volver a intentar" respeta el tope de intentos; agotados, lo informa.
- [ ] Reanudar un intento en curso retoma el mismo set de preguntas.

## 5. ⚠️ Límite del certificado — SOLO el examen final certifica
> Esto es lo más importante de verificar. Un quiz formativo aprobado **NO** debe habilitar el certificado.
**Probar (necesita un programa con examen final configurado + un quiz formativo activo):**
- [ ] Como alumno, **aprobar un quiz formativo** (sacar ≥ nota mínima). Luego ir a la página de **certificado** (`/classroom/[cohorte]/certificado`): debe decir **"necesitas aprobar el examen final"**, NO "genera tu certificado".
- [ ] Aprobar el **examen final** (cumpliendo completitud) **sí** emite el certificado.
- [ ] En `/admin/quizzes` → tab **Intentos**: solo se listan intentos del **examen final**, no los de los quizes formativos.
- [ ] Un alumno que aprobó un quiz formativo **y** luego el examen final: puede cerrar el final y certificar sin error (no se bloquean entre sí).

## 6. Filtros de usuarios por entorno y estado
**Dónde:** `/admin/users`.
**Probar:**
- [ ] Dropdown **"Entorno"** (Diplomado / Workshop) filtra la lista por programa.
- [ ] Dropdown **"Estado"** (Activos / Pendientes) filtra por activación de cuenta.
- [ ] Combinan con los filtros de **rol** (Admin/Ops/Profesores/Alumnos) y con la **búsqueda** (AND).
- [ ] El contador del encabezado refleja el resultado filtrado.

## 7. Rename de navegación
**Probar:**
- [ ] En el sidebar (ops), el ítem que lleva a "Gestión de lecciones" se llama **"Lecciones"** (antes "Subir videos"), con icono de lecciones.

---

## Casos borde / anti-bypass que QA puede intentar romper
- [ ] En el quiz, responder **una sola** pregunta de un set de N y enviar: la nota debe ser sobre **N** (no 100%). El cliente no controla el denominador.
- [ ] Respuesta corta: "  SANTIAGO " debe contar igual que "santiago" (normaliza mayúsculas/espacios/tildes); vacío cuenta incorrecto.
- [ ] Opción múltiple: marcar un **subconjunto** de las correctas NO aprueba (exige el set exacto).
- [ ] Doble-envío del mismo intento: el segundo da "ya fue enviado" (no re-puntúa).
- [ ] Un alumno NO puede ver/responder una evaluación de **otro programa** en el que no está matriculado.

## Migraciones aplicadas en prod (relacionadas)
`0033` evaluations · `0035` hardening (forma de respuesta, FK SET NULL, drop de quiz_configs) · `0036` índice de intento aprobado por evaluación.

## Estado de calidad
- `tsc` limpio · suite vitest verde (incluye tests de puntuación por tipo, validación de payload, anti-bypass del final y regresión del límite del certificado) · ESLint sin errores · build OK.
- **6 hallazgos** encontrados y corregidos en auditoría adversarial de esta entrega: contaminación final↔formativo por `program_id`, 4 puntos del límite del certificado (retry, página de certificado, reporte admin de intentos, guard central en `issueCertificate`), e índice de intento aprobado global → por evaluación.

## Gaps conocidos / fuera de alcance (no son bugs)
- **Quiz formativo no emite certificado** y **no bloquea el avance** (es práctica, por diseño v0).
- **Generación IA por lección/módulo**: aún no existe; la IA solo arma el pool del **examen final**. Las preguntas de los quizes por clase se cargan manualmente.
- **Respuesta corta** se corrige por coincidencia normalizada (no corrección manual / no NLP).
- **Opción múltiple**: sin puntuación parcial (set exacto).
- El recurso por **archivo** de una lección/clase requiere subir un archivo real (no cubierto en QA automatizado).
