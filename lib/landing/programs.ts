import { IMG } from "./images";

/**
 * Sistema de identidad por programa — inspirado en Platzi.
 * Cada programa tiene color, glifo, nivel, metadata y tags propios.
 * Cambia acá una sola vez y se propaga a Programas.tsx, DetalleProgramas.tsx y Stats.tsx.
 */

export type ProgramId = "diplomado" | "liderazgo" | "ruta";
export type ProgramTheme = "lime" | "violet" | "lavender";
export type ProgramLevel = "Profesional" | "Senior · Líder" | "Iniciación · Reinvención";

export type SyllabusModule = {
  num: number;
  title: string;
  topics: string[];
};

export type ProgramMeta = {
  id: ProgramId;
  tag: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  description: string;
  level: ProgramLevel;
  duration: string;
  modules: number;
  modality: string;
  certificate: string;
  nextStart: string;
  cohortSize: string;
  audience: string[];
  audienceTags: string[];
  develops: string[];
  areas: string[];
  includes: string[];
  syllabus: SyllabusModule[];
  highlight: string;
  cta: string;
  href: string;
  theme: ProgramTheme;
  cardImage: { src: string; alt: string };
  heroImage: { src: string; alt: string };
  /** URL de pago directo (solo programas con inscripción abierta). */
  paymentUrl?: string;
  /** Badge de descuento opcional, ej: "−50% lanzamiento". */
  discountLabel?: string;
  /** Cifras de prueba social — exclusivo de programas que las declaran (ej. diplomado). */
  socialProof?: { value: string; label: string }[];
  /** Bloques de horario — exclusivo de programas con calendario fijo. */
  schedule?: { day: string; mode: string; time: string }[];
  /** Dirección presencial — solo programas con sede física. */
  location?: string;
};

