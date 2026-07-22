import {
  GraduationCap,
  PlayCircle,
  CalendarDays,
  FolderOpen,
  ListChecks,
  ClipboardCheck,
  Award,
  UserCircle,
} from "lucide-react";
import { cohort, type Article } from "../types";

export const STUDENT_ARTICLES: Article[] = [
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
];
