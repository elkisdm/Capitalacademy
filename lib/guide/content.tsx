import {
  GraduationCap,
  PlayCircle,
  CalendarDays,
  ClipboardCheck,
  Award,
  UserCircle,
  FolderOpen,
  Users,
  BookOpen,
  ListChecks,
  BarChart3,
  CreditCard,
  ShieldCheck,
  Video,
  FileSpreadsheet,
  Eye,
  type LucideIcon,
} from "lucide-react";

/**
 * Contenido del Centro de Ayuda. Cada artículo es una "página dedicada" por
 * ruta/uso. El índice y la página de artículo consumen esta misma fuente.
 */

export type GuideCtx = { cohortSlug: string | null; adminCohortId: string | null };

export type Faq = { q: string; a: string };

export type Article = {
  slug: string;
  audience: "student" | "team";
  category: string;
  icon: LucideIcon;
  title: string;
  summary: string; // para la tarjeta del índice
  overview: string; // "para qué sirve"
  steps: string[];
  tips?: string[];
  faqs?: Faq[];
  route?: (ctx: GuideCtx) => string | null;
  routeLabel?: string;
};

const cohort = (ctx: GuideCtx, sub: string) =>
  ctx.cohortSlug ? `/classroom/${ctx.cohortSlug}${sub}` : null;

