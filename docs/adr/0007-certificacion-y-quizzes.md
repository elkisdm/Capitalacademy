# ADR-0007: Pipeline de certificacion con quiz final y generacion de PDF

- **Status:** proposed
- **Date:** 2026-05-27
- **Deciders:** Eduardo Daza, Equipo tecnico Capital Academy
- **Tags:** classroom, certification, quiz, ai, pdf

## Contexto

Capital Academy necesita emitir certificados de aprobacion para sus programas formativos (Diplomado, Taller de Liderazgo, Ruta Inmobiliaria, Masterclass). Hoy la situacion es:

1. **No hay evaluacion formal.** El alumno completa las lecciones de video (tracking de progreso en `video_progress` — [ADR-0003](0003-tracking-progreso-video.md)) pero no se valida que haya comprendido el contenido. Un alumno puede ver los videos en segundo plano y quedar como "completado".
2. **Los certificados se generan manualmente.** En el proyecto encuentrosmart, hay un script (`scripts/send-masterclass-certificates.mts`) que genera PDFs con `pdf-lib` superponiendo el nombre sobre un template PNG, y los envia por Resend. Funciona, pero es un proceso manual por script — no hay UI, no hay automatizacion, y no hay registro en base de datos.
3. **Cada programa tiene requisitos distintos.** El Diplomado Ejecutivo en Ventas requiere un minimo de asistencia + evaluacion. Los talleres pueden requerir solo asistencia. Las masterclass emiten certificado de participacion sin evaluacion. No hay un sistema configurable por programa.
4. **Las transcripciones ya existen.** Mux genera captions automaticos para cada video ([ADR-0005](0005-ai-features-sobre-video.md)), y esas transcripciones se almacenan en `lesson_transcripts`. Este contenido es la materia prima ideal para generar preguntas de evaluacion con IA.

### Referencia: sistema de certificados en encuentrosmart

El codigo existente que se portara:

- **`scripts/lib/certificate-pdf.mts`**: genera un PDF de certificado usando `pdf-lib` + `@pdf-lib/fontkit`.
- Template PNG de 2000x1414 px (A4 horizontal a ~170 dpi).
- Fuente Allura (cursiva) para el nombre del alumno.
- Auto-sizing: 130px por defecto, baja hasta 70px para nombres largos, con ancho maximo de 1100px.
- Centrado horizontal automatico.
- Normalizacion de nombre (capitalizacion inteligente respetando conectores como "de", "del", "la").

- **`scripts/send-masterclass-certificates.mts`**: genera y envia masivamente via Resend con el PDF adjunto.
- Template de email React en `src/lib/resend/templates/masterclass-certificate.tsx`.
- Logo embebido via CID para evitar bloqueo de imagenes remotas.

### Restricciones

- **OpenAI ya esta integrado** para resumenes de leccion ([ADR-0005](0005-ai-features-sobre-video.md)). Se usa `gpt-5.4-mini`.
- **Resend ya esta configurado** en `lib/resend/client.ts` con templates React.
- **Supabase Storage esta disponible** para almacenar PDFs generados.
- **El tracking de progreso de video es confiable** — `video_progress.completed = true` cuando `watch_percentage >= 90%` ([ADR-0003](0003-tracking-progreso-video.md)).
- **No existe sistema de evaluaciones en la plataforma.** Este ADR introduce el primero.

## Decision

Implementar un **pipeline de certificacion con tres gates** secuenciales:

```
Gate 1: Completacion de lecciones
  ↓ (>= min_completion_pct, default 80%)
Gate 2: Quiz final aprobado
  ↓ (>= passing_grade_pct, default 70%)
Gate 3: Generacion y entrega de certificado
  ↓
  Alumno recibe PDF por email + descarga desde classroom
  + Pagina publica de verificacion
```

### 1. Gate 1 — Completacion de lecciones

