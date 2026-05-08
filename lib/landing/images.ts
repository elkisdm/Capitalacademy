/**
 * Catálogo central de imágenes de la landing.
 * - Hero: foto real de Paola Vicuña (Directora Académica) en /public/team.
 * - Resto: imágenes brand-aligned generadas con Flux 1.1 Pro Ultra (Replicate),
 *   estilo editorial flat geométrico siguiendo el Manual Gráfico oficial.
 *   Para regenerar: `node scripts/generate-brand-images.mjs [name?]`.
 */

const local = (name: string) => `/imagery/${name}.png`;

export const IMG = {
  hero: {
    src: "/team/paola-vicuna.webp",
    alt: "Paola Vicuña, Directora Académica de Capital Academy",
    name: "Paola Vicuña",
    role: "Directora Académica",
  },
  queEs: {
    src: local("queEs"),
    alt: "Composición geométrica violeta y lima representando una escuela de negocios abriéndose como ecosistema de aprendizaje",
  },
  programaDiplomado: {
    src: local("programaDiplomado"),
    alt: "Escalera ascendente en verde lima sobre semicírculos violeta — crecimiento comercial y profesionalización",
  },
  programaLiderazgo: {
    src: local("programaLiderazgo"),
    alt: "Círculos concéntricos en violeta con acentos lima — líder al centro y equipo alrededor",
  },
  programaRuta: {
    src: local("programaRuta"),
    alt: "Línea ondulante navy conectando un punto pequeño con un círculo lima grande — trayectoria de reinvención profesional",
  },
  porQueElegir: {
    src: local("porQueElegir"),
    alt: "Composición arquitectónica geométrica en violeta y lima — estándar profesional Capital Academy",
  },
  cierre: {
    src: local("cierre"),
    alt: "Constelación de círculos conectados en paleta brand — comunidad de profesionales inmobiliarios",
  },
  detalleDiplomado: {
    src: local("detalleDiplomado"),
    alt: "Composición vertical con columna ascendente lima y semicírculo violeta — KPIs y crecimiento comercial",
  },
  detalleLiderazgo: {
    src: local("detalleLiderazgo"),
    alt: "Torre vertical de círculos violeta con arco lavanda — estructura y liderazgo intencional",
  },
  detalleRuta: {
    src: local("detalleRuta"),
    alt: "Arco lavanda y línea ondulante hacia un círculo lima — un nuevo horizonte profesional",
  },
};
