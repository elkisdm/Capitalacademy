# PRD — Sistema de Certificacion con Quiz Final

> Product Requirements Document para el pipeline de evaluacion (quiz auto-generado por IA) y certificacion (PDF + verificacion publica) de Capital Academy.

- **Autor:** Equipo Capital Academy
- **Fecha:** 2026-05-27
- **Estado:** Draft
- **Dependencias:** Modulo Classroom (PRD-classroom), Transcripciones (ADR-0005), Tracking de progreso (ADR-0003)
- **ADRs relacionados:** [0001](adr/0001-mux-como-video-provider.md), [0003](adr/0003-tracking-progreso-video.md), [0005](adr/0005-ai-features-sobre-video.md), [0007](adr/0007-certificacion-y-quizzes.md)

---

## 1. Problema

Capital Academy imparte programas ejecutivos pagados (Diplomado en Ventas, Taller de Liderazgo, Ruta Inmobiliaria, Masterclass). Hoy el alumno completa lecciones de video pero:

1. **No hay evaluacion de comprension.** El progreso se basa exclusivamente en video visto (>= 90% = completado). Un alumno puede dejar el video corriendo sin prestar atencion y quedar como "completado".
2. **Los certificados se emiten manualmente.** Existe un script en el repo encuentrosmart (`scripts/send-masterclass-certificates.mts`) que genera PDFs con `pdf-lib` y los envia por Resend. Funciona, pero requiere que alguien corra el script desde terminal, y no hay registro en base de datos de los certificados emitidos.
3. **No hay verificacion publica.** Si un alumno comparte su certificado con un empleador, no hay forma de validar su autenticidad.
4. **Los requisitos varian por programa.** El Diplomado exige evaluacion; un taller puede exigir solo participacion; una masterclass emite certificado de asistencia sin evaluacion. No hay un sistema configurable.

## 2. Objetivo

Construir un pipeline automatizado de certificacion con dos componentes:

**A. Sistema de Quiz Final** — un quiz por programa, auto-generado desde las transcripciones de las lecciones via OpenAI, editable por el admin, con scoring instantaneo.

**B. Sistema de Certificacion** — generacion automatica de PDF personalizado, entrega por email, descarga desde la plataforma, y verificacion publica.

**Resultado esperado:** cuando un alumno completa el umbral de lecciones y aprueba el quiz, recibe automaticamente su certificado por email y puede descargarlo desde el classroom. Un tercero puede verificar el certificado en una URL publica.

## 3. No-scope (MVP)

- Quizzes por leccion individual (solo quiz final por programa).
- Preguntas abiertas o de desarrollo (solo seleccion multiple).
- Timer anti-trampas a nivel de pregunta (solo timer global opcional).
- Banco compartido de preguntas entre programas.
- Versionamiento de certificados (si se regenera, reemplaza el anterior).
- Certificados bilingues.
- Integracion con SENCE o sistemas de acreditacion externos.
- Firma digital del certificado (solo verificacion por codigo).
- Analytics avanzados de rendimiento por pregunta (solo score por intento).

## 4. Usuarios y roles

| Rol | Acciones |
|---|---|
| **Alumno** (student) | Ver estado de quiz (bloqueado/desbloqueado), rendir quiz, ver resultados y explicaciones, ver/descargar certificado |
| **Ops/Admin** (ops, admin) | Generar preguntas via IA, editar/agregar/eliminar preguntas, configurar umbrales, ver intentos de alumnos, emitir certificado manual, subir template de certificado |
| **Publico** (sin login) | Verificar autenticidad de certificado via URL publica |

---

## PARTE A: SISTEMA DE QUIZ

### 5. Pipeline de generacion de preguntas por IA

#### 5.1 Diagrama de flujo

```
Admin → /admin/programs/[programId]/quiz → "Generar preguntas"
  │
  ▼
POST /api/admin/generate-quiz { programId }
  │
  ├── Verificar que el programa tiene lecciones con transcripcion
  │   (lesson_transcripts.status = 'ready')
  │
  ├── Recopilar transcripciones de todas las lecciones del programa
  │   → Agrupar por modulo y leccion
  │   → Incluir titulo de leccion y modulo como contexto
  │
  ├── Distribuir preguntas proporcionalmente por leccion
  │   → Si hay 8 lecciones y se piden 16 preguntas: ~2 por leccion
  │   → Lecciones mas largas (mas contenido) pueden tener mas preguntas
  │
  ├── Enviar a OpenAI gpt-5.4-mini (JSON mode)
  │   → System prompt educativo (ver seccion 5.3)
  │   → User message: transcripciones concatenadas con delimitadores
  │
  ├── Parsear y validar respuesta JSON
  │   → Cada pregunta tiene: question_text, options (A-D), correct_option,
  │     explanation, source_lesson_id
  │
  └── Guardar en quiz_questions (is_generated = true)
      → Si ya existian preguntas generadas: reemplazar las generadas,
        preservar las manuales
```

#### 5.2 Input: preparacion de transcripciones

Para cada leccion del programa:

```typescript
interface LessonContext {
  lessonId: string;
  lessonTitle: string;
  moduleName: string;
  moduleOrder: number;
  lessonOrder: number;
  transcriptText: string;      // de lesson_transcripts.full_text
  wordCount: number;
}
```

Se concatenan todas las transcripciones con delimitadores claros:

```
--- MODULO 1: Fundamentos de Ventas Inmobiliarias ---

== Leccion 1: Introduccion al mercado inmobiliario chileno (lesson_id: xxx) ==
[transcripcion completa de la leccion...]

== Leccion 2: El ciclo de venta inmobiliaria (lesson_id: yyy) ==
[transcripcion completa de la leccion...]

--- MODULO 2: Tecnicas de Cierre ---

== Leccion 3: Cierre consultivo (lesson_id: zzz) ==
[transcripcion completa de la leccion...]
```