Se calcula el porcentaje de lecciones completadas (`video_progress.completed = true`) sobre el total de lecciones del programa. El umbral es configurable por programa via `quiz_configs.min_completion_pct` (default 80%).

```
completion_pct = lecciones_completadas / total_lecciones * 100
```

Cuando `completion_pct >= min_completion_pct`, el quiz se desbloquea en la UI del classroom.

### 2. Gate 2 — Quiz final auto-generado por IA

**Un quiz por programa** (no por leccion). Se genera a partir de las transcripciones de TODAS las lecciones del programa.

**Pipeline de generacion:**

```
Admin presiona "Generar quiz" en /admin/programs/[programId]/quiz
  → POST /api/admin/generate-quiz
    → Recopilar transcripts de todas las lecciones del programa
    → Enviar a OpenAI gpt-5.4-mini con system prompt educativo
    → Generar 15-20 preguntas de seleccion multiple
    → Guardar en quiz_questions (is_generated = true)
    → Admin puede editar, agregar, eliminar preguntas
```

**Estructura de cada pregunta:**
- Enunciado (question_text)
- 4 opciones (A, B, C, D) en JSONB
- Respuesta correcta (correct_option: 'A' | 'B' | 'C' | 'D')
- Explicacion breve (explanation) — se muestra al alumno despues de responder
- Referencia a leccion de origen (lesson_id) — para que el alumno sepa de donde viene el tema
- Flag `is_generated` — distingue preguntas de IA vs agregadas manualmente

**Configuracion del quiz** (`quiz_configs`, por programa):

| Campo | Default | Descripcion |
|---|---|---|
| `min_completion_pct` | 80 | % de lecciones completadas para desbloquear quiz |
| `passing_grade_pct` | 70 | % minimo para aprobar |
| `questions_per_attempt` | 10 | Preguntas aleatorias del pool por intento |
| `max_attempts` | 3 | Intentos permitidos |
| `time_limit_minutes` | NULL | Limite de tiempo (NULL = sin limite) |

**Flujo del alumno:**
1. Alcanza el umbral de completacion → ve seccion "Quiz Final" desbloqueada.
2. Inicia quiz → recibe N preguntas aleatorias del pool.
3. Responde una a una → al final, enviar respuestas.
4. Scoring instantaneo server-side → resultado (aprobado/reprobado) + explicaciones.
5. Si reprueba y le quedan intentos → puede reintentar.
6. Si aprueba → Gate 3 se activa automaticamente.

### 3. Gate 3 — Generacion y entrega de certificado

**Pipeline (portado de encuentrosmart, adaptado a Capital Academy):**

```
Alumno aprueba quiz
  → POST /api/classroom/quiz/submit detecta passed = true
    → Invocar generateCertificate(enrollmentId)
      → Cargar template PNG del programa (desde certificate_templates)
      → Cargar fuente Allura
      → Superponer nombre del alumno (auto-sized)
      → Generar codigo de verificacion unico (8 chars alfanumerico)
      → Guardar PDF en Supabase Storage bucket "certificates"
      → Insertar registro en tabla certificates
      → Enviar email via Resend con PDF adjunto
```

**Verificacion publica:** pagina en `/verificar/{code}` que muestra nombre del alumno, programa, fecha de emision, sin requerir login. Esto permite que un empleador o institucion valide el certificado.

### 4. Modelo de datos

