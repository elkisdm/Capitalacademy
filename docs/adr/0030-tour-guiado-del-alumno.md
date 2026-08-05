# ADR-0030: Tour guiado del alumno

- **Status:** proposed
- **Date:** 2026-08-05
- **Deciders:** equipo Capital Academy (pedido de la clienta en la reunión del 2026-07-29)
- **Tags:** classroom, onboarding, ux, accesibilidad, data-model

## Contexto

En la reunión del 2026-07-29 la clienta pidió que el alumno "aprenda a usar la
plataforma" con un recorrido guiado. El pedido no es cosmético: la asistencia y
el uso están bajos, y hay alumnos que directamente no encuentran las secciones
(calendario, recursos, entregables, notas, conversaciones). El sábado siguiente
a la reunión se hizo una demo guiada presencial; funcionó, pero no escala: no
alcanza a los alumnos que se matriculan después ni a los que no llegaron.

Restricciones del terreno, verificadas antes de decidir:

- **No hay ninguna librería de tour instalada** ni nada cercano: sin Radix, sin
  framer-motion, sin driver.js/shepherd/react-joyride/intro.js.
- **No existe ningún ancla estable en la UI del classroom**: ni `id`, ni
  `data-tour`, ni `data-testid`. Todo está anclado por clases de Tailwind o por
  estructura del DOM.
- El repo ya resolvió el problema equivalente con componentes propios:
  `components/ui/dialog.tsx` es `createPortal` + `useFocusTrap` manual.
- El classroom pasó por un barrido móvil completo y tiene que seguir andando en
  teléfono, donde el sidebar de escritorio no se ve y el menú vive en un drawer.
- La cobertura de tests mide `lib/**` y `app/api/**` con entorno `node`; los
  componentes React están excluidos a propósito (no hay jsdom ni
  @testing-library). Ver [ADR-0010](0010-adopcion-gate-cobertura.md).
- Ya existe un gate de onboarding de perfil (`profiles.onboarding_completed_at`,
  [ADR-0006](0006-flujo-onboarding-y-matricula.md)) que redirige a
  `/onboarding/complete-profile`. Es un formulario de datos personales, no un
  tour, y son cosas distintas que no deben pisarse.
- El Centro de ayuda ya existe en `/classroom/guia`
  ([ADR-0025](0025-audiencias-del-centro-de-ayuda-y-guia-en-pdf.md)) y es el
  lugar natural donde termina y desde donde se re-lanza el tour.

## Decisión

Un tour guiado propio, de siete pasos, que se dispara solo la primera vez que
un alumno entra al dashboard de su programa, con cuatro decisiones de fondo:

1. **Componente propio, sin dependencia nueva.** `createPortal` + `useFocusTrap`
   (el mismo hook del `Dialog`), un recuadro de foco hecho con
   `box-shadow: 0 0 0 9999px`, y una tarjeta posicionada por cálculo propio.
2. **El estado "ya lo vio" se persiste en `profiles`**, no en `localStorage`:
   columnas `tour_completed_at` (cuándo lo cerró) y `tour_outcome`
   (`completed` | `skipped`). Migración `0088_tour_guiado.sql`.
3. **El guion es un dato, no JSX disperso**: `lib/tour/steps.ts` exporta
   `STUDENT_TOUR_STEPS` y las funciones puras que lo filtran; `lib/tour/position.ts`
   tiene toda la geometría. El componente solo orquesta DOM y estado.
4. **Los pasos se filtran por VISIBILIDAD real del elemento**, no por flags de
   viewport ni por `window.innerWidth`.

### Anclajes

Como no existía ninguno, se agregan seis atributos `data-tour` a mano:

| `data-tour` | Archivo |
| --- | --- |
| `menu` | `components/classroom/sidebar.tsx` (contenedor de navegación de escritorio) |
| `menu-movil` | `components/classroom/sidebar.tsx` (botón hamburguesa del header móvil) |
| `ayuda` | `components/classroom/sidebar.tsx` (item fijo "Ayuda") |
| `progreso` | `app/(classroom)/classroom/[cohortSlug]/page.tsx` (aside "Progreso general") |
| `continuar` | `app/(classroom)/classroom/[cohortSlug]/page.tsx` (banda "Continuar") |
| `ruta` | `app/(classroom)/classroom/[cohortSlug]/page.tsx` (lista de módulos) |

Son atributos de datos, no clases ni ids: no cambian estilos, no colisionan con
Tailwind y dejan explícito que existen para el tour.

### Por qué el filtro por visibilidad y no por viewport

El sidebar de escritorio está en el DOM cuando se navega desde el teléfono, pero
con `display: none` (`hidden md:flex`); el header móvil está en el DOM en
escritorio, con `md:hidden`. Ambos miden 0×0 donde no corresponden. Entonces el
mismo filtro que salta un paso cuyo elemento no existe —el caso real de la banda
"Continuar", que no se renderiza cuando el alumno no tiene ninguna clase
disponible— resuelve también el caso responsive, sin `matchMedia`, sin flags
`only: "mobile"` y sin que el guion tenga que saber nada de breakpoints. Por eso
los pasos `menu` y `menu-movil` van pegados en el guion: en cada viewport
sobrevive exactamente uno. En escritorio quedan siete pasos; en teléfono, seis
(se cae el item "Ayuda", que vive dentro del sidebar de escritorio; el paso de
cierre lo cubre con un enlace directo al Centro de ayuda).

La regla es que un paso **nunca apunta al vacío**: o destaca algo visible, o no
se muestra.

### Orden respecto del gate de onboarding

No hace falta coordinación explícita: `app/(classroom)/layout.tsx:41-43`
redirige a `/onboarding/complete-profile` antes de renderizar cualquier hijo, y
el tour se monta dentro del dashboard del programa. Un alumno sin perfil
completo nunca llega a renderizar el tour. El orden queda: completar perfil →
dashboard → tour.

### Cómo se dispara y cómo se re-lanza

El servidor decide, y le pasa al componente un solo prop `start`:

- `off` — ya lo vio, o es staff/docente (`getClassroomAccess().isStaff`).
- `auto` — alumno con `tour_completed_at` en `null`.
- `forced` — llegó con `?tour=1`, o sea lo pidió a propósito.

`forced` viene del Centro de ayuda, que muestra el botón "Ver el recorrido de
nuevo" apuntando a `/classroom/<cohorte>?tour=1`. Se lee el query param en el
servidor (`searchParams` de la page) y no con `useSearchParams`, para no
arrastrar una frontera de `<Suspense>` a una página que ya es dinámica.

Sobre `auto`: además del flag en base de datos hay una guarda de sesión en
`sessionStorage`. No sustituye a la base de datos, cubre una ventana chica: si
el alumno cierra el tour y navega de vuelta al dashboard por el router, Next
puede servir el payload RSC cacheado —con `start: "auto"` todavía— y el tour se
reabriría. La guarda se lee después del montaje, no durante el render, para no
provocar un mismatch de hidratación (mismo cuidado que `summary-card.tsx`).