**Manejo de contexto largo:** gpt-5.4-mini tiene 400K tokens de contexto. Un programa con 20 lecciones de 45 minutos genera ~160K tokens de transcripcion. Cabe holgadamente. Si en el futuro hay programas con 50+ lecciones, se divide en chunks y se generan preguntas por chunk.

#### 5.3 System prompt para generacion de preguntas

```
Eres un evaluador academico para Capital Academy, una plataforma de educacion ejecutiva
en Chile especializada en el sector inmobiliario, liderazgo y negocios.

Tu tarea es generar preguntas de seleccion multiple a partir de las transcripciones de
las clases de un programa. Las preguntas deben evaluar COMPRENSION del contenido,
no memorizacion de datos puntuales.

Genera un JSON con la siguiente estructura:

{
  "questions": [
    {
      "question_text": "Enunciado claro y sin ambiguedad",
      "options": {
        "A": "Primera opcion",
        "B": "Segunda opcion",
        "C": "Tercera opcion",
        "D": "Cuarta opcion"
      },
      "correct_option": "B",
      "explanation": "Explicacion breve de por que B es correcta y las otras no",
      "source_lesson_id": "uuid-de-la-leccion-de-donde-viene-el-tema"
    }
  ]
}

Reglas:
1. Genera entre 15 y 20 preguntas. Distribuyelas proporcionalmente entre las lecciones.
2. Escribe en espanol neutro latinoamericano (sin jerga argentina ni peninsular).
3. Cada pregunta debe tener exactamente 4 opciones (A, B, C, D).
4. Solo UNA opcion es correcta por pregunta.
5. Las opciones incorrectas (distractores) deben ser plausibles — no absurdas ni
   obviamente falsas.
6. Prioriza preguntas que evaluen:
   - Comprension de conceptos (no definiciones textuales)
   - Aplicacion practica ("En esta situacion, que harias?")
   - Relacion entre conceptos de distintas lecciones
   - Analisis de escenarios del mercado inmobiliario chileno
7. Evita preguntas que se respondan con "buscar un numero" en la transcripcion
   (ej: "Cual fue el porcentaje mencionado en la clase 3?").
8. Si la transcripcion menciona regulaciones chilenas (Ley de Copropiedad, DFL-2,
   normativa CMF, Circular SBIF, etc.), incluye al menos 1-2 preguntas sobre el
   marco regulatorio.
9. La explicacion debe ser concisa (1-3 oraciones) y educativa — ayuda al alumno
   a entender, no solo a saber la respuesta correcta.
10. El campo source_lesson_id DEBE corresponder a un lesson_id real de los
    proporcionados en las transcripciones.
11. No inventes informacion. Si la transcripcion no cubre un tema, no preguntes
    sobre el.
```

#### 5.4 Manejo de la respuesta

1. Parsear JSON de OpenAI.
2. Validar estructura: array de 15-20 objetos con todos los campos requeridos.
3. Validar que cada `source_lesson_id` corresponde a una leccion real del programa.
4. Validar que `correct_option` es una de 'A', 'B', 'C', 'D'.
5. Validar que `options` tiene exactamente 4 keys.
6. Si hay preguntas generadas previas: eliminarlas (`DELETE WHERE program_id = $1 AND is_generated = true`). Las preguntas manuales (`is_generated = false`) se preservan.
7. Insertar nuevas preguntas con `is_generated = true` y `sort_order` secuencial.
8. Registrar `model_used`, `prompt_version`, timestamp de generacion en `quiz_configs`.

### 6. Configuracion del quiz

#### 6.1 Tabla `quiz_configs`

Una fila por programa. Define los parametros de evaluacion:

| Campo | Tipo | Default | Descripcion |
|---|---|---|---|
| `program_id` | uuid FK | — | Programa al que aplica (UNIQUE) |
| `min_completion_pct` | int | 80 | % de lecciones completadas para desbloquear quiz |
| `passing_grade_pct` | int | 70 | % minimo para aprobar |
| `questions_per_attempt` | int | 10 | Cuantas preguntas del pool se presentan por intento |
| `max_attempts` | int | 3 | Intentos maximos permitidos |
| `time_limit_minutes` | int | NULL | Limite de tiempo en minutos (NULL = sin limite) |
| `is_active` | boolean | false | Si el quiz esta habilitado para alumnos |

**`is_active`:** el admin genera preguntas, las revisa, y cuando esta satisfecho marca `is_active = true`. Hasta ese momento, el alumno no ve el quiz aunque cumpla el umbral de completacion.

#### 6.2 Restricciones de configuracion

- `questions_per_attempt` no puede ser mayor que el numero total de preguntas en el pool. Si hay 15 preguntas y `questions_per_attempt = 10`, funciona. Si hay 8 preguntas y `questions_per_attempt = 10`, el admin recibe un warning al intentar activar.
- `min_completion_pct` minimo 1, maximo 100.
- `passing_grade_pct` minimo 1, maximo 100.
- `max_attempts` minimo 1. Sin maximo teorico, pero la UI sugiere 1-5.

### 7. Flujo del alumno (quiz)