```sql
-- Configuracion de quiz por programa
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id)
);

-- Pool de preguntas por programa
CREATE TABLE public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  question_text text NOT NULL,
  options jsonb NOT NULL,
    -- Estructura: {"A": "texto opcion A", "B": "...", "C": "...", "D": "..."}
  correct_option text NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  explanation text,
  is_generated boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_questions_program ON public.quiz_questions(program_id);

-- Intentos de quiz por alumno
CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  questions_presented jsonb NOT NULL,
    -- Array de question_ids en el orden que se presentaron
  answers jsonb NOT NULL DEFAULT '{}',
    -- Estructura: {"question_id": "A", "question_id": "B", ...}
  score_pct numeric(5,2),
  passed boolean,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_attempts_enrollment ON public.quiz_attempts(enrollment_id);
CREATE INDEX idx_quiz_attempts_program ON public.quiz_attempts(program_id);

-- Templates de certificado por programa
CREATE TABLE public.certificate_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  template_png_path text NOT NULL,
    -- Ruta en Supabase Storage: "certificate-templates/diplomado-ventas.png"
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

-- Certificados emitidos
CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  quiz_attempt_id uuid REFERENCES public.quiz_attempts(id) ON DELETE SET NULL,
  student_name text NOT NULL,
    -- Nombre tal como aparece en el certificado (normalizado al momento de emision)
  verification_code text NOT NULL UNIQUE,
    -- 8 chars alfanumerico, ej: "A3K9M2X7"
  pdf_storage_path text NOT NULL,
    -- Ruta en Supabase Storage: "certificates/[enrollment_id]-[code].pdf"
  pdf_url text,
    -- URL firmada o publica del PDF
  emailed_at timestamptz,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id)
);

CREATE INDEX idx_certificates_verification ON public.certificates(verification_code);
CREATE INDEX idx_certificates_program ON public.certificates(program_id);
```

**RLS policies:**

```sql
-- quiz_configs: admin/ops pueden todo; alumnos pueden leer config de sus programas
ALTER TABLE public.quiz_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY quiz_configs_staff_all ON public.quiz_configs
  FOR ALL USING (public.is_platform_staff());

CREATE POLICY quiz_configs_student_select ON public.quiz_configs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.student_id = auth.uid()
      AND e.program_id = quiz_configs.program_id
      AND e.status = 'active'
    )
  );

-- quiz_questions: admin/ops pueden todo; alumnos NO leen directamente
-- (se sirven via API route que controla la seleccion aleatoria)
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY quiz_questions_staff_all ON public.quiz_questions
  FOR ALL USING (public.is_platform_staff());

-- quiz_attempts: alumno solo sus intentos; staff ve todo
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY quiz_attempts_student_own ON public.quiz_attempts
  FOR ALL USING (
    enrollment_id IN (
      SELECT id FROM public.enrollments WHERE student_id = auth.uid()
    )
  );

CREATE POLICY quiz_attempts_staff_all ON public.quiz_attempts
  FOR ALL USING (public.is_platform_staff());

-- certificates: alumno solo el suyo; staff ve todo; publico via verification_code (API)
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY certificates_student_own ON public.certificates
  FOR SELECT USING (
    enrollment_id IN (
      SELECT id FROM public.enrollments WHERE student_id = auth.uid()
    )
  );

CREATE POLICY certificates_staff_all ON public.certificates
  FOR ALL USING (public.is_platform_staff());

-- certificate_templates: staff puede todo; alumnos no necesitan acceso directo
ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY certificate_templates_staff_all ON public.certificate_templates
  FOR ALL USING (public.is_platform_staff());
```

### 5. Resumen de cambios por componente

