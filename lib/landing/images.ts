/**
 * Catálogo central de imágenes de la landing.
 * - Hero: foto real de Paola Vicuña (Directora Académica) en /public/team.
 * - Resto: Unsplash directo, fácil de reemplazar por fotos reales cuando estén.
 */
const u = (id: string, w = 1200, q = 75) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=${q}`;

export const IMG = {
  hero: {
    src: "/team/paola-vicuna.webp",
    alt: "Paola Vicuña, Directora Académica de Capital Academy",
    name: "Paola Vicuña",
    role: "Directora Académica",
  },
  queEs: {
    src: u("1556761175-b413da4baf72", 1400),
    alt: "Reunión profesional cerrando una asesoría inmobiliaria",
  },
  programaDiplomado: {
    src: u("1554224155-8d04cb21cd6c", 1000),
    alt: "Asesor inmobiliario presentando una propiedad",
  },
  programaLiderazgo: {
    src: u("1542744173-8e7e53415bb0", 1000),
    alt: "Equipo comercial reunido planificando estrategia",
  },
  programaRuta: {
    src: u("1521737604893-d14cc237f11d", 1000),
    alt: "Profesional inmobiliario en nueva etapa de carrera",
  },
  porQueElegir: {
    src: u("1556761175-4b46a572b786", 1400),
    alt: "Equipo de Capital Academy en sesión formativa",
  },
  cierre: {
    src: u("1515187029135-18ee286d815b", 1600),
    alt: "Comunidad de profesionales inmobiliarios",
  },
  detalleDiplomado: {
    src: u("1497366216548-37526070297c", 1400),
    alt: "Profesionales analizando información de mercado",
  },
  detalleLiderazgo: {
    src: u("1552581234-26160f608093", 1400),
    alt: "Líder comercial guiando a su equipo",
  },
  detalleRuta: {
    src: u("1556761175-5973dc0f32e7", 1400),
    alt: "Cierre exitoso entre asesor y cliente inmobiliario",
  },
};