#### 7.1 Estados del quiz desde la perspectiva del alumno

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Estado 1: LOCKED                                       │
│  → completion_pct < min_completion_pct                  │
│  → UI: card con candado + barra de progreso             │
│    "Completa el 80% de las lecciones para desbloquear   │
│     el quiz final. Llevas 45%."                         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Estado 2: AVAILABLE                                    │
│  → completion_pct >= min_completion_pct                 │
│  → quiz_configs.is_active = true                        │
│  → attempts_used < max_attempts                         │
│  → no tiene intento passed = true                       │
│  → UI: boton "Iniciar Quiz Final"                       │
│    + info: "10 preguntas, 70% para aprobar"             │
│    + intentos restantes: "Intento 1 de 3"               │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Estado 3: IN_PROGRESS                                  │
│  → tiene un quiz_attempt sin completed_at               │
│  → UI: redirige al quiz en curso                        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Estado 4: FAILED (con intentos restantes)              │
│  → ultimo intento: passed = false                       │
│  → attempts_used < max_attempts                         │
│  → UI: resultado del ultimo intento + boton "Reintentar"│
│    "Obtuviste 60%. Necesitas 70%. Te quedan 2 intentos."│
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Estado 5: EXHAUSTED                                    │
│  → attempts_used >= max_attempts                        │
│  → ningun intento passed = true                         │
│  → UI: mensaje + contactar admin                        │
│    "Agotaste tus 3 intentos. Contacta al equipo         │
│     de Capital Academy para opciones adicionales."      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Estado 6: PASSED                                       │
│  → algun intento passed = true                          │
│  → UI: felicitacion + certificado (o "generando...")    │
│    "Aprobaste con 85%. Tu certificado esta en camino."  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Estado 7: NO_QUIZ                                      │
│  → quiz_configs.is_active = false o no existe           │
│  → UI: no se muestra la seccion de quiz                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 7.2 UI del quiz (durante el intento)

```
┌──────────────────────────────────────────────────────────┐
│  Quiz Final — Diplomado Ejecutivo en Ventas              │
│                                                          │
│  Pregunta 3 de 10          ██████░░░░░░░░░░ 30%          │
│                                     Tiempo: 12:34        │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │                                                    │  │
│  │  Un cliente potencial te dice que "necesita        │  │
│  │  pensarlo" despues de una visita a un              │  │
│  │  departamento que le gusto. Segun las tecnicas     │  │
│  │  de cierre consultivo vistas en el curso,          │  │
│  │  cual es la MEJOR respuesta?                       │  │
│  │                                                    │  │
│  │  ○ A) Ofrecerle un descuento inmediato para que    │  │
│  │       tome la decision ahora.                      │  │
│  │                                                    │  │
│  │  ● B) Validar su necesidad de reflexion y          │  │
│  │       programar un seguimiento con informacion     │  │
│  │       adicional relevante.                         │  │
│  │                                                    │  │
│  │  ○ C) Mostrarle otros departamentos disponibles    │  │
│  │       para generar urgencia por comparacion.       │  │
│  │                                                    │  │
│  │  ○ D) Enviarle un mensaje al dia siguiente para    │  │
│  │       preguntar si ya se decidio.                  │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  [← Anterior]                           [Siguiente →]    │
│                                                          │
│  Al final: [Enviar respuestas]                           │
└──────────────────────────────────────────────────────────┘
```

**Comportamiento de la UI:**

- Una pregunta a la vez con navegacion anterior/siguiente.
- Barra de progreso visual (pregunta X de N).
- Timer visible si `time_limit_minutes` esta configurado.
- El alumno puede navegar libremente entre preguntas antes de enviar.
- Al presionar "Enviar respuestas", dialogo de confirmacion: "Tienes 2 preguntas sin responder. Enviar de todas formas?"
- Preguntas sin responder se contabilizan como incorrectas.
- Si el timer llega a 0: auto-submit con las respuestas que tenga hasta ese momento.

#### 7.3 Pantalla de resultados

```
┌──────────────────────────────────────────────────────────┐
│  Resultado del Quiz                                      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │         ✓ Aprobado — 80%                           │  │
│  │         8 de 10 correctas                          │  │
│  │         Minimo requerido: 70%                      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Revision de respuestas:                                 │
│                                                          │
│  1. ✓ Un cliente potencial te dice que...               │
│     Tu respuesta: B) Validar su necesidad...            │
│     → Correcto. El cierre consultivo prioriza...        │
│                                                          │
│  2. ✗ Segun la Ley de Copropiedad Inmobiliaria...      │
│     Tu respuesta: A) El administrador puede...          │
│     Correcta: C) La asamblea de copropietarios...       │
│     → La Ley 21.442 establece que las decisiones...     │
│     📖 Leccion: "Marco legal inmobiliario" (Modulo 2)   │
│                                                          │
│  3. ✓ ...                                               │
│                                                          │
│  [Volver al classroom]                                   │
│                                                          │
│  --- Si aprobo: ---                                      │
│  Tu certificado se esta generando y lo recibiras por     │
│  email en los proximos minutos.                          │
│                                                          │
│  --- Si reprobo: ---                                     │
│  No alcanzaste el 70% minimo. Te quedan 2 intentos.     │
│  Revisa las explicaciones y vuelve a intentar.           │
│  [Reintentar quiz]                                       │
└──────────────────────────────────────────────────────────┘
```

**Despues de enviar, se muestran:**
- Score global (correctas / total, porcentaje).
- Cada pregunta con: tu respuesta, la respuesta correcta (si fallaste), y la explicacion.
- Si la pregunta tiene `lesson_id`, link a la leccion de origen para que el alumno repase.

### 8. Modelo de datos (Quiz)

#### 8.1 Tabla `quiz_configs`

```sql
CREATE TABLE public.quiz_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  min_completion_pct int NOT NULL DEFAULT 80
    CHECK (min_completion_pct BETWEEN 1 AND 100),
  passing_grade_pct int NOT NULL DEFAULT 70
    CHECK (passing_grade_pct BETWEEN 1 AND 100),
  questions_per_attempt int NOT NULL DEFAULT 10
    CHECK (questions_per_attempt >= 1),
  max_attempts int NOT NULL DEFAULT 3
    CHECK (max_attempts >= 1),
  time_limit_minutes int,
  is_active boolean NOT NULL DEFAULT false,
  -- Metadata de generacion
  last_generated_at timestamptz,
  model_used text,
  prompt_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id)
);
```

#### 8.2 Tabla `quiz_questions`

```sql
CREATE TABLE public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  question_text text NOT NULL,
  options jsonb NOT NULL,
    -- {"A": "texto opcion A", "B": "texto opcion B", "C": "...", "D": "..."}
  correct_option text NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  explanation text,
  is_generated boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_questions_program ON public.quiz_questions(program_id);
CREATE INDEX idx_quiz_questions_lesson ON public.quiz_questions(lesson_id);
```

