import type { TourStep } from "./types";

/**
 * Guion del tour guiado del alumno.
 *
 * Cada `target` es el valor de un atributo `data-tour="..."` puesto a mano en
 * la UI. Los anclajes viven en dos archivos:
 * - `components/classroom/sidebar.tsx`: `menu`, `menu-movil`, `ayuda`.
 * - `app/(classroom)/classroom/[cohortSlug]/page.tsx`: `progreso`,
 *   `continuar`, `ruta`.
 *
 * NO hay pasos "solo móvil" ni "solo escritorio" declarados: el filtro es la
 * VISIBILIDAD real del elemento (`resolveTourSteps`). El sidebar de escritorio
 * está en el DOM en móvil pero con `display:none` (`hidden md:flex`) y el
 * header móvil lo está en escritorio (`md:hidden`); ambos miden 0×0 donde no
 * corresponden, así que el mismo filtro que salta un elemento ausente resuelve
 * también el caso responsive. Por eso `menu` y `menu-movil` van pegados: en
 * cada viewport sobrevive exactamente uno.
 *
 * El orden es el del recorrido: primero dónde está el menú (el problema que
 * reportó la clienta: los alumnos no encuentran las secciones), después la
 * ayuda, y recién ahí el contenido de la pantalla.
 */
export const STUDENT_TOUR_STEPS: TourStep[] = [
  {
    id: "bienvenida",
    target: null,
    title: "Te damos la bienvenida 👋",
    body: "Te mostramos dónde está cada cosa de tu programa. Son menos de dos minutos y puedes salir cuando quieras.",
  },
  {
    id: "menu",
    target: "menu",
    title: "Tu menú, siempre a la izquierda",
    body: "Desde aquí llegas al calendario de clases, los recursos, los entregables, tus notas y las conversaciones con tus compañeros.",
    prefer: "right",
  },
  {
    id: "menu-movil",
    target: "menu-movil",
    title: "Tu menú está aquí",
    body: "Toca este botón para abrir el calendario de clases, los recursos, los entregables, tus notas y las conversaciones.",
    prefer: "bottom",
  },
  {
    id: "ayuda",
    target: "ayuda",
    title: "Si te trabas, entra a Ayuda",
    body: "Tiene guías paso a paso de cada pantalla y un formulario para escribirnos. Te respondemos por correo.",
    prefer: "right",
  },
  {
    id: "progreso",
    target: "progreso",
    title: "Así vas hasta ahora",
    body: "Tu avance se actualiza solo: cuentan las clases que ves y las que marcas como completadas.",
    prefer: "left",
  },
  {
    id: "continuar",
    target: "continuar",
    title: "Retoma donde lo dejaste",
    body: "Este atajo te lleva directo a la clase que estabas viendo. Si recién empiezas, te abre la primera.",
    prefer: "bottom",
  },
  {
    id: "ruta",
    target: "ruta",
    title: "Tu ruta de aprendizaje",
    body: "Abre un módulo para ver sus clases. Las grabadas las ves cuando quieras; las clases en vivo aparecen con su fecha.",
    prefer: "top",
  },
  {
    id: "cierre",
    target: null,
    title: "Listo, eso es todo 🎉",
    body: "Puedes volver a ver este recorrido cuando quieras desde el Centro de ayuda.",
    link: { href: "/classroom/guia", label: "Ir al Centro de ayuda" },
  },
];

/**
 * Deja solo los pasos que se pueden mostrar: los que no apuntan a nada (la
 * bienvenida y el cierre) y los que apuntan a un elemento efectivamente
 * visible.
 *
 * Un paso que apunta al vacío es peor que no mostrarlo: el foco quedaría en
 * una esquina sin nada. Pasa de verdad —el banner "Continuar" no existe
 * cuando el alumno no tiene ninguna clase disponible, y medio sidebar no está
 * visible en el teléfono.
 */
export function resolveTourSteps(
  steps: TourStep[],
  isTargetVisible: (target: string) => boolean,
): TourStep[] {
  return steps.filter((step) => step.target === null || isTargetVisible(step.target));
}

/** Etiqueta del contador de pasos ("Paso 2 de 6"). `index` es base 0. */
export function stepCounterLabel(index: number, total: number): string {
  return `Paso ${index + 1} de ${total}`;
}

/**
 * Índice del paso siguiente/anterior, acotado a los extremos. Devuelve el
 * mismo índice cuando ya está en el borde, para que el componente no tenga que
 * repetir la comparación.
 */
export function clampStepIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  if (index < 0) return 0;
  if (index > total - 1) return total - 1;
  return index;
}
