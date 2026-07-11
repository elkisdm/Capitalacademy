/**
 * Catálogo central de imágenes de la landing.
 *
 * - Hero: foto real de Paola Vicuña (Directora Académica).
 * - Secciones humanas (queEs, porQueElegir, cierre): fotografía
 *   editorial de profesionales (gpt-image-2).
 * - Programas: brochure brand-aligned con título + foto + CTA, 2
 *   variantes por programa (card 16:9 y hero 4:5), generados con
 *   gpt-image-2 que respeta texto.
 *
 * Para regenerar:
 *   node scripts/generate-people-photos.mjs   # fotos sociales
 *   node scripts/generate-brochures.mjs       # brochures por programa
 *   node scripts/optimize-images.mjs          # PNG → WebP
 */

const local = (name: string) => `/imagery/${name}.webp`;

/**
 * Placeholder de color plano (rect SVG en el bg de la marca, #f3f3f3) para
 * `next/image`. Evita el flash blanco/hueco vacío mientras cargan las
 * imágenes locales (no son import estático, así que Next no genera
 * blurDataURL automático). Ver components/landing/Programas.tsx y
 * DetalleProgramas.tsx.
 */
export const IMG_PLACEHOLDER =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxMCI+PHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjEwIiBmaWxsPSIjZjNmM2YzIi8+PC9zdmc+";

export const IMG = {
  hero: {
    src: "/team/paola-vicuna.webp",
    alt: "Paola Vicuña, Directora Académica de Capital Academy",
    name: "Paola Vicuña",
    role: "Directora Académica",
  },
  queEs: {
    src: local("queEs"),
    alt: "Profesionales en clase ejecutiva tomando notas con expresiones atentas",
  },
  porQueElegir: {
    src: local("porQueElegir"),
    alt: "Ejecutiva en oficina moderna con expresión confidente y mirada estratégica",
  },
  cierre: {
    src: local("cierre"),
    alt: "Grupo de profesionales conversando en networking de Capital Academy",
  },
  // === Brochures por programa — variante CARD (16:9, en Programas.tsx) ===
  programaDiplomadoCard: {
    src: local("programaDiplomadoCard"),
    alt: "Brochure del Diplomado en Ventas y Asesoría Inmobiliaria con asesor mostrando una propiedad",
  },
  programaLiderazgoCard: {
    src: local("programaLiderazgoCard"),
    alt: "Brochure del Programa de Liderazgo y Gestión de Equipos con líder facilitando reunión",
  },
  programaRutaCard: {
    src: local("programaRutaCard"),
    alt: "Brochure del Programa Ruta Inmobiliaria con profesional iniciando una nueva etapa",
  },
  // === Brochures por programa — variante HERO (4:5, en DetalleProgramas.tsx) ===
  programaDiplomadoHero: {
    src: local("programaDiplomadoHero"),
    alt: "Brochure expandido del Diplomado en Ventas y Asesoría Inmobiliaria",
  },
  programaLiderazgoHero: {
    src: local("programaLiderazgoHero"),
    alt: "Brochure expandido del Programa de Liderazgo y Gestión de Equipos",
  },
  programaRutaHero: {
    src: local("programaRutaHero"),
    alt: "Brochure expandido del Programa Ruta Inmobiliaria",
  },
};
