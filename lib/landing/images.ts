/**
 * Catálogo central de imágenes de la landing.
 *
 * Mix intencional:
 * - 3 cards de programa: ilustración brand abstracta (Flux 1.1 Pro Ultra
 *   en Replicate) — actúan como "identidad visual" de cada programa.
 * - 6 secciones humanas (qué es, por qué, comunidad, 3 detalles):
 *   fotografía editorial de profesionales (gpt-image-2 de OpenAI).
 * - Hero: foto real de Paola Vicuña (Directora Académica).
 *
 * Para regenerar:
 *   node scripts/generate-brand-images.mjs   # cards abstractas
 *   node scripts/generate-people-photos.mjs  # fotos editorial de personas
 */

const local = (name: string) => `/imagery/${name}.png`;

export const IMG = {
  hero: {
    src: "/team/paola-vicuna.webp",
    alt: "Paola Vicuña, Directora Académica de Capital Academy",
    name: "Paola Vicuña",
    role: "Directora Académica",
  },
  // === Fotografía editorial de personas (gpt-image-2) ===
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
  detalleDiplomado: {
    src: local("detalleDiplomado"),
    alt: "Asesor inmobiliario presentando una propiedad a una pareja",
  },
  detalleLiderazgo: {
    src: local("detalleLiderazgo"),
    alt: "Líder comercial facilitando reunión con su equipo de ventas",
  },
  detalleRuta: {
    src: local("detalleRuta"),
    alt: "Profesional caminando por oficina moderna iniciando una nueva etapa",
  },
  // === Mockups de diploma físico (gpt-image-2) — producto tangible por programa ===
  programaDiplomado: {
    src: local("programaDiplomado"),
    alt: "Diploma de Capital Academy en Ventas y Asesoría Inmobiliaria con sello dorado y cinta lima",
  },
  programaLiderazgo: {
    src: local("programaLiderazgo"),
    alt: "Diploma de Capital Academy en Liderazgo y Gestión de Equipos sobre cuero navy con cinta violeta",
  },
  programaRuta: {
    src: local("programaRuta"),
    alt: "Diploma de Capital Academy en Ruta Inmobiliaria en flat-lay lavanda con acento geométrico lima",
  },
};
