# ADR-0025: Audiencias del Centro de Ayuda y guía del profesor en PDF

- **Status:** proposed
- **Date:** 2026-07-22
- **Deciders:** Eduardo Daza
- **Tags:** classroom, docente, guia, pdf

## Contexto

El Centro de Ayuda (`/classroom/guia`) nació con dos audiencias implícitas
(alumno y equipo), gateadas por un booleano `isStaff`. Con la tercera
audiencia docente hacía falta:

1. Un modelo de visibilidad que no rompiera el caso `isStaff` existente
   (regresión real posible: filtrar contenido de equipo a quien no es staff).
2. Contenido propio para el docente invitado, que hoy no tiene ningún enlace
   a la guía desde su panel (`/docente`).
3. Cinco artículos existentes (quizzes, examen final, certificación) que
   describían la arquitectura previa a Evaluaciones (ADR-0018/0022) y a la
   ponderación de notas (ADR-0024): afirmaban que el quiz de práctica "no
   influye en tu certificado" sin aclarar que sí entra al promedio del
   módulo — verificado en el código (`lib/grades/sync-quiz-grade.ts`,
   `lib/grades/queries.ts`), no en la documentación previa.
4. Un docente invitado, sin acceso a `/admin`, necesita una guía que pueda
   leer sin haber entrado nunca a la plataforma (por ejemplo, antes de
   activar su cuenta) — de ahí la descarga en PDF.

## Decisión

1. **Las audiencias son capacidades del espectador, no roles excluyentes.**
   `visibleAudiences({ isStaff, isTeacher })` (`lib/guide/audience.ts`)
   calcula un arreglo ordenado de pestañas visibles en vez de que el
   servidor elija "el rol" del usuario: staff que además dicta ve las tres;
   un docente que es alumno de otro programa ve dos. El primer elemento del
   arreglo es la pestaña por defecto, preservando que staff siga abriendo en
   "Para alumnos" (comportamiento actual) mientras un docente puro abre
   directo en "Para profesores".
2. **La detección de docente delega en `lib/docente/queries.ts`**
   (`isTeacherUser`, sobre `getTeacherCohorts`) en vez de definir su propia
   consulta a `cohort_roles`. Es la misma fuente que usa el panel
   `/docente`: si `getTeacherCohorts` no devuelve nada, el panel no muestra
   nada y la guía tampoco. Cuando la vía "instructor" de esa función se
   reemplace por `session_teachers` (ADR-0025 del rediseño del rol
   docente — pendiente en otro plan), el Centro de Ayuda hereda el cambio
   sin que haya que tocar nada aquí.
3. **La guía del profesor en PDF se deriva de `articlesByAudience("teacher")`
   y de nada más.** No existe copia del texto en ningún otro lugar ni un
   archivo generado versionado: `lib/guide/pdf.ts` es una función pura
   (`buildGuidePdf`) que arma el documento al vuelo con `pdf-lib` y
   `StandardFonts.Helvetica` (sin `fontkit`, sin leer ningún archivo del
   repo). Si se edita un artículo de `articles/teacher.tsx`, la próxima
   descarga en `GET /api/guia/profesor/pdf` ya sale distinta, sin ningún
   paso de sincronización.

## Opciones consideradas

### Opción A — `visibleAudiences` como función pura sobre capacidades (elegida)
- Pros: un solo punto de verdad para el gate (`guia/[slug]/page.tsx`), test
  dedicado que fija el caso `isStaff` (anti-regresión), y admite que un
  espectador tenga más de una capacidad sin duplicar contenido.
- Contras: el índice necesita una pestaña por defecto explícita en vez de
  "la única audiencia posible".

### Opción B — `audience: Audience[]` en cada artículo (un artículo en varias pestañas)
- Pros: evitaría "duplicar" artículos sobre el mismo tema (p. ej.
  conversaciones) entre alumno y profesor.
- Contras: el contenido de un profe y el de un alumno sobre el mismo tema
  **no es el mismo texto** (uno modera, el otro participa); además cambia
  la forma de los 21 artículos existentes y convierte el gate de
  `guia/[slug]/page.tsx` de una comparación a una intersección. Descartada.