export const PROGRAMS: Record<ProgramId, ProgramMeta> = {
  diplomado: {
    id: "diplomado",
    tag: "Diplomado",
    title: "Ejecutivo en Ventas y Asesoría de Inversión Inmobiliaria",
    shortTitle: "Diplomado Ventas",
    subtitle:
      "Eleva tu nivel: de ejecutivo comercial a asesor de inversión con criterio profesional.",
    description:
      "Un programa diseñado para brokers, asesores inmobiliarios y ejecutivos de sala de venta que buscan fortalecer su gestión comercial, comprender mejor el mercado y desarrollar una asesoría más sólida, profesional y confiable.",
    level: "Profesional",
    duration: "12 semanas",
    modules: 2,
    modality: "Híbrida (online + presencial)",
    certificate: "Diploma certificado",
    // Fallback estático: se usa solo si la landing no logra resolver la
    // próxima cohorte desde `cohorts` (ver lib/landing/cohort.ts). Nunca debe
    // ser una fecha fija — de lo contrario vuelve a vencer con el tiempo.
    nextStart: "Próxima cohorte abierta",
    cohortSize: "Cupos limitados",
    audience: [
      "Brokers y asesores inmobiliarios",
      "Ejecutivos de sala de venta",
      "Profesionales del rubro que quieren elevar su nivel comercial",
    ],
    audienceTags: ["Brokers", "Asesores", "Ejecutivos de sala"],
    develops: [
      "Ventas y asesoría inmobiliaria",
      "Criterio comercial",
      "Manejo de objeciones",
      "Seguimiento efectivo",
      "Educación financiera aplicada",
      "Profesionalización del rol asesor",
    ],
    areas: ["Ventas", "Asesoría", "Mercado", "Educación financiera"],
    includes: [
      "Diploma certificado de Capital Academy",
      "Acceso a la comunidad Capital Inteligente",
      "Sesiones en vivo grabadas para revisar después",
      "Casos reales del mercado chileno",
      "Mentoría grupal con docentes activos en la industria",
    ],
    syllabus: [
      {
        num: 1,
        title: "Módulo Teórico — los 4 cursos integrados",
        topics: [
          "Pensar como inversionista: mercado, educación financiera y lectura de inversión",
          "Vender como asesor: metodología comercial, diagnóstico, propuesta y cierre",
          "Operar como profesional: crédito, legal, marketing, IA y tributario",
          "Sostener resultados: hábitos, mentalidad e inteligencia emocional",
        ],
      },
      {
        num: 2,
        title: "Módulo Práctico — aplicación guiada",
        topics: [
          "Práctica guiada y feedback individual",
          "Challenge Day y Role Play",
          "Evaluaciones y casos reales",
        ],
      },
    ],
    highlight:
      "Porque hoy vender propiedades exige mucho más que intención comercial. Exige preparación, criterio y confianza.",
    cta: "Quiero información del Diplomado",
    href: "#detalle-diplomado",
    theme: "lime",
    cardImage: IMG.programaDiplomadoCard,
    heroImage: IMG.programaDiplomadoHero,
    paymentUrl: "/pago",
    discountLabel: "−50% Lanzamiento",
    socialProof: [
      { value: "+100", label: "Asesores formados" },
      { value: "17", label: "Profesores especialistas" },
      { value: "9,5/10", label: "De satisfacción" },
      { value: "Capital Inteligente", label: "Certificación respaldada por" },
    ],
    schedule: [
      { day: "Miércoles", mode: "Online", time: "19:00–21:00" },
      { day: "Sábados por medio", mode: "Presencial", time: "09:30–16:30" },
    ],
    location: "Av. Pdte. Kennedy 8017, Piso 4, Las Condes, Santiago",
  },
  liderazgo: {
    id: "liderazgo",
    tag: "Programa",
    title: "Liderazgo y Gestión de Equipos Comerciales",
    shortTitle: "Programa Liderazgo",
    subtitle:
      "Herramientas para construir, liderar y sostener equipos a la altura de grandes metas.",
    description:
      "Un programa diseñado para jefaturas, líderes comerciales, team leaders y profesionales que buscan construir, conducir y sostener equipos de venta con mayor estructura, foco y desempeño.",
    level: "Senior · Líder",
    duration: "4 jornadas",
    modules: 3,
    modality: "Presencial",
    certificate: "Diploma certificado",
    nextStart: "Próxima cohorte abierta",
    cohortSize: "Cupos limitados",
    audience: [
      "Jefaturas comerciales",
      "Líderes de equipo",
      "Profesionales que quieren crear o fortalecer un equipo comercial",
    ],
    audienceTags: ["Jefaturas", "Líderes", "Team leaders"],
    develops: [
      "Reclutamiento de talento",
      "Motivación y desarrollo de equipos",
      "Liderazgo comercial",
      "Gestión del tiempo",
      "Autoliderazgo",
      "Foco en metas y resultados sostenibles",
    ],
    areas: ["Liderazgo", "Equipos", "Gestión", "Performance"],
    includes: [
      "Diploma certificado de Capital Academy",
      "Acceso a la comunidad Capital Inteligente",
      "Sesiones en vivo grabadas",
      "Frameworks aplicables a tu equipo desde la primera semana",
      "Mentoría grupal con líderes de la industria",
    ],
    syllabus: [
      {
        num: 1,
        title: "Autoliderazgo y rol del líder comercial",
        topics: ["Identidad de líder", "Gestión emocional", "Foco y disciplina"],
      },
      {
        num: 2,
        title: "Reclutamiento y selección de talento",
        topics: ["Perfil de cargo", "Entrevista estructurada", "Onboarding"],
      },
      {
        num: 3,
        title: "Motivación y desarrollo de equipos",
        topics: ["Coaching 1:1", "Feedback efectivo", "Planes de desarrollo"],
      },
      {
        num: 4,
        title: "Gestión por metas y métricas",
        topics: ["KPI comerciales", "Pipeline review", "Cultura de números"],
      },
      {
        num: 5,
        title: "Liderazgo en momentos difíciles",
        topics: ["Ciclos de baja", "Conversaciones difíciles", "Reestructuración"],
      },
      {
        num: 6,
        title: "Proyecto integrador",
        topics: ["Plan de gestión 90 días", "Presentación a panel", "Devolución"],
      },
    ],
    highlight:
      "Las grandes metas exigen más que visión: exigen equipo, estructura y liderazgo.",
    cta: "Quiero información del Programa de Liderazgo",
    href: "#detalle-liderazgo",
    theme: "violet",
    cardImage: IMG.programaLiderazgoCard,
    heroImage: IMG.programaLiderazgoHero,
  },
  ruta: {
    id: "ruta",
    tag: "Programa",
    title: "Ruta Inmobiliaria",
    shortTitle: "Ruta Inmobiliaria",
    subtitle: "Un nuevo camino profesional con respaldo y visión de negocio.",
    description:
      "Ruta Inmobiliaria es un programa orientado a emprendedores y profesionales que buscan reinventarse, abrir una nueva etapa laboral o ingresar al mundo inmobiliario con una mirada más estructurada, acompañada y realista.",
    level: "Iniciación · Reinvención",
    duration: "14 semanas",
    modules: 7,
    modality: "Online en vivo + sesiones presenciales",
    certificate: "Diploma certificado",
    nextStart: "Próxima cohorte abierta",
    cohortSize: "Cupos limitados",
    audience: [
      "Emprendedores",
      "Profesionales en etapa de reinvención",
      "Personas que buscan una nueva oportunidad dentro del rubro",
      "Futuros Business Partners",
    ],
    audienceTags: ["Emprendedores", "Reinvención", "Business Partners"],
    develops: [
      "Visión integral del negocio inmobiliario",
      "Comprensión práctica del ecosistema",
      "Criterio para identificar oportunidades",
      "Acompañamiento experto",
      "Proyección profesional dentro de la industria",
    ],
    areas: ["Negocio", "Ecosistema", "Acompañamiento", "Proyección"],
    includes: [
      "Diploma certificado de Capital Academy",
      "Acceso a la comunidad Capital Inteligente",
      "Sesiones online en vivo + encuentros presenciales",
      "Acompañamiento experto durante todo el programa",
      "Conexión con potenciales Business Partners",
    ],
    syllabus: [
      {
        num: 1,
        title: "Visión integral del negocio inmobiliario",
        topics: ["Cómo se gana dinero en el rubro", "Modelos de negocio", "Tipos de player"],
      },
      {
        num: 2,
        title: "Lectura del ecosistema",
        topics: ["Mapa del mercado", "Stakeholders clave", "Tendencias 2025–2030"],
      },
      {
        num: 3,
        title: "Identificación de oportunidades",
        topics: ["Nichos rentables", "Análisis de viabilidad", "Validación temprana"],
      },
      {
        num: 4,
        title: "Fundamentos comerciales del rubro",
        topics: ["Asesoría base", "Lenguaje técnico", "Marco legal aplicado"],
      },
      {
        num: 5,
        title: "Construcción de tu propuesta de valor",
        topics: ["Posicionamiento", "Marca personal", "Red profesional"],
      },
      {
        num: 6,
        title: "Plan de inserción 90 días",
        topics: ["Roadmap personal", "Indicadores", "Acompañamiento"],
      },
      {
        num: 7,
        title: "Proyecto integrador + Business Partners",
        topics: ["Pitch a panel", "Conexión con partners", "Devolución estratégica"],
      },
    ],
    highlight:
      "Cuando el desafío actual deja de crecer, puede comenzar una nueva etapa.",
    cta: "Quiero información de Ruta Inmobiliaria",
    href: "#detalle-ruta",
    theme: "lavender",
    cardImage: IMG.programaRutaCard,
    heroImage: IMG.programaRutaHero,
  },
};