**Nota sobre `options` JSONB:** se usa un objeto con keys A-D en vez de un array para que el `correct_option` sea un identificador estable. Si se usara un array y se reordena, el indice correcto cambiaria.

#### 8.3 Tabla `quiz_attempts`

```sql
CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  questions_presented jsonb NOT NULL,
    -- ["question_id_1", "question_id_2", ...] en orden de presentacion
  answers jsonb NOT NULL DEFAULT '{}',
    -- {"question_id_1": "A", "question_id_2": "C", ...}
  score_pct numeric(5,2),
  total_correct int,
  total_questions int,
  passed boolean,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_attempts_enrollment ON public.quiz_attempts(enrollment_id);
CREATE INDEX idx_quiz_attempts_program ON public.quiz_attempts(program_id, enrollment_id);
```

**`questions_presented`:** almacena los IDs de las preguntas que se le mostraron a este alumno en este intento. Esto permite:
- Reconstruir el quiz exacto que vio (incluso si el pool cambia despues).
- Calcular el score correctamente contra las respuestas correctas de esas preguntas.

**`answers`:** mapa de question_id → opcion seleccionada. Si el alumno no respondio una pregunta, no aparece en el mapa (se cuenta como incorrecta al calcular score).

### 9. API Routes (Quiz)

#### 9.1 `POST /api/admin/generate-quiz`

**Acceso:** solo admin/ops.

**Request:**
```json
{
  "programId": "uuid"
}
```

**Flujo:**
1. Verificar rol admin/ops.
2. Verificar que el programa existe y tiene lecciones con transcripcion ready.
3. Recopilar transcripciones de todas las lecciones.
4. Construir el input para OpenAI (transcripciones concatenadas con contexto).
5. Llamar a OpenAI con system prompt de generacion de preguntas.
6. Parsear y validar la respuesta.
7. Eliminar preguntas generadas previas (preservar manuales).
8. Insertar nuevas preguntas.
9. Actualizar `quiz_configs.last_generated_at`, `model_used`, `prompt_version`.
10. Retornar las preguntas generadas.

**Response (200):**
```json
{
  "questionsGenerated": 18,
  "questionsPreserved": 3,
  "modelUsed": "gpt-5.4-mini",
  "promptVersion": "v1",
  "questions": [...]
}
```

**Errores:**
| Codigo | Caso |
|---|---|
| 401 | No autenticado |
| 403 | No es admin/ops |
| 404 | Programa no existe |
| 422 | Programa sin lecciones con transcripcion, o transcripciones insuficientes (<3 lecciones) |
| 429 | Rate limit de OpenAI |
| 500 | Error de OpenAI o error interno |

#### 9.2 `GET /api/classroom/quiz?programId=xxx`

**Acceso:** alumno con enrollment activo en el programa.

**Logica:**
1. Verificar que el alumno tiene enrollment activo en el programa.
2. Obtener `quiz_configs` para el programa.
3. Si no existe o `is_active = false` → retornar `{ status: "no_quiz" }`.
4. Calcular `completion_pct` del alumno (lecciones completadas / total).
5. Contar intentos usados.
6. Determinar estado (LOCKED, AVAILABLE, FAILED, EXHAUSTED, PASSED).
7. Si estado = AVAILABLE y el alumno no tiene intento en curso:
   - NO enviar preguntas todavia (se envian al iniciar el intento).
8. Si estado = IN_PROGRESS:
   - Enviar las preguntas del intento en curso (sin `correct_option` ni `explanation`).

**Response (200):**
```json
{
  "status": "available",
  "config": {
    "questionsPerAttempt": 10,
    "passingGradePct": 70,
    "timeLimitMinutes": null,
    "maxAttempts": 3
  },
  "completionPct": 85,
  "attemptsUsed": 0,
  "attemptsRemaining": 3,
  "lastAttempt": null
}
```

#### 9.3 `POST /api/classroom/quiz/start`

**Acceso:** alumno con enrollment activo.

**Request:**
```json
{
  "programId": "uuid"
}
```

**Flujo:**
1. Verificar precondiciones: enrollment activo, quiz activo, completion >= threshold, intentos restantes, no tiene intento en curso.
2. Seleccionar N preguntas aleatorias del pool (`questions_per_attempt`).
3. Crear registro en `quiz_attempts` con `questions_presented` y `started_at`.
4. Retornar las preguntas SIN `correct_option` ni `explanation`.

**Response (200):**
```json
{
  "attemptId": "uuid",
  "questions": [
    {
      "id": "uuid",
      "questionText": "...",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." }
    }
  ],
  "timeLimitMinutes": null,
  "startedAt": "2026-05-27T10:30:00Z"
}
```

**Nota de seguridad:** las preguntas se envian al cliente sin la respuesta correcta. El scoring se hace 100% server-side en el endpoint de submit.

#### 9.4 `POST /api/classroom/quiz/submit`

**Acceso:** alumno con enrollment activo.

**Request:**
```json
{
  "attemptId": "uuid",
  "answers": {
    "question_id_1": "B",
    "question_id_2": "A",
    "question_id_3": "D"
  }
}
```

**Flujo:**
1. Verificar que el `attemptId` pertenece al alumno y no tiene `completed_at`.
2. Si hay `time_limit_minutes`, verificar que no excedio el tiempo.
3. Cargar las preguntas presentadas con sus respuestas correctas.
4. Calcular score:
   ```
   total_correct = count(answers[q.id] === q.correct_option for q in questions_presented)
   score_pct = total_correct / total_questions * 100
   passed = score_pct >= passing_grade_pct
   ```
5. Actualizar `quiz_attempts`: `answers`, `score_pct`, `total_correct`, `total_questions`, `passed`, `completed_at`.
6. Si `passed = true` → **disparar generacion de certificado** (async, no bloquea la respuesta).
7. Retornar resultado con explicaciones.

