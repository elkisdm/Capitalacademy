# ADR-0022: Evaluaciones como sección de primer nivel del panel admin

- **Status:** proposed
- **Date:** 2026-07-16
- **Deciders:** Eduardo Daza, Elkis (dueño de producto)
- **Tags:** ui, admin, evaluaciones

## Contexto

Elkis lo dijo directo: *"en el menú del admin, quiero que sea una sección
propia, no encaja con lo que habíamos hablado, una entidad nueva, que se
llame evaluaciones, que se pueda crear una evaluación, la evaluación puede
ser un quiz, pero también puede ser de otro tipo, y que sea configurable"*.

El modelo de datos ya trata la evaluación como la entidad y el quiz como uno
de sus tipos (`evaluations.kind in ('quiz','manual')`, migración 0072,
ADR-0018 — ya en prod). Pero la UI invertía esa jerarquía: "Evaluaciones" era
una pestaña dentro de `/admin/quizzes`
(`components/admin/quiz/tab-bar.tsx`), subordinando la evaluación al quiz en
vez de al revés. Con 9 evaluaciones en toda la plataforma, la pantalla
existente (`evaluaciones-tab.tsx`) tampoco listaba evaluaciones: renderizaba
una tarjeta por *target* (33+ tarjetas en el Diplomado, para exponer 8
evaluaciones — verificado contra prod: 1 final, 1 de módulo, 1 de lección, 5
de sesión) — un catálogo de módulos/lecciones/sesiones con botón "Crear
quiz", no un listado de la entidad.

El brief original de evaluaciones y notas 1-7
(`docs/briefs/evaluaciones-y-notas-1-7.md:299,362`) documentó explícitamente
como restricción de v1 **NO renombrar la ruta `/admin/quizzes`** ("rompe
bookmarks"). Este ADR revierte esa restricción a propósito: se resuelve con
un redirect permanente hacia la nueva sección, no congelando la ruta.

## Decisión

1. **Sección propia `/admin/evaluaciones`** (lista, agrupada por módulo) +
   **`/admin/evaluaciones/[evaluationId]`** (pantalla de configuración,
   reusando `EvaluationPanel`). Página de detalle en vez de dialog: el panel
   tiene 4 pestañas con tablas de notas que no caben en el `Dialog max-w-2xl`
   que usaba la pestaña vieja. El commit `45da35d` sí le hizo un ajuste puntual
   (`toLocaleDateString` → `formatChile` en `evaluation-panel.tsx:244`, fix de
   zona horaria) — no se reescribió ni se le cambió lógica de negocio.
2. **`/admin/quizzes` muere como pantalla** y queda solo como
   `redirect("/admin/evaluaciones")` (307, no 308 — reversible, sin caché de
   navegador) para no romper bookmarks del staff.
3. **"Certificados" sale a ruta propia `/admin/certificados`**, montando
   `CertificadosTab` sin tocarlo, y entra como item propio del menú
   (Configuración, después de Evaluaciones): hoy vivía enterrado tras una
   pestaña de una sección que desaparece.
4. **Creación independiente como tercera vía**: un modal de un solo paso
   (Tipo, Alcance, Target condicional, Título) crea cualquier `kind`/`scope`
   desde cero, sin pasar por una lección o sesión existente. Las otras dos
   vías (`lesson-quiz-panel.tsx`, `session-quiz-panel.tsx`) siguen intactas.
5. **La lista se agrupa por módulo**, no por alcance: la profe razona por
   módulo ("una nota al 25, otra al 50, el guión de venta al 25"), y agrupar
   así permite mostrar la suma de pesos del módulo. "Otras evaluaciones" al
   final agrupa las sesiones sin módulo (`class_sessions.module_id` nullable).
6. **Bloqueo de "final + nota manual" solo en la UI, no en la API**: una
   evaluación final manual nunca tendría intentos y por lo tanto nunca
   emitiría certificado (ADR-0007 gatea la certificación por `passed` de un
   intento) — sería una trampa silenciosa. El modelo lo sigue permitiendo.

## Opciones consideradas

### Opción A — Sección de primer nivel + redirect (elegida)
- Pros: corrige la jerarquía sin migración (el modelo ya está completo);
  bookmarks viejos siguen funcionando vía redirect.
- Contras: la carpeta `components/admin/quiz/` queda con un nombre que ya no
  refleja la jerarquía nueva (ver Deuda).

### Opción B — Dejar la pestaña dentro de `/admin/quizzes`
- Descartada: es exactamente el error conceptual que Elkis pidió corregir.

### Opción C — `/admin/quizzes` como editor de preguntas
- Descartada: duplicaría la pestaña "Preguntas" que ya vive en
  `EvaluationPanel`, sin resolver la jerarquía invertida.

### Opción D — Certificados dentro de "Alumnos"
- Descartada: mezcla entidades (certificado no es un atributo del alumno,
  es un artefacto de una evaluación final aprobada).

## Consecuencias

### Positivas
- La UI refleja el modelo real: la evaluación es la entidad, el quiz un tipo.
- Certificados deja de estar enterrado tras una pestaña.
- El modal de creación preserva la única función útil del catálogo de
  targets viejo ("¿qué me falta por evaluar?") deshabilitando los targets que
  ya tienen evaluación, con el motivo visible.

### Negativas
- `kind` y `scope`/target siguen sin ser editables tras crear (hereda
  ADR-0018): si el negocio necesita convertir un quiz en nota manual, es otro
  frente (implica qué hacer con preguntas e intentos existentes). La UI
  advierte ambos en el modal de creación (`new-evaluation-dialog.tsx`) con
  texto visible junto a Tipo y junto a Alcance; no se parchea aquí.
- **Deuda reconocida**: la carpeta `components/admin/quiz/` y el archivo
  `certificados-tab.tsx` (montado ahora desde `/admin/certificados`) no se
  renombran en esta entrega — mover 19 archivos tocaría ~8 importadores y
  ocultaría el cambio real en el diff.

### Riesgos
- **Enlaces internos rotos**: mitigado — el único enlace de código vivo hacia
  `/admin/quizzes` era el ítem del sidebar (corregido) y dos entradas de la
  guía in-app (corregidas); el resto son menciones históricas en `docs/**`
  que no se reescriben.
- **El usuario espera cambiar el tipo después de crear**: no es un bug de
  este cambio, es la decisión de ADR-0018; se comunica en la UI, no se
  parchea.

## Referencias

- [ADR-0018: Evaluaciones y notas 1-7](0018-evaluaciones-y-notas-1-7.md) —
  `kind`/`weight_pct`/notas 1-7; este ADR no cambia el modelo, solo la UI.
- [ADR-0016: Ventana de programación de evaluaciones](0016-ventana-de-programacion-de-evaluaciones.md) —
  `opens_at`/`closes_at` y los badges de estado que reusa la lista nueva.
- [ADR-0007: Certificación y quizzes](0007-certificacion-y-quizzes.md) — por
  qué una final manual nunca certificaría (fundamento del bloqueo D7).
- `docs/briefs/evaluaciones-y-notas-1-7.md:299,362` — restricción que este
  ADR revierte explícitamente.
- `lib/admin/evaluation-list.ts` — helper puro de agrupación/etiquetas/bloqueo
  de targets, con sus tests candado.