export const PROGRAMS_LIST: ProgramMeta[] = [
  PROGRAMS.diplomado,
  PROGRAMS.liderazgo,
  PROGRAMS.ruta,
];

export type ProgramThemeStyles = {
  badge: string;
  badgeSolid: string;
  bar: string;
  ring: string;
  section: string;
  glyphFill: string;
  glyphStroke: string;
  chip: string;
};

export const themeStyles: Record<ProgramTheme, ProgramThemeStyles> = {
  lime: {
    badge: "bg-[var(--color-ca-lime)] text-[var(--color-ca-ink)]",
    badgeSolid: "bg-[var(--color-ca-lime)] text-[var(--color-ca-ink)]",
    bar: "from-[var(--color-ca-lime)] to-[var(--color-ca-lime-deep)]",
    ring: "ring-[var(--color-ca-lime)]/40",
    section: "bg-[var(--color-ca-bg)]",
    glyphFill: "var(--color-ca-lime)",
    glyphStroke: "var(--color-ca-ink)",
    chip: "bg-[var(--color-ca-lime)]/15 text-[var(--color-ca-violet-deep)] border-[var(--color-ca-lime-deep)]/30",
  },
  violet: {
    badge: "bg-[var(--color-ca-violet)] text-white",
    badgeSolid: "bg-[var(--color-ca-violet)] text-white",
    bar: "from-[var(--color-ca-violet)] to-[var(--color-ca-violet-deep)]",
    ring: "ring-[var(--color-ca-violet)]/40",
    section: "bg-[var(--color-ca-bg)]",
    glyphFill: "var(--color-ca-violet)",
    glyphStroke: "white",
    chip: "bg-[var(--color-ca-violet)]/10 text-[var(--color-ca-violet-deep)] border-[var(--color-ca-violet)]/25",
  },
  lavender: {
    badge: "bg-[var(--color-ca-violet-soft)] text-[var(--color-ca-violet-deep)]",
    badgeSolid:
      "bg-[var(--color-ca-violet-soft)] text-[var(--color-ca-violet-deep)]",
    bar: "from-[var(--color-ca-violet-soft)] to-[var(--color-ca-violet)]",
    ring: "ring-[var(--color-ca-violet-soft)]/60",
    section: "bg-[var(--color-ca-violet-soft)]",
    glyphFill: "var(--color-ca-violet-soft)",
    glyphStroke: "var(--color-ca-violet-deep)",
    chip: "bg-white text-[var(--color-ca-violet-deep)] border-[var(--color-ca-violet)]/25",
  },
};