**Response (200):**
```json
{
  "attemptId": "uuid",
  "scorePct": 80,
  "totalCorrect": 8,
  "totalQuestions": 10,
  "passed": true,
  "results": [
    {
      "questionId": "uuid",
      "questionText": "...",
      "yourAnswer": "B",
      "correctAnswer": "B",
      "isCorrect": true,
      "explanation": "...",
      "lessonTitle": "Tecnicas de cierre",
      "lessonId": "uuid"
    }
  ],
  "certificateStatus": "generating"
}
```

---

## PARTE B: SISTEMA DE CERTIFICACION

### 10. Pipeline de generacion de certificado

#### 10.1 Diagrama de flujo

```
Alumno aprueba quiz (passed = true en POST /api/classroom/quiz/submit)
  │
  ▼
Trigger asincrono: generateCertificate(enrollmentId, quizAttemptId)
  │
  ├── Obtener datos del alumno (profiles.full_name)
  │   → Normalizar nombre (capitalizacion inteligente)
  │
  ├── Obtener template del programa (certificate_templates)
  │   → Descargar PNG desde Supabase Storage
  │   → Leer configuracion de posicion, fuente, tamaño
  │
  ├── Cargar fuente Allura (o la configurada en el template)
  │
  ├── Generar PDF con pdf-lib:
  │   → Crear documento PDF
  │   → Registrar fontkit
  │   → Embeber PNG como fondo
  │   → Calcular tamaño de fuente (auto-sizing)
  │   → Dibujar nombre centrado
  │   → Guardar como Uint8Array
  │
  ├── Generar codigo de verificacion unico
  │   → 8 caracteres alfanumericos (sin ambiguos: 0/O, 1/I/l)
  │   → Verificar unicidad en DB (retry si colision)
  │
  ├── Subir PDF a Supabase Storage
  │   → Bucket: "certificates"
  │   → Path: "certificates/{enrollment_id}-{verification_code}.pdf"
  │
  ├── Insertar registro en tabla certificates
  │
  └── Enviar email via Resend
      → Template React (lib/email/certificate-email.tsx)
      → PDF adjunto
      → Enlace a pagina de verificacion
      → Enlace a descarga desde classroom
```

#### 10.2 Generacion del PDF (port de encuentrosmart)

El codigo se porta de `encuentrosmart/scripts/lib/certificate-pdf.mts` a `lib/certificates/generate-pdf.ts` con las siguientes adaptaciones:

**Original (encuentrosmart):**
- Template fijo: `template cert.png` (2000x1414)
- Fuente fija: `Allura-Regular.ttf`
- Coordenadas fijas: `NAME_CENTER_X = 1000`, `NAME_BASELINE_Y = 760`
- Font size: 130 default, 70 min
- Max name width: 1100

**Adaptado (Capital Academy):**
- Template dinamico: cargado desde `certificate_templates.template_png_path` en Supabase Storage
- Fuente configurable: `certificate_templates.font_family` + `font_path`
- Coordenadas configurables: `name_center_x`, `name_baseline_y`, `default_font_size`, `min_font_size`, `max_name_width`
- Color configurable: `name_color_hex`

```typescript
// lib/certificates/generate-pdf.ts

interface CertificateTemplateConfig {
  templatePngBytes: Buffer;
  fontBytes: Buffer;
  nameCenterX: number;
  nameBaselineY: number;
  defaultFontSize: number;
  minFontSize: number;
  maxNameWidth: number;
  nameColorHex: string;
}

interface CertificateInput {
  fullName: string;
  templateConfig: CertificateTemplateConfig;
}

export async function generateCertificatePdf(
  input: CertificateInput
): Promise<Uint8Array> {
  // Misma logica que certificate-pdf.mts pero con config dinamica
  // ...
}
```

**Normalizacion de nombre:** se porta la funcion `normalizeName()` de encuentrosmart que maneja:
- Capitalizacion inteligente: "martin travella" → "Martin Travella"
- Conectores en minuscula: "Rosicela del Valle Fernandez" (no "Del")
- Conectores reconocidos: de, del, la, las, los, y, da, do, dos, das, von, van, della, di, le

#### 10.3 Codigo de verificacion

```typescript
// lib/certificates/verification.ts

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// Excluye: 0 (confunde con O), 1 (confunde con I/l)
// Solo mayusculas + numeros no ambiguos = 32 chars
// 32^8 = ~1.1 trillones de combinaciones

export function generateVerificationCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes)
    .map(b => CHARSET[b % CHARSET.length])
    .join("");
}
```

Formato del codigo: `A3K9-M2X7` (con guion visual en la UI para legibilidad, almacenado sin guion en DB).

### 11. Templates de certificado

#### 11.1 Tabla `certificate_templates`

```sql
CREATE TABLE public.certificate_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  template_png_path text NOT NULL,
    -- Ruta en Supabase Storage: "certificate-templates/diplomado-ventas-2026.png"
  font_family text NOT NULL DEFAULT 'Allura',
  font_path text NOT NULL DEFAULT 'assets/fonts/Allura-Regular.ttf',
  name_center_x int NOT NULL DEFAULT 1000,
  name_baseline_y int NOT NULL DEFAULT 760,
  default_font_size int NOT NULL DEFAULT 130,
  min_font_size int NOT NULL DEFAULT 70,
  max_name_width int NOT NULL DEFAULT 1100,
  name_color_hex text NOT NULL DEFAULT '#000000',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id)
);
```

#### 11.2 Flujo de administracion de templates

```
Admin → /admin/programs/[programId]/certificate
  │
  ├── Upload de template PNG (drag & drop)
  │   → Se sube a Supabase Storage bucket "certificate-templates"
  │   → Se crea/actualiza registro en certificate_templates
  │
  ├── Configurar coordenadas del nombre
  │   → Campos: center_x, baseline_y, font_size, min_font_size, max_width, color
  │   → Opcion avanzada: mover coordenadas con sliders o click en preview
  │
  └── Preview
      → El admin escribe un nombre de prueba
      → Se genera un PDF de preview en tiempo real
      → Se muestra en la misma pagina (iframe o embed)
```

