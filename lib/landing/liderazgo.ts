/**
 * Contenido de la landing del Programa de Liderazgo Comercial Inmobiliario.
 * Fuente: "Estructura Landing - Programa liderazgo.csv" (agosto 2026).
 * Los campos logísticos aún sin definir se muestran como "Por confirmar".
 */

export const LIDERAZGO = {
  nombre: "Programa de Liderazgo Comercial Inmobiliario",
  hero: {
    kicker: "Programa ejecutivo · Liderazgo comercial inmobiliario",
    titulo: "Lidera tu equipo comercial con sistema",
    bajada:
      "Aprende a atraer talento, integrar asesores, ordenar la gestión y desarrollar un sistema aplicable a tu equipo.",
    meta: ["16 horas", "4 jornadas presenciales", "Proyecto aplicado"],
    cta: "Quiero saber más",
  },
  queEncontraras: [
    "Un programa diseñado para el rubro inmobiliario",
    "Herramientas de uso inmediato",
    "Trabajo sobre el equipo real del participante",
    "Plan de implementación a seis meses",
  ],
  resultados: {
    titulo: "Al finalizar, podrás:",
    items: [
      "Definir el perfil de asesor que tu equipo necesita.",
      "Diseñar un proceso de selección y onboarding.",
      "Implementar rutinas de seguimiento y desarrollo.",
      "Gestionar metas, KPIs y pipeline con mayor claridad.",
      "Dar feedback y conducir conversaciones de desempeño.",
      "Fortalecer tu foco, gestión del tiempo y manejo de presión.",
      "Implementar un plan de liderazgo para los próximos seis meses.",
    ],
    cta: "Quiero desarrollar mi sistema",
  },
  jornadas: [
    {
      num: 1,
      titulo: "Atraer e integrar talento comercial",
      detalle:
        "Perfil del asesor, propuesta de valor, selección, entrevista y onboarding.",
      entregable: "Mapa de perfil y esquema inicial de onboarding.",
    },
    {
      num: 2,
      titulo: "Desarrollar y acompañar al equipo",
      detalle:
        "Motivación según autonomía, rutinas, coaching, feedback y planes de desarrollo.",
      entregable: "Rutina de acompañamiento y matriz de desarrollo.",
    },
    {
      num: 3,
      titulo: "Gestionar desempeño y resultados",
      detalle:
        "Metas de resultado y proceso, KPIs, pipeline review, reuniones e incentivos.",
      entregable: "Tablero base de seguimiento y revisión de pipeline.",
    },
    {
      num: 4,
      titulo: "Sostener el liderazgo e implementar",
      detalle:
        "Autoliderazgo, foco, presión, delegación, autonomía y conversaciones difíciles.",
      entregable: "Sistema de liderazgo comercial a seis meses.",
    },
  ],
  publico: {
    titulo: "¿Este programa es para ti?",
    intro:
      "Está dirigido a líderes y coordinadores que hoy tienen responsabilidad sobre personas, rutinas, metas y desarrollo comercial, especialmente:",
    perfiles: [
      "Líderes de equipos de venta con asesores inmobiliarios freelance.",
      "Líderes de equipos de corredores inmobiliarios freelance.",
    ],
    recomendado:
      "Perfil recomendado: experiencia comercial previa y responsabilidad actual sobre un equipo.",
  },
  // `foto`: ruta bajo public/ del retrato de la persona. Hoy las tres van en
  // null —la sesión de fotos del 10-08 cubrió a otros docentes— y la tarjeta
  // cae a las iniciales; cuando lleguen los retratos, basta llenar el campo.
  equipo: [
    {
      nombre: "Milena Zapata",
      rol: "Coach de líderes y equipos",
      bio: "Psicóloga organizacional, consultora y coach de líderes y equipos. Especialista en desarrollo de liderazgo, conversaciones y dinámicas colaborativas.",
      foto: null,
    },
    {
      nombre: "Paola Vicuña",
      rol: "Directora Académica · Capital Academy",
      bio: "Especialista en formación comercial de la industria inmobiliaria, profesionalización de asesores y liderazgo de equipos. Coach de líderes y equipos comerciales.",
      foto: null,
    },
    {
      nombre: "Diego de la Prida",
      rol: "Docente · Capital Academy",
      bio: null,
      foto: null,
    },
  ],
  formato: {
    titulo: "Una experiencia intensiva, presencial y orientada a implementación",
    datos: [
      // Confirmado por Elkis el 21-08-2026 (coincide con los avisos de la
      // campaña de diseño): la 1ª generación parte el viernes 25 de septiembre.
      { label: "Inicio de clases", valor: "Viernes 25 de septiembre de 2026" },
      { label: "Duración total", valor: "16 horas cronológicas" },
      { label: "Distribución", valor: "4 jornadas de 4 horas" },
      { label: "Horario sugerido", valor: "Viernes de 15:00 a 19:00 horas" },
      { label: "Modalidad", valor: "Presencial" },
      {
        label: "Cierre",
        valor:
          "Presentación ejecutiva del sistema de liderazgo de cada participante",
      },
    ],
    pendiente:
      "El lugar, el valor y los cupos están por confirmar: déjanos tus datos y recibirás la información completa apenas esté disponible.",
    cta: "Quiero recibir la información completa",
  },
  formulario: {
    titulo: "Da el primer paso para liderar con sistema",
    intro:
      "Completa tus datos para inscribirte o recibir más información sobre el Programa de Liderazgo Comercial Inmobiliario. El equipo de Capital Academy se pondrá en contacto contigo.",
    cta: "Enviar mi inscripción",
    // Aviso del formulario original: es lo que autoriza a usar los datos, así
    // que viaja con el formulario y no en una nota al pie que nadie lee.
    consentimiento:
      "Al completarlo autorizas a Capital Academy a usar esta información con fines académicos.",
    /**
     * Preguntas de calificación, calcadas del formulario de Google del programa
     * ("Formulario de registro— Programa de liderazgo"). Los textos y el orden
     * son los del formulario: quien lo respondió en Google y quien lo responda
     * acá tienen que ser comparables.
     */
    liderazgo: {
      label: "¿Lideras un equipo actualmente?",
      opciones: [
        "Sí",
        "No actualmente, pero tengo responsabilidades de coordinación",
        "No",
      ],
    },
    personas: {
      label: "¿Cuántas personas tienes a cargo hoy?",
      opciones: [
        "1 a 3 personas",
        "4 a 7 personas",
        "8 a 15 personas",
        "16 o más personas",
        "Ninguna",
      ],
    },
    desafios: {
      label: "¿Qué desafío de liderazgo estás viviendo hoy con más fuerza?",
      // En el original es de casillas: se elige más de uno.
      ayuda: "Puedes elegir más de uno.",
      opciones: [
        "Comunicación con el equipo",
        "Seguimiento y exigencia",
        "Motivación",
        "Manejo de conversaciones difíciles",
        "Desarrollo de personas",
        "Delegación de tareas y responsabilidades",
        "Orden y estructura",
        "Liderazgo personal / seguridad",
      ],
      otro: "Otro",
    },
  },
  cierre: {
    titulo: "Desarrolla personas. Ordena la gestión. Sostén los resultados.",
    bajada: "Capital Academy · Formación aplicada para la industria inmobiliaria.",
    cta: "Quiero inscribirme",
  },
} as const;