| Componente | Tipo | Cambio |
|---|---|---|
| `quiz_configs` (tabla) | CREATE | Configuracion de quiz por programa |
| `quiz_questions` (tabla) | CREATE | Pool de preguntas (generadas por IA + manuales) |
| `quiz_attempts` (tabla) | CREATE | Registro de intentos de quiz por alumno |
| `certificate_templates` (tabla) | CREATE | Templates de certificado por programa |
| `certificates` (tabla) | CREATE | Certificados emitidos con verificacion |
| `POST /api/admin/generate-quiz` | CREATE | Genera preguntas desde transcripciones via OpenAI |
| `GET /api/admin/quiz/[programId]` | CREATE | Admin: ver/editar configuracion y preguntas |
| `PATCH /api/admin/quiz/questions` | CREATE | Admin: editar/agregar/eliminar preguntas |
| `GET /api/classroom/quiz` | CREATE | Alumno: obtener quiz (si desbloqueado) |
| `POST /api/classroom/quiz/submit` | CREATE | Alumno: enviar respuestas, scoring, trigger cert |
| `GET /api/classroom/certificate` | CREATE | Alumno: obtener certificado si existe |
| `GET /api/verify/[code]` | CREATE | Publico: verificar certificado sin login |
| `lib/certificates/generate-pdf.ts` | CREATE | Port de `certificate-pdf.mts` de encuentrosmart |
| `lib/certificates/verification.ts` | CREATE | Generacion de codigos de verificacion |
| `lib/ai/prompts/quiz-generation.ts` | CREATE | System prompt para generacion de preguntas |
| `lib/email/certificate-email.tsx` | CREATE | Template React para email de certificado |
| `app/(classroom)/quiz/` | CREATE | UI del quiz para el alumno |
| `app/(public)/verificar/[code]/` | CREATE | Pagina publica de verificacion |
| `app/(admin)/admin/programs/[id]/quiz/` | CREATE | Admin: gestion de quiz y preguntas |

## Opciones consideradas

### Opcion A — Pipeline completo in-platform: quiz + certificado + entrega (elegida)

Quiz auto-generado desde transcripciones, scoring automatico, generacion de PDF server-side con `pdf-lib`, entrega via Resend, y verificacion publica. Todo dentro de Capital Academy.

- **Pros:**
  - Experiencia unificada para el alumno: completa lecciones → rinde quiz → recibe certificado, todo en la misma plataforma.
  - Datos completos para analytics: se sabe exactamente que preguntas falla cada alumno, cuantos intentos necesita, etc.
  - Las preguntas se generan desde el contenido real de las clases — no son genericas.
  - El admin tiene control total: puede editar preguntas, ajustar umbrales, cambiar templates.
  - La generacion de PDF esta probada — se porta codigo que ya funciona en produccion (encuentrosmart).
  - Verificacion publica del certificado agrega credibilidad institucional.
  - Costo de IA minimo (~$0.05 para generar 20 preguntas de un programa completo).

- **Contras:**
  - Mayor volumen de desarrollo inicial (quiz UI + cert generation + admin panel).
  - Requiere mantener templates PNG por programa (mitigacion: el admin los sube una vez).
  - Si OpenAI genera preguntas de baja calidad, el admin debe revisarlas (mitigacion: las preguntas son editables; la revision es un paso esperado del flujo).

### Opcion B — Quiz externo (Google Forms / Typeform) + certificado manual

Usar una herramienta externa para la evaluacion y emitir certificados manualmente o con el script actual.

- **Pros:**
  - Cero desarrollo de quiz.
  - Google Forms es gratis.

- **Contras:**
  - Experiencia fragmentada: el alumno sale de la plataforma para rendir la evaluacion.
  - No hay integracion automatica: alguien tiene que revisar manualmente si el alumno aprobo y luego correr el script de certificados.
  - No se puede generar preguntas desde el contenido de las clases automaticamente.
  - No hay registro en la plataforma de intentos, calificaciones ni certificados.
  - No escala: con 3-5 programas activos y 40 alumnos cada uno, el trabajo manual es significativo.

### Opcion C — Solo certificado por completacion (sin quiz)

Emitir certificado cuando el alumno completa el umbral de lecciones, sin evaluacion.

- **Pros:**
  - Minimo desarrollo.
  - El alumno recibe certificado mas rapido.

- **Contras:**
  - **El certificado pierde valor academico.** Un certificado que solo dice "vio los videos" no es lo mismo que "demostro comprension del contenido". Para un programa ejecutivo que cobra 70+ UF, esto es un problema de percepcion de valor.
  - Facil de gamear: el alumno puede dejar los videos corriendo sin prestar atencion.
  - No cumple con el estandar que exigen programas acreditados o reportables a SENCE.
  - Resta diferenciacion competitiva frente a otros cursos online.