**Template por defecto:** se migra el template PNG actual de encuentrosmart (`template cert.png`) como template del programa "Workshop" / "Masterclass". Cada nuevo programa requiere su propio template.

### 12. Tabla `certificates`

```sql
CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  quiz_attempt_id uuid REFERENCES public.quiz_attempts(id) ON DELETE SET NULL,
    -- NULL si es emision manual (asistencia presencial)
  student_name text NOT NULL,
    -- Nombre normalizado tal como aparece en el PDF
  verification_code text NOT NULL UNIQUE,
  pdf_storage_path text NOT NULL,
    -- "certificates/{enrollment_id}-{code}.pdf"
  pdf_url text,
    -- URL firmada (se regenera al acceder, expira en 1h)
  emailed_at timestamptz,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    -- NULL si fue automatico; user_id si fue manual
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id)
);

CREATE INDEX idx_certificates_verification ON public.certificates(verification_code);
CREATE INDEX idx_certificates_program ON public.certificates(program_id);
```

**`quiz_attempt_id` nullable:** permite emision manual de certificados (por ejemplo, para asistentes presenciales que no usaron la plataforma). En ese caso, `issued_by` contiene el ID del admin que lo emitio.

**`UNIQUE (enrollment_id)`:** un alumno tiene maximo un certificado por enrollment. Si se necesita regenerar, se reemplaza el existente (update, no insert).

### 13. Entrega del certificado

#### 13.1 Email via Resend

Se crea un template React en `lib/email/certificate-email.tsx` basado en el template existente de encuentrosmart (`masterclass-certificate.tsx`), adaptado:

- Asunto: "Tu certificado de {nombre_programa} — Capital Academy"
- Cuerpo: felicitacion + nota de score + enlace a verificacion + PDF adjunto
- Logo embebido via CID (patron existente)
- CTA primario: "Ver tu certificado" → link a `/classroom` donde puede descargarlo
- CTA secundario: "Comparte en LinkedIn" → deep link a LinkedIn share
- Footer: enlace de verificacion publica

#### 13.2 Descarga desde classroom

En la vista del programa (o en una seccion dedicada "Mi Certificado"):

```
┌──────────────────────────────────────────────────────────┐
│  Certificado                                             │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │                                                    │  │
│  │  [Preview thumbnail del certificado PDF]           │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Emitido: 27 de mayo de 2026                             │
│  Codigo de verificacion: A3K9-M2X7                       │
│                                                          │
│  [Descargar PDF]  [Compartir en LinkedIn]                │
│                                                          │
│  Verifica este certificado en:                           │
│  https://capitalacademy.cl/verificar/A3K9M2X7            │
└──────────────────────────────────────────────────────────┘
```

La URL de descarga del PDF es una URL firmada de Supabase Storage (expira en 1 hora, se regenera al cargar la pagina).

#### 13.3 Verificacion publica

**Ruta:** `/verificar/{code}` (app route group `(public)`, sin requerir login).

```
┌──────────────────────────────────────────────────────────┐
│  Capital Academy — Verificacion de Certificado           │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  ✓ Certificado verificado                          │  │
│  │                                                    │  │
│  │  Nombre:    Maria Lopez Gonzalez                   │  │
│  │  Programa:  Diplomado Ejecutivo en Ventas          │  │
│  │             Inmobiliarias 2S-2026                   │  │
│  │  Emitido:   27 de mayo de 2026                     │  │
│  │  Codigo:    A3K9-M2X7                              │  │
│  │                                                    │  │
│  │  Capital Academy certifica que la persona indicada │  │
│  │  aprobo satisfactoriamente el programa mencionado. │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Este certificado fue emitido por Capital Academy.       │
│  capitalacademy.cl                                       │
└──────────────────────────────────────────────────────────┘
```

Si el codigo no existe:

```
┌──────────────────────────────────────────────────────────┐
│  Capital Academy — Verificacion de Certificado           │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  ✗ Certificado no encontrado                       │  │
│  │                                                    │  │
│  │  El codigo ingresado no corresponde a ningun       │  │
│  │  certificado emitido por Capital Academy.          │  │
│  │                                                    │  │
│  │  Si crees que esto es un error, contacta a         │  │
│  │  soporte@capitalacademy.cl                         │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 14. API Routes (Certificados)

#### 14.1 `GET /api/classroom/certificate?enrollmentId=xxx`

**Acceso:** alumno con enrollment activo + admin/ops.

**Response (200):**
```json
{
  "certificate": {
    "id": "uuid",
    "studentName": "Maria Lopez Gonzalez",
    "verificationCode": "A3K9M2X7",
    "pdfUrl": "https://...supabase.co/storage/v1/object/sign/certificates/...",
    "issuedAt": "2026-05-27T15:30:00Z",
    "emailedAt": "2026-05-27T15:31:00Z"
  }
}
```

Si no hay certificado: `{ "certificate": null }`.

#### 14.2 `GET /api/verify/{code}`

**Acceso:** publico (sin autenticacion).

**Response (200):**
```json
{
  "valid": true,
  "studentName": "Maria Lopez Gonzalez",
  "programName": "Diplomado Ejecutivo en Ventas Inmobiliarias",
  "issuedAt": "2026-05-27T15:30:00Z",
  "verificationCode": "A3K9M2X7"
}
```

**Response (404):**
```json
{
  "valid": false,
  "message": "Certificado no encontrado"
}
```

**Nota:** NO se expone el PDF en la verificacion publica. Solo se confirma la existencia y datos basicos.

#### 14.3 `POST /api/admin/issue-certificate`

**Acceso:** solo admin/ops.

**Request:**
```json
{
  "enrollmentId": "uuid",
  "skipQuiz": true
}
```

**Uso:** emision manual de certificado para asistentes presenciales o casos excepcionales donde el admin decide otorgar el certificado sin quiz.

**Flujo:**
1. Verificar que el enrollment existe y no tiene certificado.
2. Generar certificado con el mismo pipeline (PDF, codigo, email).
3. `quiz_attempt_id = null`, `issued_by = admin.id`.

### 15. Estimacion de costos

#### 15.1 OpenAI (generacion de preguntas)

| Concepto | Valor |
|---|---|
| Input: transcripciones de 10 lecciones (~80K tokens) + prompt (~800 tokens) | ~80,800 tokens |
| Output: 18 preguntas con explicaciones (~3,000 tokens) | ~3,000 tokens |
| Costo por generacion (gpt-5.4-mini) | ~$0.07 USD |
| Regeneraciones estimadas por programa (3-5 iteraciones) | ~$0.35 USD |
| Costo total para 5 programas | ~$1.75 USD |

#### 15.2 Supabase Storage

| Concepto | Valor |
|---|---|
| Tamaño promedio de PDF de certificado | ~800 KB |
| Templates PNG | ~2 MB cada uno |
| 200 certificados emitidos/año | ~160 MB |
| Costo en tier free de Supabase | $0 (1 GB incluido) |

#### 15.3 Resend (emails de certificado)

| Concepto | Valor |
|---|---|
| Emails de certificado por año | ~200 |
| Tier free de Resend | 3,000 emails/mes |
| Costo adicional | $0 |

#### 15.4 Conclusion

El costo total del sistema de certificacion es despreciable: < $2 USD/año en OpenAI, $0 en storage y email. No requiere presupuesto adicional.

### 16. Edge Cases

| Caso | Manejo |
|---|---|
| **Alumno completo lecciones pero no existe quiz** (admin no lo ha creado) | El alumno ve un mensaje: "El quiz final de este programa esta en preparacion. Te notificaremos cuando este disponible." No se muestra seccion de quiz. |
| **Admin regenera preguntas cuando hay intentos existentes** | Los intentos existentes NO se eliminan. Las preguntas respondidas se conservan con su `correct_option` original (almacenado en el intento). Las nuevas preguntas aplican solo a intentos futuros. Warning al admin: "Hay X intentos registrados. Las nuevas preguntas aplican solo a futuros intentos." |
| **Certificado para asistente presencial (sin video, sin quiz)** | Endpoint `POST /api/admin/issue-certificate` con `skipQuiz: true`. El admin puede emitir certificado manualmente. `quiz_attempt_id = null`. |
| **Multiples programas — cada uno con su quiz y template** | Cada programa tiene su `quiz_configs`, `quiz_questions` y `certificate_templates` independientes. Un alumno puede tener certificados de multiples programas. |
| **Alumno cambia de nombre despues de emitir certificado** | El certificado almacena `student_name` como snapshot al momento de emision. Si el alumno actualiza su perfil, el certificado existente NO se actualiza automaticamente. El admin puede regenerar manualmente. |
| **Timer expira mientras el alumno responde** | Auto-submit con las respuestas que tenga. Preguntas sin respuesta cuentan como incorrectas. Se registra `completed_at = started_at + time_limit_minutes`. |
| **Alumno intenta submit despues de que el intento ya fue completado** | El endpoint verifica `completed_at IS NULL`. Si ya tiene valor, retorna 409 Conflict. |
| **Pool de preguntas muy pequeno** | Si `questions_per_attempt > count(quiz_questions)`, el admin recibe un warning al activar el quiz. Se sugiere generar mas preguntas o reducir `questions_per_attempt`. |
| **Colision de codigo de verificacion** | Probabilidad: 1 en 1.1 trillones. Se maneja con retry: generar nuevo codigo si `INSERT` falla por UNIQUE constraint. Maximo 3 reintentos. |
| **Supabase Storage no disponible al generar certificado** | La generacion del PDF es en memoria (pdf-lib). Si el upload a Storage falla, se registra `certificates.pdf_storage_path = null` y se reintenta en el proximo acceso. El email se envia con el PDF adjunto directamente (no depende de Storage). |
| **Email de certificado no se envia (Resend falla)** | Se registra `emailed_at = null`. El alumno puede descargar el PDF desde la plataforma. Un cron o proceso manual reintenta emails pendientes. |
| **Alumno tiene enrollment en dos cohortes del mismo programa** | `UNIQUE (enrollment_id)` en `certificates` permite un certificado por enrollment. Si tiene dos enrollments, puede tener dos certificados. En la practica, un alumno no deberia tener dos enrollments activos en el mismo programa (logica de negocio, no constraint de DB). |

### 17. Seguridad

| Vector | Mitigacion |
|---|---|
| Alumno intenta ver respuestas correctas del quiz | Las preguntas se sirven via API sin `correct_option` ni `explanation`. El scoring es 100% server-side. El alumno nunca recibe las respuestas correctas hasta despues de enviar. |
| Alumno intenta enviar respuestas multiples veces | El endpoint verifica `completed_at IS NULL`. Un intento completado no se puede re-enviar. |
| Alumno intenta iniciar mas intentos de los permitidos | Se cuenta `quiz_attempts WHERE enrollment_id = X AND program_id = Y AND completed_at IS NOT NULL`. Si >= `max_attempts`, se rechaza. |
| Manipulacion del timer client-side | El timer es informativo en el cliente. La validacion real es server-side: `now() - started_at > time_limit_minutes`. Si se excede, se rechazan las respuestas o se hace auto-submit. |
| Falsificacion de certificado PDF | Cada certificado tiene un codigo de verificacion unico. La pagina publica `/verificar/{code}` permite validar contra la base de datos. |
| Acceso no autorizado a PDFs en Storage | Bucket `certificates` con politicas RLS: solo el alumno dueno + staff pueden generar URLs firmadas. Las URLs expiran en 1 hora. |
| API key de OpenAI expuesta | Se almacena en variable de entorno, llamada solo server-side. Mismo patron que resumenes (ADR-0005). |
| Admin no autorizado emite certificados masivos | Rate limit: maximo 50 emisiones manuales por admin por hora. Log de auditoria con `issued_by`. |

### 18. Implementacion por fases

#### Fase 1 — Quiz backend + modelo de datos
- Migracion SQL: crear tablas `quiz_configs`, `quiz_questions`, `quiz_attempts`.
- System prompt versionado: `lib/ai/prompts/quiz-generation.ts`.
- Servicio de generacion de preguntas: `lib/quiz/generate-questions.ts`.
- API route `POST /api/admin/generate-quiz`.
- API route `GET /api/admin/quiz/[programId]`.
- API route `PATCH /api/admin/quiz/questions`.

#### Fase 2 — Quiz frontend (admin)
- Pagina admin: `/admin/programs/[programId]/quiz`.
- UI de configuracion de quiz (umbrales, intentos, timer).
- UI de preguntas: lista editable, agregar/eliminar, drag-to-reorder.
- Boton "Generar preguntas" con estado de carga.
- Preview de pregunta individual.

#### Fase 3 — Quiz frontend (alumno)
- Componente `<QuizSection />` en la vista del programa.
- Estados: locked, available, in_progress, failed, exhausted, passed.
- UI del quiz: una pregunta a la vez, navegacion, timer, submit.
- UI de resultados: score, revision con explicaciones.
- API routes `GET /api/classroom/quiz`, `POST /api/classroom/quiz/start`, `POST /api/classroom/quiz/submit`.

#### Fase 4 — Certificado backend
- Migracion SQL: crear tablas `certificate_templates`, `certificates`.
- Crear bucket `certificates` en Supabase Storage con politicas.
- Port de `certificate-pdf.mts`: `lib/certificates/generate-pdf.ts`.
- Generacion de codigo de verificacion: `lib/certificates/verification.ts`.
- Normalizacion de nombre: `lib/certificates/normalize-name.ts`.
- Trigger de generacion despues de quiz aprobado.
- API route `GET /api/classroom/certificate`.
- API route `POST /api/admin/issue-certificate`.

#### Fase 5 — Certificado frontend + entrega
- Template de email React: `lib/email/certificate-email.tsx`.
- Envio via Resend con PDF adjunto.
- UI de descarga en classroom.
- Pagina publica `/verificar/[code]`.
- UI admin para subir templates y previsualizar.
- API route `GET /api/verify/[code]`.

#### Fase 6 — Polish y automatizacion
- Cron para reintentar emails de certificado fallidos.
- Dashboard admin: alumnos con quiz pendiente, certificados emitidos, tasa de aprobacion.
- Regeneracion masiva de preguntas cuando se actualiza el prompt.
- Exportacion de certificados emitidos a CSV.

### 19. Metricas de exito

| Metrica | Target | Como se mide |
|---|---|---|
| Tasa de aprobacion del quiz | 70-85% al primer intento | `quiz_attempts WHERE passed = true AND attempt_number = 1` / total primeros intentos |
| Cobertura de preguntas | >= 80% de lecciones tienen al menos 1 pregunta | Lecciones con `quiz_questions.lesson_id` / total lecciones del programa |
| Calidad de preguntas | < 20% de preguntas editadas por admin | `quiz_questions WHERE is_generated = true AND updated_at > created_at` / total generadas |
| Certificados emitidos | 90% de alumnos que completan lecciones obtienen certificado | `certificates` / `enrollments WHERE completion >= threshold` |
| Tiempo promedio de certificacion | < 5 minutos desde que aprueba hasta que recibe email | `certificates.emailed_at` - `quiz_attempts.completed_at` |
| Uso de verificacion publica | > 10 verificaciones/mes | Hits a `/api/verify/[code]` |

### 20. Dependencias y prerequisitos

| Dependencia | Estado | Bloqueante |
|---|---|---|
| Modulo Classroom con tracking de progreso | Implementado | Si (Gate 1) |
| Transcripciones de lecciones (ADR-0005) | Implementado | Si (generacion de preguntas) |
| Cuenta OpenAI con API key | Configurado | Si (generacion de preguntas) |
| Resend configurado | Implementado | Si (envio de email) |
| Supabase Storage | Disponible | Si (almacenamiento de PDFs) |
| Paquete `pdf-lib` + `@pdf-lib/fontkit` | Por instalar | Si (generacion de PDF) |
| Fuente Allura TTF | Disponible en encuentrosmart | Si (tipografia del certificado) |
| Template PNG del certificado | Disponible en encuentrosmart | Si (template por defecto) |
| Flujo de onboarding con nombre completo (ADR-0006) | Propuesto | Si (nombre para certificado) |

### 21. Preguntas abiertas

| # | Pregunta | Impacto | Decisor |
|---|---|---|---|
| 1 | Si un alumno agota sus intentos de quiz, puede solicitar intentos adicionales, o debe hablar con soporte? | UX, soporte | Producto |
| 2 | Se debe notificar al admin cuando un alumno aprueba/reprueba el quiz? | Ops, notificaciones | Ops |
| 3 | Los certificados deben incluir la fecha del programa (cohorte) ademas de la fecha de emision? | Diseño del template | Producto |
| 4 | Se quiere un ranking o leaderboard de scores del quiz por cohorte? | Gamificacion, UX | Producto |
| 5 | Los programas de tipo "Masterclass" (presencial, sin video) deben usar este mismo sistema o mantener el script actual de encuentrosmart? | Alcance, migracion | Producto |
| 6 | Se necesita exportar los resultados del quiz en formato compatible con SENCE u otra entidad? | Compliance, formato | Legal/Ops |
| 7 | El certificado PDF debe incluir un QR code con el enlace de verificacion ademas del codigo alfanumerico? | Diseño, UX | Producto |