export const ARTICLES: Article[] = [
  // ─────────────────────────── ALUMNO ───────────────────────────
  {
    slug: "mis-programas",
    audience: "student",
    category: "Empezar",
    icon: GraduationCap,
    title: "Tus programas",
    summary: "El punto de partida: ve tus programas y tu avance.",
    overview:
      "“Mis programas” reúne todos los programas en los que estás inscrito. Desde aquí entras a sus módulos, clases y evaluaciones.",
    steps: [
      "Abre “Mis programas” en el menú lateral.",
      "Haz clic en un programa para ver sus módulos.",
      "Dentro de cada módulo verás las lecciones grabadas y las clases en vivo.",
    ],
    tips: ["Tu avance se calcula automáticamente a partir de las clases que completas."],
    faqs: [
      {
        q: "No veo ningún programa, ¿por qué?",
        a: "Significa que aún no tienes una matrícula activa. Si crees que es un error, escríbenos a soporte (más abajo).",
      },
    ],
    route: () => "/classroom",
    routeLabel: "Ir a Mis programas",
  },
  {
    slug: "ver-clase",
    audience: "student",
    category: "Aprender",
    icon: PlayCircle,
    title: "Ver una clase grabada",
    summary: "Video, capítulos, transcripción, resumen y comentarios.",
    overview:
      "El reproductor está pensado para que aprendas a tu ritmo. Además del video, tienes capítulos, transcripción, un resumen generado por IA y un espacio de comentarios con tu profesor.",
    steps: [
      "Entra a un módulo y elige una lección.",
      "Reproduce el video; ajusta la velocidad (0.5x–2x), activa subtítulos o pantalla completa.",
      "Usa los capítulos para saltar a un tema puntual.",
      "Abre las pestañas Transcripción, Resumen (IA) y Comentarios en el panel lateral.",
      "Tu progreso se guarda solo; al ver el video completo queda marcado como completado.",
    ],
    tips: [
      "¿Una duda sobre un momento específico? Comenta en ese minuto del video y tu profesor responde ahí.",
      "Si una clase aparece bloqueada, es porque se abre en una fecha programada.",
      "Algunas clases no son de video sino de texto/diapositiva: al abrirlas ves la explicación con su material y un botón para marcarla como completada.",
    ],
    faqs: [
      {
        q: "¿Se guarda dónde quedé?",
        a: "Sí. Al volver, el video retoma desde tu última posición y tu avance queda registrado.",
      },
      {
        q: "Descargué un material y el enlace dejó de funcionar.",
        a: "Los archivos usan un enlace temporal por seguridad. Recarga la página de la clase para obtener uno nuevo.",
      },
    ],
    route: () => "/classroom",
    routeLabel: "Ir a mis clases",
  },
  {
    slug: "calendario",
    audience: "student",
    category: "Aprender",
    icon: CalendarDays,
    title: "Calendario de clases en vivo",
    summary: "Tus clases en vivo, con material y recordatorios.",
    overview:
      "El calendario muestra tus clases en vivo (online o presenciales) con fecha, profesor y el material de cada una. Recibes un recordatorio por correo antes de cada clase.",
    steps: [
      "Abre “Calendario” en el menú.",
      "Cambia entre vista de lista y vista de mes.",
      "Entra a una clase para ver detalles y descargar su material.",
      "Cuando la clase esté en vivo, usa el botón para unirte a la reunión.",
    ],
    tips: ["Las clases canceladas se marcan como tal y no muestran el botón de ingreso."],
    route: (ctx) => cohort(ctx, "/calendario"),
    routeLabel: "Ir al calendario",
  },
  {
    slug: "recursos",
    audience: "student",
    category: "Aprender",
    icon: FolderOpen,
    title: "Centro de recursos",
    summary: "Todo el material del programa en un solo lugar.",
    overview:
      "“Recursos” reúne en una sola pantalla todos los archivos, plantillas y enlaces de tu programa —tanto de las clases grabadas como de las clases en vivo— para que los encuentres rápido sin entrar clase por clase.",
    steps: [
      "Abre “Recursos” en el menú lateral.",
      "Verás el material agrupado: primero las clases grabadas (por módulo) y luego las clases en vivo.",
      "Haz clic en un recurso para descargarlo o abrir el enlace.",
    ],
    tips: ["Si una clase aún no tiene material publicado, no aparecerá aquí todavía."],
    route: (ctx) => cohort(ctx, "/recursos"),
    routeLabel: "Ir a Recursos",
  },
  {
    slug: "quizzes-practica",
    audience: "student",
    category: "Evaluaciones",
    icon: ListChecks,
    title: "Quizzes de práctica",
    summary: "Práctica al final de la clase. No afecta tu certificado.",
    overview:
      "Algunas clases incluyen un quiz formativo para que repases. Es práctica: no bloquea tu avance ni influye en tu certificado. Puedes reintentarlo.",
    steps: [
      "Al terminar la clase, baja hasta “Evaluación de la clase”.",
      "Responde las preguntas y envía.",
      "Verás tu nota y la corrección al instante (con las respuestas correctas).",
      "Si quieres reforzar, vuelve a intentarlo.",
    ],
    tips: ["Hay cuatro tipos de pregunta: opción única, opción múltiple, verdadero/falso y respuesta corta."],
    faqs: [
      {
        q: "¿Esta nota cuenta para mi certificado?",
        a: "No. Solo el examen final certifica. Los quizzes de práctica son para que aprendas mejor.",
      },
    ],
  },
  {
    slug: "examen-final",
    audience: "student",
    category: "Evaluaciones",
    icon: ClipboardCheck,
    title: "Examen final",
    summary: "El examen que certifica el programa.",
    overview:
      "El examen final certifica el programa. Se habilita cuando completas el porcentaje de contenido requerido; al aprobarlo se genera tu certificado.",
    steps: [
      "Abre “Quiz final” en el menú de tu programa.",
      "Si aún no está disponible, la pantalla te indica cuánto contenido te falta completar.",
      "Cuando esté listo, rinde el examen.",
      "Al aprobar, tu certificado se genera automáticamente.",
    ],
    tips: ["Tienes un número limitado de intentos; aprovéchalos cuando te sientas preparado."],
    faqs: [
      {
        q: "Me dice que no está disponible todavía.",
        a: "Necesitas completar un porcentaje mínimo del contenido del programa antes de rendirlo. La pantalla te muestra cuánto te falta.",
      },
    ],
    route: (ctx) => cohort(ctx, "/quiz"),
    routeLabel: "Ir al examen final",
  },
  {
    slug: "certificado",
    audience: "student",
    category: "Evaluaciones",
    icon: Award,
    title: "Tu certificado",
    summary: "Descarga tu certificado y compártelo verificable.",
    overview:
      "Al aprobar el examen final obtienes tu certificado en PDF, con un código de verificación público para comprobar su autenticidad.",
    steps: [
      "Entra a “Certificado” desde el menú de tu programa.",
      "Descarga el PDF o compártelo.",
      "El código permite a cualquiera verificar que es auténtico.",
    ],
    tips: ["Solo el examen final emite certificado; los quizzes de práctica no."],
    faqs: [
      {
        q: "Aprobé pero no veo el certificado.",
        a: "A veces la generación tarda. Entra a la pantalla de certificado y usa el botón para reintentar la generación.",
      },
    ],
    route: (ctx) => cohort(ctx, "/certificado"),
    routeLabel: "Ir a mi certificado",
  },
  {
    slug: "perfil",
    audience: "student",
    category: "Tu cuenta",
    icon: UserCircle,
    title: "Tu perfil",
    summary: "Mantén tu foto y tus datos al día.",
    overview: "En tu perfil editas tu foto, teléfono, RUT y cumpleaños.",
    steps: ["Abre “Mi perfil” desde tu avatar (abajo a la izquierda).", "Edita tus datos y guarda."],
    route: () => "/classroom/profile",
    routeLabel: "Ir a mi perfil",
  },

  // ─────────────────────────── EQUIPO ───────────────────────────
  {
    slug: "usuarios",
    audience: "team",
    category: "Personas",
    icon: Users,
    title: "Usuarios y matrículas",
    summary: "Crea cuentas, asigna roles y matricula alumnos.",
    overview:
      "El panel de Usuarios centraliza todas las cuentas. Creas usuarios, los filtras, los asignas a cohortes con un rol y gestionas sus invitaciones.",
    steps: [
      "Crea usuarios uno por uno con “Nuevo usuario” o en masa con “Importar CSV”.",
      "Filtra por entorno (programa), por estado (activos/pendientes) y por rol.",
      "Usa el menú de cada usuario para ver su perfil, editarlo, asignarlo a una cohorte o desactivarlo.",
      "Reenvía la invitación a quienes aún no activan su cuenta.",
      "Marca alumnos “Capital Inteligente” para mostrarles clases exclusivas de ese segmento.",
    ],
    tips: ["Solo un Administrador puede crear o ascender cuentas a Ops/Admin; un Ops gestiona alumnos."],
    faqs: [
      {
        q: "¿Qué diferencia hay entre desactivar y eliminar?",
        a: "Desactivar bloquea el acceso y cierra las sesiones, pero conserva los datos para poder reactivar. No hay borrado destructivo.",
      },
    ],
    route: () => "/admin/users",
    routeLabel: "Ir a Usuarios",
  },
  {
    slug: "roles",
    audience: "team",
    category: "Personas",
    icon: ShieldCheck,
    title: "Roles y permisos",
    summary: "Quién puede hacer qué, a nivel plataforma y por cohorte.",
    overview:
      "Hay dos niveles de rol. El rol de plataforma define el acceso al panel; el rol por cohorte define qué hace dentro de un programa.",
    steps: [
      "Rol de plataforma: Administrador (todo), Ops (gestión sin tocar otros admins) y Usuario (solo su classroom).",
      "Rol por cohorte: Alumno (ve contenido y rinde), Profesor (imparte y gestiona sus módulos) y Ayudante (apoya al profesor).",
      "Un alumno siempre tiene una matrícula asociada a su cohorte.",
    ],
    tips: [
      "Ser Administrador de plataforma no te da acceso a una cohorte donde no tienes rol; el staff sí puede entrar a cualquier classroom para revisar.",
    ],
    route: () => "/admin/users",
    routeLabel: "Ir a Usuarios",
  },
  {
    slug: "importar-csv",
    audience: "team",
    category: "Personas",
    icon: FileSpreadsheet,
    title: "Importar usuarios por CSV",
    summary: "Carga muchos alumnos de una vez.",
    overview:
      "La importación masiva crea (o asigna) varios usuarios a la vez desde un archivo, y opcionalmente les envía la invitación.",
    steps: [
      "En Usuarios, abre “Importar CSV” y descarga la plantilla.",
      "Completa: nombre, email, teléfono y RUT (los dos primeros son obligatorios).",
      "Sube el archivo y revisa la vista previa: marca duplicados y filas con error.",
      "Elige la cohorte de destino y si quieres enviar invitaciones.",
      "Confirma; al final ves un resumen de creados, asignados y omitidos.",
    ],
    tips: [
      "Hasta ~50 filas por carga. Si un email ya existe, se asigna a la cohorte sin duplicar la cuenta.",
    ],
    route: () => "/admin/users",
    routeLabel: "Ir a Usuarios",
  },
  {
    slug: "contenido",
    audience: "team",
    category: "Contenido",
    icon: BookOpen,
    title: "Módulos y lecciones",
    summary: "Estructura el programa y ordena su contenido.",
    overview:
      "Aquí construyes la estructura de cada programa: módulos que contienen lecciones grabadas, más las clases en vivo de la cohorte.",
    steps: [
      "Elige el programa y la cohorte (la cohorte filtra las clases en vivo).",
      "Crea módulos y, dentro, lecciones grabadas.",
      "Reordena lecciones con las flechas y muévelas entre módulos del mismo programa.",
      "Usa “apertura por calendario” para que una lección se desbloquee en una fecha.",
    ],
    tips: ["No se puede eliminar una lección o módulo con progreso de alumnos o clases vinculadas; la plataforma te avisa."],
    route: () => "/admin/lessons",
    routeLabel: "Ir a Lecciones",
  },
  {
    slug: "video",
    audience: "team",
    category: "Contenido",
    icon: Video,
    title: "Video o contenido de la clase",
    summary: "Una clase puede ser de video o de texto/diapositiva.",
    overview:
      "Una lección no tiene que ser de video. Puede ser una clase de texto: una explicación con formato (títulos, listas, imágenes intercaladas) que el alumno lee. Así una clase puede ser un video, un contenido escrito, o ambos con su material.",
    steps: [
      "Entra al editor de la lección con “Editar”.",
      "Para video: arrastra el archivo (MP4, MOV o WebM, hasta 12 GB) y espera el procesamiento.",
      "Para una clase de texto: escribe en “Contenido de la clase” usando Markdown; con “Insertar imagen” intercalas diapositivas o capturas. La pestaña “Vista previa” muestra cómo lo verá el alumno.",
      "Si la lección no tiene video, el alumno ve el contenido escrito y su material, con un botón para marcarla como completada.",
    ],
    tips: ["Una clase puede combinar video y contenido escrito; ambos son opcionales."],
    route: () => "/admin/lessons",
    routeLabel: "Ir a Lecciones",
  },
  {
    slug: "calendario-admin",
    audience: "team",
    category: "Contenido",
    icon: CalendarDays,
    title: "Calendario y clases en vivo",
    summary: "Agenda clases en vivo y carga su material.",
    overview:
      "Las clases en vivo viven en el calendario de cada cohorte. Defines fecha, profesor, modalidad y el material que verá el alumno.",
    steps: [
      "Crea o edita una sesión: título, inicio/fin, modalidad, instructor, link de reunión y módulo.",
      "Elige la audiencia: toda la cohorte o solo el segmento “Capital Inteligente”.",
      "Adjunta el “Material de la clase” (archivos o enlaces).",
      "La plataforma envía recordatorios automáticos antes de cada clase.",
    ],
    tips: ["Una clase solo puede vincularse a un módulo de su propio programa."],
    route: (ctx) => (ctx.adminCohortId ? `/admin/cohorts/${ctx.adminCohortId}/sesiones` : null),
    routeLabel: "Ir al calendario",
  },
  {
    slug: "recursos-admin",
    audience: "team",
    category: "Contenido",
    icon: FolderOpen,
    title: "Recursos y materiales",
    summary: "Sube PDFs, plantillas y enlaces, todo desde Lecciones.",
    overview:
      "La gestión de material se hace en un solo lugar: el editor de Lecciones. Tanto las lecciones grabadas como las clases en vivo del calendario adjuntan ahí su material, y el alumno lo descarga con un enlace seguro y temporal.",
    steps: [
      "Entra a “Lecciones” y elige el programa (y la cohorte para las clases en vivo).",
      "Para una lección grabada: abre su editor con “Editar” y agrega un archivo (hasta 50 MB) o un enlace.",
      "Para una clase en vivo: abre su panel “Material” (botón en la fila) y sube el archivo o enlace ahí mismo, sin salir a otra pantalla.",
    ],
    tips: [
      "Acepta cualquier tipo de archivo. Los enlaces solo admiten http/https por seguridad.",
      "La antigua página “Recursos por lección” ahora redirige a Lecciones: todo se gestiona desde un mismo lugar.",
    ],
    route: () => "/admin/lessons",
    routeLabel: "Ir a Lecciones",
  },
  {
    slug: "quizzes-clase",
    audience: "team",
    category: "Evaluación",
    icon: ListChecks,
    title: "Quizzes por clase (práctica)",
    summary: "Evaluaciones formativas dentro de cada lección.",
    overview:
      "Crea quizzes de práctica en cada lección. No certifican ni bloquean el avance; sirven para reforzar lo aprendido.",
    steps: [
      "En el editor de una lección, baja a “Evaluación de la clase” y créala.",
      "Agrega preguntas de cualquiera de los 4 tipos: opción única, opción múltiple, verdadero/falso o respuesta corta.",
      "Actívala para que el alumno la vea (requiere al menos una pregunta).",
    ],
    tips: [
      "La respuesta corta se corrige ignorando mayúsculas, tildes y espacios.",
      "La opción múltiple exige marcar exactamente las respuestas correctas (sin puntaje parcial).",
    ],
    route: () => "/admin/lessons",
    routeLabel: "Ir a Lecciones",
  },
  {
    slug: "examen-final-admin",
    audience: "team",
    category: "Evaluación",
    icon: ClipboardCheck,
    title: "Examen final y configuración",
    summary: "Configura el examen que certifica el programa.",
    overview:
      "El examen final es el que emite certificado. Defines sus reglas, cargas el pool de preguntas y revisas intentos y certificados.",
    steps: [
      "En “Quizzes”, ajusta la Configuración: completitud mínima, nota de aprobación e intentos.",
      "Carga las preguntas manualmente o genéralas con IA a partir del contenido del programa.",
      "Activa el examen y revisa los intentos y certificados en sus pestañas.",
    ],
    tips: [
      "El examen final solo admite preguntas de opción única (A–D). Los otros tipos son para los quizzes de práctica.",
    ],
    faqs: [
      {
        q: "¿Puedo poner preguntas de verdadero/falso en el examen final?",
        a: "Por ahora el examen final usa solo opción única. Para esos tipos, úsalos en los quizzes de práctica por clase.",
      },
    ],
    route: () => "/admin/quizzes",
    routeLabel: "Ir a Quizzes",
  },
  {
    slug: "certificacion",
    audience: "team",
    category: "Evaluación",
    icon: Award,
    title: "Certificación",
    summary: "Emisión y verificación de certificados.",
    overview:
      "El certificado se emite automáticamente cuando un alumno aprueba el examen final. Es verificable públicamente y único por matrícula.",
    steps: [
      "Revisa los certificados emitidos en la pestaña “Certificados” de Quizzes.",
      "Descarga o reemite si una generación falló.",
      "Cualquiera puede verificar un certificado con su código en /verificar.",
    ],
    tips: ["Solo el examen final emite certificado; aprobar un quiz de práctica no lo habilita."],
    route: () => "/admin/quizzes",
    routeLabel: "Ir a Quizzes",
  },
  {
    slug: "progreso",
    audience: "team",
    category: "Operación",
    icon: BarChart3,
    title: "Progreso de la cohorte",
    summary: "Mira el avance de cada alumno y detecta riesgo.",
    overview:
      "El reporte de progreso muestra cuánto ha avanzado cada alumno, por módulo, para que identifiques a quienes necesitan acompañamiento.",
    steps: [
      "Elige la cohorte.",
      "Revisa el promedio, quiénes completaron y quiénes van atrasados (menos de 30%).",
      "Haz clic en un alumno para ver su detalle por módulo.",
    ],
    route: () => "/admin/progress",
    routeLabel: "Ir a Progreso",
  },
  {
    slug: "cobros",
    audience: "team",
    category: "Operación",
    icon: CreditCard,
    title: "Cobros y pagos",
    summary: "Genera enlaces de cobro para montos puntuales.",
    overview:
      "Crea un enlace de cobro firmado para un monto específico y compártelo. El cliente paga al contado o en cuotas, con el recargo calculado automáticamente.",
    steps: [
      "Define el monto y el concepto.",
      "Genera el enlace y compártelo por correo o WhatsApp.",
      "El cliente elige contado, 6 o 12 cuotas y paga por Flow.",
    ],
    tips: ["El monto va firmado: el cliente no puede alterarlo desde el enlace."],
    route: () => "/admin/cobros",
    routeLabel: "Ir a Cobros",
  },
  {
    slug: "entornos-vista",
    audience: "team",
    category: "Operación",
    icon: Eye,
    title: "Entorno activo y “Ver como”",
    summary: "Enfoca el panel a un programa y revisa la vista del alumno.",
    overview:
      "Arriba del menú tienes dos controles de staff. El selector de “Entorno” enfoca el panel a un programa (Diplomado, Workshop, Liderazgo), y el interruptor “Ver como: Admin / Alumno” te deja revisar la experiencia del estudiante sin perder tu acceso de administrador.",
    steps: [
      "Elige el “Entorno” para que Usuarios, Progreso y Quizzes muestren solo ese programa.",
      "Cambia a “Alumno” para recorrer el classroom como lo ve un estudiante; vuelve con “Admin”.",
      "Es un cambio de VISTA, no de permisos: tu rol y lo que puedes hacer no cambian.",
    ],
    tips: [
      "Estando en el panel (/admin) siempre ves la navegación de administrador, aunque hayas dejado activado “Ver como alumno”.",
    ],
  },
];

export const STUDENT_CATEGORIES = ["Empezar", "Aprender", "Evaluaciones", "Tu cuenta"];
export const TEAM_CATEGORIES = ["Personas", "Contenido", "Evaluación", "Operación"];

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

export function articlesByAudience(audience: "student" | "team"): Article[] {
  return ARTICLES.filter((a) => a.audience === audience);
}
