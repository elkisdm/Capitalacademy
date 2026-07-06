# ADR-0012: Entorno "Capacitaciones Capital Inteligente" (ciclo de capacitación comercial gratuito)

- **Status:** proposed
- **Date:** 2026-07-06
- **Deciders:** Elkis Daza (ingeniería), Paola Vicuña (dirección académica)
- **Tags:** data-model, classroom, entorno, multi-tenant

## Contexto

En la reunión de avances del 1-jul-2026 se aprobó un **ciclo de capacitaciones
comerciales** como entorno propio, separado del Programa de Liderazgo pagado. El
[ADR-0009](0009-entorno-liderazgo.md) ya lo anticipó explícitamente: el cupo de 40 de
las notas de reunión corresponde a *este* ciclo gratuito, no al Liderazgo (cupo 12).

Características acordadas (notas 1-jul-2026):

- **Gratuito y exploratorio:** mide interés y acerca a los interesados a los programas
  ejecutivos pagos. No tiene checkout ni pricing.
- **Sesiones presenciales y online** que se graban y quedan como material de consulta.
- **Cupo por sesión:** máximo 40 personas. La inscripción final (que asegura cupo) se
  hace en la plataforma; un formulario previo mide interés.
- **Foro y encuestas internas.** El foro ya existe (módulo Conversaciones, por programa,
  [ADR-0010](0010-conversaciones-foro-por-programa.md)) y aplica sin cambios en cuanto el
  programa exista. Las encuestas internas son un frente aparte.
- **Multi-tenant:** un alumno del Diplomado puede aparecer también aquí; el sistema lo
  gestiona por entorno (una cuenta, múltiples matrículas), sin duplicar la cuenta.

La estructura académica se recibió el 6-jul-2026 (material oficial "Ciclo de Capacitación
Comercial CI"): **5 sesiones presenciales, martes 10:00–12:00 en Auditorio**, dirigidas a
la fuerza de ventas de Capital Inteligente:

| # | Fecha | Sesión | Expositor |
|---|-------|--------|-----------|
| 1 | 07-jul | Rentix: administración de propiedades y continuidad de la inversión | Jose Soto |
| 2 | 21-jul | Soporte comercial: lectura de resumen de proyecto y uso de Brekto | Areli Marisio |
| 3 | 28-jul | Manejo comercial: criterio, conducción y gestión en la venta | Francisco Mendoza |
| 4 | 11-ago | CRM: uso estratégico para la gestión comercial | Martín Guzmán |
| 5 | 18-ago | UGC y experiencia del cliente: cómo acompañar mejor el proceso comercial | Ivis García |

Restricciones verificadas:

1. `public.cohorts` **no tiene columna de capacidad** (schema `0001_init_core.sql:44`).
   El tope de 40 no se puede modelar en el seed; se aplica en la lógica de inscripción.
2. `cohorts.start_date`/`end_date` son **NOT NULL**; `status` default `planned`.
3. Las rutas branded (`/login/<slug>`, `/onboarding/<slug>/...`) ya resuelven por slug
   desde `lib/programs/registry.ts` — activar un entorno es agregar el brand + el seed,
   como en Liderazgo (ADR-0009).

## Decisión

Sembrar el **entorno completo** vía migración versionada idempotente
`0049_seed_capacitaciones.sql` (UUIDs fijos rango `04xx`, `ON CONFLICT DO NOTHING`) y
activar el brand en el registry — mismo patrón del Diplomado (0022) y Liderazgo (0043).

1. **Programa** `code = CAP-CI`, `name = 'Ciclo de Capacitación Comercial CI'`,
   `total_modules = 5`, `is_active = true`. Sin checkout (gratuito).
2. **Una sesión = un módulo** (5 `program_modules`, `weight = 20` c/u). Cada módulo es el
   hogar de contenido y el destino de la grabación de su sesión. Alternativa descartada:
   1 módulo + 5 sesiones (rompería el mapeo sesión→módulo de la grabación).
3. **5 docentes nuevos** (`instructors` d…016–020): Jose Soto, Areli Marisio, Francisco
   Mendoza, Martín Guzmán, Ivis García. `email`/`bio` null (no entregados; el admin los completa).
4. **Cohorte** `code = G1`, `slug = capacitaciones-i-ciclo`, `2026-07-07 → 2026-08-18`,
   `status = 'active'` (el ciclo arranca el 7-jul).
5. **5 `class_sessions`** (martes 10:00–12:00 −04, `live_in_person`), cada una con su
   `module_id` y su `teacher_id`.
6. **Registry:** brand `capacitaciones` con `programId = a…0004`, acento `ca-rose`
   (`#d14a6b`) para diferenciarlo de los otros 3 entornos (violet/navy/amber).
7. **Cupo 40:** regla de la lógica de inscripción (fase futura), no columna de schema
   (`cohorts` no tiene capacidad).

Fuera de alcance de este ADR (fases siguientes): matrículas/inscripción por formulario con
tope de 40; el registro de asistencia por QR; la secuencia de correos del ciclo; y las
encuestas internas.

## Opciones consideradas

### Opción A — Una sesión = un módulo (elegida)
- Pros: refleja el calendario 1:1; cada grabación cae en su módulo; navegación clara;
  siembra `module_id` desde el inicio (sin backfill tipo 0037).
- Contras: 5 módulos para un ciclo corto puede verse granular.

### Opción B — 1 módulo "Ciclo" + 5 sesiones
- Pros: un solo contenedor de contenido.
- Contras: todas las grabaciones caerían en un módulo genérico; pierde la estructura del
  calendario; peor UX de navegación. Descartada (mismo criterio que ADR-0009).

## Consecuencias

### Positivas
- Capacitación Comercial CI pasa a ser tenant real con login/onboarding branded, aislado
  por cohorte, con calendario y repetición de clases funcionando sin ajustes.
- El foro (Conversaciones) queda disponible para el programa sin trabajo extra.
- Base lista para las fases siguientes (asistencia QR, correos, inscripción, encuestas).

### Negativas / Riesgos
- **Cupo 40 no forzado por el sistema todavía:** hasta construir la inscripción, nada
  impide superar el tope; es una regla documentada, no un constraint.
- **Docentes sin `email`/`bio`:** no venían en el material; el admin los completa.
- La migración **no se aplica a prod hasta revisión** (mismo criterio que 0022/0043).
- **Arranque inmediato:** la sesión 1 es el 7-jul (día siguiente a la siembra). Aplicar la
  migración y matricular a los asistentes debe hacerse con prontitud para que lleguen al
  classroom antes de la primera clase.

## Referencias

- [ADR-0009](0009-entorno-liderazgo.md) — patrón de entorno; anticipó este ciclo gratuito.
- [ADR-0008](0008-entorno-diplomado-y-calendario-de-sesiones.md) — patrón original de entorno + calendario.
- `db/migrations/0049_seed_capacitaciones.sql` — la siembra (esqueleto).
- `lib/programs/registry.ts` — brand `capacitaciones` activado.
- Notas de reunión "Avances plataforma" 1-jul-2026 (Paola Vicuña, Capital Academy, Elkis Daza).
