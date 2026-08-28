/**
 * Contenido de la landing del Diplomado Ejecutivo en Ventas y Asesoría de
 * Inversión Inmobiliaria (5ª generación).
 * Fuente: "Estructura Landing - Diplomado.csv" (agosto 2026) + creativos del
 * Figma CAPITAL INTELIGENTE (ADS - DIPLOMADO): inicio 17 de octubre, 12 semanas.
 */

export const DIPLOMADO = {
  nombre: "Diplomado Ejecutivo en Ventas y Asesoría de Inversión Inmobiliaria",
  hero: {
    kicker: "Diplomado ejecutivo · 5ª generación",
    titulo: "Diplomado Ejecutivo en Ventas y Asesoría de Inversión Inmobiliaria",
    bajada:
      "Aprende a vender inversión inmobiliaria con fundamentos financieros, lectura de mercado y una metodología consultiva que te permita asesorar con mayor seguridad, estructura y profesionalismo.",
    meta: [
      "12 semanas de formación",
      "Modalidad híbrida",
      "17 profesores especialistas",
      "Certificación respaldada por Capital Inteligente",
    ],
    aviso: "Cupos limitados · Inicio de clases: 17 de octubre",
    cta: "Quiero saber más",
  },
  cambio: {
    titulo: "La forma de vender cambió, igual que la industria.",
    parrafos: [
      "Hoy los clientes esperan mucho más que una oferta de propiedades. Buscan comprender dónde están invirtiendo, evaluar sus alternativas y tomar decisiones con mayor seguridad.",
      "Por eso, el asesor inmobiliario necesita combinar habilidades comerciales con conocimientos financieros, lectura de mercado y una metodología clara de asesoría.",
    ],
    destacado:
      "Este diplomado fue creado para quienes quieren dejar de improvisar y comenzar a asesorar decisiones de inversión con un estándar más sólido y profesional.",
    cta: "Ver el programa",
  },
  programa: {
    titulo: "Una formación integral para convertirte en asesor",
    intro:
      "El diplomado reúne cuatro cursos complementarios que recorren todo el proceso de asesoría inmobiliaria: desde entender una inversión hasta construir relaciones comerciales sostenibles.",
    cursos: [
      {
        num: 1,
        titulo: "Pensar como inversionista",
        detalle:
          "Mercado inmobiliario, educación financiera y análisis de oportunidades de inversión.",
      },
      {
        num: 2,
        titulo: "Vender como asesor",
        detalle:
          "Diagnóstico del cliente, metodología comercial, construcción de propuestas, seguimiento y cierre.",
      },
      {
        num: 3,
        titulo: "Operar como profesional",
        detalle:
          "Crédito hipotecario, aspectos legales y tributarios, marketing aplicado e inteligencia artificial.",
      },
      {
        num: 4,
        titulo: "Sostener resultados",
        detalle:
          "Hábitos, mentalidad profesional, productividad e inteligencia emocional.",
      },
    ],
    cta: "Quiero saber más",
  },
  practica: {
    titulo: "Perfecciónate con práctica real",
    intro:
      "Durante 12 semanas combinarás sesiones online con jornadas prácticas presenciales sábado por medio.",
    horarios: [
      { dia: "Miércoles online", hora: "19:00 a 21:00 horas" },
      { dia: "Sábados por medio", hora: "09:30 a 16:30 horas" },
    ],
    detalle:
      "Trabajarás sobre casos reales, conversaciones comerciales y situaciones que forman parte del día a día de un asesor inmobiliario.",
    cta: "Ver el programa",
  },
  respaldo: {
    titulo: "Formación con respaldo",
    cifras: [
      { valor: "+100", label: "asesores formados" },
      { valor: "17", label: "profesores especialistas" },
      { valor: "9,5/10", label: "evaluación de satisfacción" },
      { valor: "Capital Inteligente", label: "certificación respaldada por" },
    ],
    cierre:
      "Convertirte en un asesor más preparado, más valioso y más competitivo para el mercado.",
    cta: "Quiero inscribirme",
  },
  formulario: {
    titulo: "Da el siguiente paso en tu carrera inmobiliaria",
    intro:
      "Completa tus datos para recibir información sobre el programa, fechas, valores y proceso de inscripción.",
    cta: "Enviar mi inscripción",
    consentimiento:
      "Al completarlo autorizas a Capital Academy a usar esta información con fines académicos.",
  },
} as const;
