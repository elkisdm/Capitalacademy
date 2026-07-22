import {
  GraduationCap,
  PlayCircle,
  CalendarDays,
  FolderOpen,
  ListChecks,
  ClipboardCheck,
  Award,
  UserCircle,
  BarChart3,
  UploadCloud,
  Video,
  QrCode,
  MessageCircle,
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
    slug: "clase-en-vivo",
    audience: "student",
    category: "Aprender",
    icon: Video,
    title: "Clases en vivo y su repetición",
    summary: "Únete a la clase y encuentra la grabación cuando quede lista.",
    overview:
      "Tus clases en vivo (online o presenciales) tienen su propia pantalla, con el botón para entrar a la reunión, el material que suba tu profesor y, después, la repetición.",
    steps: [
      "Abre la clase desde el Calendario.",
      "Si ya empezó o está por empezar, usa “Entrar a la clase” para unirte a la reunión.",
      "Revisa el material de la clase, si tu profesor subió alguno.",
      "Cuando el profesor publique la repetición, vuelve a esta misma pantalla: ahí aparece el video con capítulos, transcripción y comentarios, igual que una clase grabada.",
    ],
    tips: [
      "Mientras no haya repetición, la pantalla te avisa si aún está por publicarse o si la clase todavía no ocurre.",
      "Si la clase incluye un quiz, lo encuentras más abajo en la misma pantalla.",
    ],
    route: (ctx) => cohort(ctx, "/calendario"),
    routeLabel: "Ir al calendario",
  },
  {
    slug: "asistencia",
    audience: "student",
    category: "Aprender",
    icon: QrCode,
    title: "Marcar tu asistencia",
    summary: "Escanea el QR de la clase para registrar que asististe.",
    overview:
      "En cada clase en vivo tu profesor muestra (proyectado o impreso) un código QR. Escanéalo con tu teléfono para registrar tu asistencia; el registro queda asociado a esa clase.",
    steps: [
      "Durante la clase, abre la cámara de tu teléfono y apunta al QR que muestra tu profesor.",
      "Se abrirá una página con el nombre de la clase; confirma con “Registrar mi asistencia”.",
      "Verás una confirmación al instante. Si ya te habías registrado, la página te lo indica.",
    ],
    tips: [
      "El registro solo funciona desde 20 minutos antes de que empiece la clase y hasta 30 minutos después de que termina.",
      "Tu asistencia se toma en cuenta junto con la de tus compañeros; no afecta tus notas.",
    ],
    faqs: [
      {
        q: "Escaneé el QR pero me dice que el registro no está disponible.",
        a: "Puede ser que aún falten más de 20 minutos para que empiece la clase, o que ya pasaron más de 30 minutos desde que terminó.",
      },
    ],
  },
  {
    slug: "quizzes-practica",
    audience: "student",
    category: "Evaluaciones",
    icon: ListChecks,
    title: "Quizzes por clase",
    summary: "Cuentan para tus notas; no certifican el programa.",
    overview:
      "Algunas clases incluyen un quiz para que repases. No certifica el programa —eso lo hace solo el examen final—, pero la nota sí queda registrada: se publica sola apenas envías tus respuestas, la ves en la pantalla de Notas y entra al promedio de su módulo.",
    steps: [
      "Al terminar la clase, baja hasta “Evaluación de la clase”.",
      "Responde las preguntas y envía.",
      "Verás tu nota y la corrección al instante (con las respuestas correctas).",
      "Si tienes intentos disponibles, puedes volver a intentarlo: se guarda tu mejor nota.",
    ],
    tips: [
      "Hay cuatro tipos de pregunta: opción única, opción múltiple, verdadero/falso y respuesta corta.",
      "Los intentos son limitados; revisa cuántos te quedan antes de empezar.",
      "Algunos quizzes tienen fecha de apertura y cierre. Si ya empezaste a responder, puedes enviar tus respuestas aunque la ventana cierre mientras lo hacías.",
    ],
    faqs: [
      {
        q: "¿Esta nota cuenta para mi certificado?",
        a: "No. Solo el examen final certifica el programa. Pero sí es una nota real: la ves en “Tus notas” y entra al promedio de su módulo.",
      },
      {
        q: "¿Por qué mi promedio cambió después de responder un quiz?",
        a: "Porque la nota se publica automáticamente al enviarlo, sin que nadie la revise, y desde ese momento cuenta en el promedio del módulo al que pertenece.",
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
    tips: [
      "Tienes un número limitado de intentos; aprovéchalos cuando te sientas preparado.",
      "El examen también puede tener fecha de apertura y cierre. Si ya empezaste a responder, puedes enviarlo aunque la ventana cierre mientras lo hacías.",
      "Al enviarlo, tu nota queda registrada en “Tus notas” además de definir si apruebas y obtienes el certificado.",
    ],
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
    slug: "notas",
    audience: "student",
    category: "Evaluaciones",
    icon: BarChart3,
    title: "Tus notas",
    summary: "El consolidado de tus evaluaciones ya calificadas.",
    overview:
      "“Tus notas” reúne todas las evaluaciones que tu profesor (o un quiz) ya calificó, agrupadas por módulo, en la escala chilena de 1 a 7.",
    steps: [
      "Abre “Notas” en el menú de tu programa.",
      "Revisa tus notas agrupadas por módulo; cada grupo muestra su propio promedio.",
      "Si una evaluación aún no tiene nota publicada, simplemente no aparece todavía.",
    ],
    tips: [
      "El promedio se calcula solo con lo ya calificado: una evaluación pendiente no lo hace bajar.",
      "Si alguna evaluación del módulo tiene un peso asignado, el promedio se calcula ponderado por ese peso, y las evaluaciones sin peso quedan fuera del cálculo (la pantalla te lo indica).",
    ],
    route: (ctx) => cohort(ctx, "/notas"),
    routeLabel: "Ir a mis notas",
  },
  {
    slug: "entregables",
    audience: "student",
    category: "Evaluaciones",
    icon: UploadCloud,
    title: "Entregar tus trabajos",
    summary: "Sube tus archivos antes de la fecha límite.",
    overview:
      "“Entregables” reúne las tareas que tu programa te pide subir, con su fecha límite y los tipos de archivo permitidos.",
    steps: [
      "Abre “Entregables” en el menú de tu programa.",
      "Elige la tarea y sube tu archivo dentro del tamaño y formato permitidos.",
      "Si la tarea admite un solo archivo, subir uno nuevo reemplaza al anterior; si admite varios, se agrega a los que ya subiste.",
    ],
    tips: [
      "Una tarea puede tener también una fecha de apertura: no podrás subir nada antes de esa fecha.",
      "Una vez que la fecha límite pasa, la tarea se cierra y ya no puedes subir ni reemplazar archivos.",
    ],
    faqs: [
      {
        q: "Subí el archivo equivocado, ¿puedo cambiarlo?",
        a: "Sí, mientras la ventana siga abierta: si la tarea admite un solo archivo, sube el correcto y reemplaza al anterior.",
      },
    ],
    route: (ctx) => cohort(ctx, "/entregables"),
    routeLabel: "Ir a Entregables",
  },
  {
    slug: "conversaciones",
    audience: "student",
    category: "Comunidad",
    icon: MessageCircle,
    title: "La comunidad del programa",
    summary: "Comparte dudas y avances con todo el programa.",
    overview:
      "“Conversaciones” es el foro de tu programa: se comparte entre todas las generaciones, no solo con tu cohorte. Es distinto del comentario que dejas dentro de una clase, que solo lo ven quienes ven esa clase.",
    steps: [
      "Abre “Conversaciones” en el menú de tu programa.",
      "Elige una categoría o crea un tema nuevo con un título y tu mensaje.",
      "Entra a un tema para leer las respuestas y agregar la tuya.",
      "Usa “Guardar” en un tema para volver a encontrarlo después, y ordena por recientes, populares o sin responder.",
    ],
    tips: [
      "Como el foro es por programa, verás mensajes de otras cohortes además de la tuya.",
      "Si tienes una duda sobre un momento puntual de una clase, coméntala directamente en esa clase; para temas más generales, usa Conversaciones.",
    ],
    route: (ctx) => cohort(ctx, "/conversaciones"),
    routeLabel: "Ir a Conversaciones",
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