### Accesibilidad

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` en la tarjeta.
- Foco atrapado con `useFocusTrap`, el mismo hook que usa `Dialog`.
- `Esc` cierra (cuenta como `skipped`), `→`/`Enter` avanza, `←` retrocede.
- El cuerpo del paso va en una región `aria-live="polite"`: la tarjeta no se
  desmonta entre pasos (para no perder el foco), así que el cambio de contenido
  necesita anunciarse.
- Una capa transparente bloquea los clics del fondo mientras el tour está
  abierto, para que no se pueda navegar por debajo y dejar el foco huérfano.

## Opciones consideradas

### Opción A — Librería de tour de terceros (driver.js, shepherd, react-joyride)

- Pros: posicionamiento, foco y accesibilidad ya resueltos; menos código propio;
  driver.js pesa poco (~5 kB) y no depende de React.
- Contras: es la primera dependencia de UI del repo (hoy no hay ninguna: ni
  Radix ni framer-motion), y contradice la línea establecida de componentes
  propios ligeros. Traen su propio CSS, que hay que pelear contra el sistema de
  diseño (`ca-card`, variables `--color-ca-*`). react-joyride venía además con
  su propia gestión de estado, muy por encima de lo que se necesita. Y lo que
  aportan —posicionar una tarjeta y atrapar el foco— es exactamente lo que este
  repo ya sabe hacer: `useFocusTrap` está escrito y probado.

**Descartada.** Lo que se ahorraba no compensaba la dependencia. El costo real
del tour no era el tooltip: era decidir el guion y poner los anclajes, y eso hay
que hacerlo igual con cualquier librería.

### Opción B — Componente propio (elegida)

- Pros: cero dependencias nuevas; usa el sistema de diseño directamente; reusa
  `useFocusTrap`; la lógica no trivial se puede sacar a `lib/` y testear.
- Contras: hay que escribir el posicionamiento y el recuadro de foco a mano
  (~100 líneas de componente + ~80 de geometría pura).

### Dónde vive el estado

#### Opción A — `localStorage`

- Pros: cero backend, cero migración.
- Contras: **no cumple el pedido**. El alumno entra desde el teléfono y desde el
  computador, y el tour se repetiría en cada dispositivo y en cada navegador.
  Además la clienta quiere medir adopción, y una preferencia de navegador no es
  consultable desde ningún reporte. El repo ya tiene la regla: `localStorage`
  solo para lo cosmético (volumen y velocidad del player, playlist plegada).

**Descartada.**

#### Opción B — Columnas en `profiles` (elegida)

- Pros: sincroniza entre dispositivos; consultable para medir adopción; copia
  exactamente el patrón de `onboarding_completed_at` (0014), incluido el índice
  parcial de pendientes.
- Contras: una migración más y una columna más en una tabla que ya es ancha.

Se guardan **dos** columnas y no una: `tour_completed_at` es el flag que evita
que se dispare solo otra vez, y `tour_outcome` (`completed` | `skipped`,
con CHECK) es la métrica que la clienta pidió —cuántos lo terminaron y cuántos
lo saltaron son cosas distintas—. Un re-lanzamiento reescribe ambas: la lectura
correcta es "la última vez que lo vio y cómo lo cerró esa vez". Se prefirió sobre
conservar la primera vez porque el caso que interesa es el inverso: alguien que
lo saltó y después volvió a verlo completo cuenta como adoptado.

### Cómo se define el guion

#### Opción A — JSX dentro del componente

- Pros: escribirlo es directo.
- Contras: queda atrapado en un componente React, y los componentes React están
  fuera de la medición de cobertura de este repo. El guion no se podría testear.

**Descartada.**

#### Opción B — Datos en `lib/tour/` (elegida)

`STUDENT_TOUR_STEPS` es un array de objetos planos y todo lo que lo manipula son
funciones puras: `resolveTourSteps`, `stepCounterLabel`, `clampStepIndex`,
`computeSpotlight`, `computeCardPosition`, `isRectVisible`. El componente recibe
rectángulos y devuelve estilos. Se testea el guion (que ningún paso quede sin
título, que los anclajes no se dupliquen, que el filtro saque los invisibles) y
se testea la geometría (que la tarjeta no se salga del viewport, que elija el
lado con espacio) sin tocar el DOM.

## Consecuencias

### Positivas

- Se escala la demo presencial a todos los alumnos, incluidos los que se
  matriculan más adelante.
- `tour_outcome` da la primera métrica de adopción de una ayuda in-app.
- Los seis `data-tour` son el primer conjunto de anclajes estables del
  classroom. Sirven para el tour hoy, y para tests end-to-end el día que se
  agreguen.
- Cero dependencias nuevas: no cambia el tamaño del bundle de vendor.

### Negativas

- Los `data-tour` son un acoplamiento nuevo: si alguien mueve o borra el aside
  de progreso o la banda "Continuar" sin llevarse el atributo, el paso se salta
  en silencio. Es una degradación elegante, pero silenciosa.
- El guion está escrito para el dashboard del programa. Un entorno cuyo
  dashboard no tenga módulos ni banda de continuar verá un tour más corto.
- El posicionamiento propio no maneja todos los casos que maneja una librería
  madura (por ejemplo, un objetivo dentro de un contenedor con scroll propio y
  overflow oculto).

### Riesgos

- **La migración 0088 tiene que ir a producción ANTES que el código.** La
  pantalla NO se cae: `postgrest-js` no lanza y el error se descarta. Lo que
  pasa es peor de diagnosticar. Con el código desplegado y la columna ausente,
  la lectura de `tour_completed_at` falla, y sin protección el tour arrancaría
  en `auto` para TODA la matrícula en cada carga, mientras cada
  `POST /api/classroom/tour` responde 500 y no persiste nada: el alumno lo
  vuelve a ver en la pestaña siguiente, indefinidamente.
  Por eso `resolveTourStart` (`lib/tour/start.ts`) **falla cerrado**: recibe el
  error de lectura y devuelve `off`. El mismo corte protege del otro escenario
  con precedente en este repo —un statement timeout de RLS sobre `profiles`
  (incidente 57014 del 21-jul, ver 0079)— que si no le relanzaría el tour a
  alumnos que ya lo cerraron. Aun así el orden correcto sigue siendo migración
  primero: con la protección puesta, el costo de equivocarse es que nadie ve el
  tour, en vez de que lo vean todos y no se pueda cerrar.
- La migración **marca a ops/admin como `tour_outcome = 'skipped'`** con
  `tour_completed_at = now()`, siguiendo el precedente de 0014 con el onboarding.
  Es un efecto de datos deliberado y hay que tenerlo en cuenta al leer el
  reporte de adopción: el denominador honesto excluye al staff, porque a ese
  grupo nunca se le ofreció el tour. No se backfillea a ningún alumno: el punto
  del frente es justamente que los alumnos actuales lo vean.
- Siete pasos pueden ser muchos. Si `tour_outcome` muestra mayoría de `skipped`,
  la respuesta es acortar el guion, no insistir. Que el guion sea un array hace
  que eso sea editar un archivo.
- `lib/supabase/types.ts` se genera desde producción y todavía no conoce las
  columnas nuevas, así que las lecturas y escrituras van con cast explícito
  (mismo patrón que `app/api/classroom/profile/route.ts` con `birthday`). Los
  casts se pueden sacar cuando se regeneren los tipos.

## Referencias

- [ADR-0006 — Flujo de onboarding y matrícula](0006-flujo-onboarding-y-matricula.md)
  (el gate de perfil que corre antes que el tour).
- [ADR-0025 — Audiencias del Centro de ayuda](0025-audiencias-del-centro-de-ayuda-y-guia-en-pdf.md)
  (dónde termina y desde dónde se re-lanza el tour).
- [ADR-0010 — Adopción del gate de cobertura](0010-adopcion-gate-cobertura.md)
  (por qué la lógica vive en `lib/` y no en el componente).
- [ADR-0004 — Modelo de permisos RBAC por cohorte](0004-modelo-permisos-rbac-por-cohorte.md)
  (`isStaff` es lo que decide que a docentes y staff no se les dispare solo).
- `db/migrations/0014_onboarding_profiles.sql` — el patrón que copia la 0088.
- `db/migrations/0088_tour_guiado.sql` — **no aplicada a ninguna base de datos**.