### Opción C — Ruta separada `/docente/guia`
- Pros: aislaría por completo el contenido de profesor.
- Contras: duplicaría la página de artículo, el buscador y la tarjeta de
  soporte; una sola URL por artículo también facilita compartirla por
  WhatsApp con la profe. Descartada.

### Opción D (PDF) — `pdf-lib` con fuente TrueType embebida (`fontkit`), como `generate-pdf.ts`
- Pros: tipografía de marca en vez de Helvetica genérica.
- Contras: reintroduce el punto frágil del módulo de certificados
  (`readFile(config.fontPath)` de un asset del repo dentro de una función
  serverless de Netlify) y la fuente disponible (Allura) es caligráfica,
  inútil para párrafos largos. Descartada.

### Opción E (PDF) — Guardar el PDF en Storage y regenerarlo por evento
- Pros: descarga más rápida (objeto ya armado).
- Contras: reintroduce exactamente la desincronización que se quiere
  evitar — habría que invalidar el objeto cada vez que cambia un artículo.
  El documento pesa ~15 KB y se arma en decenas de milisegundos: no hay
  problema de performance que justifique el costo de sincronización.
  Descartada.

## Consecuencias

### Positivas
- Un docente invitado tiene una guía propia, alcanzable desde tres puntos
  (enlace "Ayuda" en `/docente`, botón en el panel, CTA en el índice) y
  descargable en PDF sin depender de que recuerde entrar a la plataforma.
- Los cinco artículos corregidos ya no contradicen el comportamiento real
  de `syncQuizGrade` y `computeGroupAverage`.
- El PDF nunca se desincroniza del Centro de Ayuda: no hay build step, no
  hay archivo versionado, no hay tarea de regeneración.

### Negativas
- El índice del alumno pasa de 1 a hasta 3 consultas de servidor
  (`getTeacherCohorts` corre para todo no-staff): aceptable en una pantalla
  de baja frecuencia, mitigado por `cache()` de React y por que la tercera
  consulta (`class_sessions`) no se ejecuta si no hay filas en
  `instructors`.
- El texto completo de los 40 artículos viaja al cliente vía
  `guide-index-client.tsx` (`"use client"` + barrel completo). Se decidió
  no hacer trimming preventivo (pasar solo `{slug, audience, category,
  title, summary}` al cliente) hasta medir el First Load JS real; el
  umbral de acción (+30 KB) queda documentado en el plan de ejecución, no
  en este ADR.

### Riesgos
- Los artículos `quizzes-practica`, `quizzes-clase` y `notas` describen el
  comportamiento actual de `syncQuizGrade` / `computeGroupAverage`: si esa
  lógica cambia, hay que revisar esos tres artículos y el PDF (que los
  incluye) — no hay ningún mecanismo automático que los mantenga
  sincronizados con el código.
- El sanitizador `toWinAnsi` (`lib/guide/pdf.ts`) descarta cualquier
  carácter fuera de WinAnsi (incluidos emojis futuros en un artículo);
  cubierto por test dedicado, pero si algún día se necesita reproducir un
  emoji o símbolo especial en el PDF, hace falta revisar ese sanitizador.

## Referencias

- `lib/guide/audience.ts`, `lib/guide/pdf.ts`, `lib/guide/content.tsx`.
- `app/api/guia/profesor/pdf/route.ts`.
- [ADR-0013: Panel docente y acceso cohort-staff](0013-panel-docente-y-acceso-cohort-staff.md)
  — fuente de `getTeacherCohorts`/`isTeacherUser`.
- [ADR-0018: Evaluaciones y notas 1-7](0018-evaluaciones-y-notas-1-7.md) y
  [ADR-0024: Promedio ponderado por grupo](0024-promedio-ponderado-por-grupo.md)
  — comportamiento real que las correcciones de contenido documentan.
- `lib/certificates/generate-pdf.ts` — el punto frágil (`readFile` de
  fuente) que esta decisión evita deliberadamente.