## Consecuencias

### Positivas

- **Certificado con respaldo academico real:** el alumno demostro que comprende el contenido, no solo que "vio los videos".
- **Proceso 100% automatizado:** desde que el alumno aprueba hasta que recibe el PDF por email, sin intervencion manual.
- **Generacion de preguntas escalable:** agregar un programa nuevo es: subir videos, esperar transcripciones, presionar "Generar quiz" y revisar las preguntas. Minutos, no dias.
- **Datos de aprendizaje valiosos:** se puede detectar que temas son mas dificiles (preguntas con alta tasa de error), que alumnos necesitan refuerzo, etc.
- **Verificacion publica:** empleadores pueden validar el certificado sin contactar a Capital Academy.
- **Reutilizacion de infra existente:** Resend para emails, pdf-lib para PDFs, OpenAI para IA — todo ya esta integrado o probado.

### Negativas

- **Incremento en tablas del schema:** 5 tablas nuevas. Aceptable dado que son un dominio claramente separado.
- **Dependencia de calidad de transcripciones para preguntas:** si un video tiene audio malo, las preguntas generadas seran malas. **Mitigacion:** el admin revisa y edita las preguntas antes de activar el quiz.
- **Latencia de generacion de quiz:** generar 20 preguntas desde 10 transcripciones puede tomar 20-40 segundos. **Mitigacion:** se hace en background con estado "generando" en la UI admin.

### Riesgos

- **Preguntas de IA demasiado faciles o irrelevantes:** el modelo podria generar preguntas triviales o de memorizar datos puntuales en vez de evaluar comprension. **Mitigacion:** (1) el system prompt es explicito en pedir preguntas de comprension, no memoristicas; (2) el admin siempre revisa antes de activar; (3) se puede iterar el prompt (campo `prompt_version`).
- **Alumno comparte respuestas:** como las preguntas se seleccionan aleatoriamente de un pool, es dificil copiar. Pero si el pool es de solo 15 preguntas y se presentan 10, la variabilidad es limitada. **Mitigacion:** generar pools mas grandes (20-25 preguntas) y el admin puede agregar manualmente.
- **Template PNG incorrecto:** si el template no tiene las dimensiones esperadas o el area del nombre esta en otra posicion, el texto quedara desalineado. **Mitigacion:** `certificate_templates` almacena coordenadas configurables por programa; el admin puede previsualizar antes de activar.
- **Supabase Storage no tiene un bucket `certificates`:** hay que crearlo con politicas de acceso adecuadas (PDFs accesibles solo por el alumno dueno + staff).
- **Certificados para asistentes presenciales sin quiz:** algunos programas otorgan certificado de participacion presencial (sin video, sin quiz). **Mitigacion:** endpoint `POST /api/admin/issue-certificate` para emision manual por staff, que salta los gates 1 y 2.

## Referencias

- [ADR-0001](0001-mux-como-video-provider.md) — Mux como video provider.
- [ADR-0002](0002-arquitectura-modulo-classroom.md) — Arquitectura del modulo Classroom.
- [ADR-0003](0003-tracking-progreso-video.md) — Tracking de progreso de video (tabla `video_progress`).
- [ADR-0005](0005-ai-features-sobre-video.md) — AI features sobre video (transcripciones, resumenes).
- [ADR-0006](0006-flujo-onboarding-y-matricula.md) — Onboarding y matricula (perfiles completos para certificados).
- Codigo fuente de certificados en encuentrosmart: `scripts/lib/certificate-pdf.mts`.
- Template de email de certificado: `src/lib/resend/templates/masterclass-certificate.tsx`.
- pdf-lib: https://pdf-lib.js.org/
- OpenAI API: https://platform.openai.com/docs/api-reference
