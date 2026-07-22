import {
  LayoutDashboard,
  ShieldQuestion,
  CalendarClock,
  UploadCloud,
  QrCode,
  Video,
  ClipboardList,
  NotebookPen,
  MessagesSquare,
} from "lucide-react";
import { cohort, type Article } from "../types";

export const TEACHER_ARTICLES: Article[] = [
  {
    slug: "docente-empezar",
    audience: "teacher",
    category: "Empezar",
    icon: LayoutDashboard,
    title: "Bienvenido al panel del profesor",
    summary: "Activa tu cuenta y conoce tu panel de profesor.",
    overview:
      "Como profesor tienes tu propio panel en /docente, separado del classroom del alumno. Ahí ves tu agenda de clases, calificas a tus alumnos, participas en la comunidad del programa y encuentras esta misma guía.",
    steps: [
      "Abre el correo de invitación y crea tu contraseña.",
      "Inicia sesión con tu correo; el sistema te lleva directo a tu panel de profesor.",
      "En el panel encuentras tu agenda de clases, el acceso para calificar y el enlace a la comunidad.",
      "Si necesitas volver a esta guía, busca “Ayuda” en el encabezado del panel.",
    ],
    tips: [
      "Si dictas en más de un programa o cohorte, tu agenda las agrupa a todas en el mismo panel.",
    ],
    faqs: [
      {
        q: "No puedo iniciar sesión con mi cuenta de profesor.",
        a: "Usa el mismo correo al que llegó la invitación. Si el enlace para crear tu contraseña ya venció, pide que te reenvíen la invitación.",
      },
    ],
    route: () => "/docente",
    routeLabel: "Ir a tu panel",
  },
  {
    slug: "docente-alcance",
    audience: "teacher",
    category: "Empezar",
    icon: ShieldQuestion,
    title: "Qué ves y qué no",
    summary: "Los límites de tu cuenta de profesor, sin sorpresas.",
    overview:
      "Tu cuenta de profesor está pensada para dictar clase, no para administrar la plataforma. Conocer sus límites de entrada te evita perder tiempo buscando algo que no te corresponde.",
    steps: [
      "Ves solo las cohortes y clases donde estás asignado como profesor o ayudante, nunca las de otro programa.",
      "De cada alumno ves lo necesario para dictar y calificar: su nombre, su participación en tu clase y sus notas de tu evaluación.",
      "No tienes acceso al panel de administración (/admin): no creas usuarios, no matriculas alumnos y no generas cobros.",
      "Si necesitas algo fuera de estos límites —una matrícula, un cambio de cohorte, un cobro— pide ayuda al equipo de Capital Academy.",
    ],
    tips: [
      "Si además de dictar tienes una cuenta de administración, sí ves las pantallas correspondientes a ese otro rol, pero son dos accesos distintos.",
    ],
    faqs: [
      {
        q: "¿Por qué no veo el teléfono o el correo completo de mis alumnos?",
        a: "Esos datos los administra el equipo de matrículas. Tu panel te muestra lo que necesitas para dictar y calificar, no la ficha completa del alumno.",
      },
    ],
    route: () => "/docente",
    routeLabel: "Ir a tu panel",
  },
  {
    slug: "docente-panel",
    audience: "teacher",
    category: "Tu clase",
    icon: CalendarClock,
    title: "Tu agenda de clases",
    summary: "Próximas y pasadas, con su material y asistencia a un clic.",
    overview:
      "Tu panel lista todas tus clases: primero las próximas (de la más cercana a la más lejana), después las pasadas (de la más reciente hacia atrás). Cada una muestra su fecha, estado y modalidad.",
    steps: [
      "En “Próxima clase” ves la que viene, con fecha y cohorte.",
      "Cada clase trae una etiqueta de estado: Programada, En curso, Finalizada o Cancelada.",
      "Haz clic en “Ver detalle” para abrir el material y la asistencia de esa clase.",
      "El contador de “Alumnos” suma todos los matriculados activos de tus cohortes.",
    ],
    tips: [
      "Si una clase muestra que “la gestiona el equipo de la cohorte”, es porque estás asignado a esa clase puntual (no como profesor titular de la cohorte): puedes verla, pero el material y la asistencia los administra el equipo.",
    ],
    faqs: [
      {
        q: "No veo ninguna clase en mi panel.",
        a: "Aparecen aquí solo cuando el equipo te asigna una cohorte o una clase puntual. Si esperabas ver algo y no está, avísale al equipo.",
      },
    ],
    route: () => "/docente",
    routeLabel: "Ir a tu agenda",
  },
  {
    slug: "docente-material",
    audience: "teacher",
    category: "Tu clase",
    icon: UploadCloud,
    title: "Subir el material de tu clase",
    summary: "Adjunta archivos o enlaces y ya quedan a mano del alumno.",
    overview:
      "Desde el detalle de una clase puedes adjuntar el material que uses: una presentación, una plantilla o un enlace. Al alumno le aparece directamente en esa clase y también en “Recursos”, junto con el resto del material del programa.",
    steps: [
      "Abre tu clase y haz clic en “Ver detalle”.",
      "Elige si vas a subir un archivo o pegar un enlace.",
      "Ponle un título claro y el tipo de material (documento, PDF, plantilla u otro).",
      "Guarda: el material queda disponible de inmediato para tus alumnos.",
    ],
    tips: [
      "Puedes borrar un material más adelante si ya no corresponde; el alumno deja de verlo al instante.",
    ],
    faqs: [
      {
        q: "Subí un archivo pero no lo veo en Recursos del alumno.",
        a: "Recursos junta el material de todas las clases; recarga la página. Si sigue sin aparecer, revisa que quedó guardado en el detalle de la clase.",
      },
    ],
    route: () => "/docente",
    routeLabel: "Ir a tu agenda",
  },
  {
    slug: "docente-asistencia",
    audience: "teacher",
    category: "Tu clase",
    icon: QrCode,
    title: "Pasar asistencia con el QR",
    summary: "Proyecta el QR o pégalo en tu presentación; corrige a mano si hace falta.",
    overview:
      "Cada clase tiene su propio QR de asistencia. El alumno lo escanea y queda registrado como presente; tú puedes revisar la lista y marcar a mano a quien no alcanzó a escanear.",
    steps: [
      "En el detalle de tu clase, haz clic en el botón “QR”.",
      "Proyecta el código o descárgalo/imprímelo para pegarlo en tu presentación.",
      "Los alumnos lo escanean con su teléfono y quedan marcados como presentes.",
      "Debajo, en “Asistencia”, revisa quién falta y márcalo a mano si corresponde.",
    ],
    tips: [
      "También puedes copiar el enlace del QR y compartirlo por chat si no puedes proyectarlo.",
      "El buscador de la lista de asistencia te ayuda a encontrar a un alumno rápido en clases grandes.",
    ],
    faqs: [
      {
        q: "Un alumno dice que escaneó y no quedó marcado.",
        a: "Revisa la lista de asistencia y márcalo a mano; el QR es una ayuda, no la única forma de registrar presencia.",
      },
    ],
    route: () => "/docente",
    routeLabel: "Ir a tu agenda",
  },
  {
    slug: "docente-repeticion",
    audience: "teacher",
    category: "Tu clase",
    icon: Video,
    title: "La grabación de tu clase",
    summary: "Queda disponible sola; no tienes que hacer nada para publicarla.",
    overview:
      "Cuando dictas una clase en vivo, su grabación se procesa aparte y el equipo de Capital Academy la conecta a tu módulo como una lección más. No es algo que actives tú desde tu panel: aparece cuando está lista.",
    steps: [
      "Termina tu clase con normalidad; la grabación se sube y procesa por separado.",
      "Cuando el video queda listo, el equipo la enlaza a tu módulo como una clase grabada, con reproductor, capítulos y comentarios.",
      "Tus alumnos reciben un correo avisándoles que ya pueden verla.",
    ],
    tips: [
      "Si necesitas que una repetición se publique más rápido, o notas que falta, avísale al equipo de Capital Academy.",
    ],
    route: () => "/docente",
    routeLabel: "Ir a tu agenda",
  },
  {
    slug: "docente-evaluaciones",
    audience: "teacher",
    category: "Evaluar",
    icon: ClipboardList,
    title: "Evaluaciones de tu clase",
    summary: "Quién las crea, qué tipos hay, y qué te toca a ti.",
    overview:
      "El equipo de Capital Academy arma y programa las evaluaciones de tu programa: un quiz autocorregido o una evaluación manual (como un roleplay o un guión de venta), a veces con una fecha de apertura y una de cierre. Hoy no las creas ni las editas desde tu panel; tu parte empieza cuando toca calificar.",
    steps: [
      "El equipo define el tipo de evaluación (quiz autocorregido o manual) y, si aplica, su fecha de apertura y de cierre.",
      "Si tu alumno ya empezó a responder un quiz, siempre puede entregarlo aunque la fecha de cierre ya haya pasado.",
      "Cuando la evaluación está activa, tus alumnos la ven en su cohorte; las notas de un quiz se calculan y se publican solas.",
      "Tu parte es calificar: entra a “Calificar” en tu panel (ver el próximo artículo).",
    ],
    tips: [
      "Si necesitas una evaluación nueva, otra fecha de cierre o un cambio en las preguntas, pídeselo al equipo de Capital Academy — hoy eso no se edita desde tu panel de profesor.",
    ],
    faqs: [
      {
        q: "¿Puedo activar o programar yo una evaluación?",
        a: "No. Eso lo hace el equipo desde el panel de administración. Tu panel de profesor te deja calificar, no crear ni configurar evaluaciones.",
      },
    ],
    route: () => "/docente/notas",
    routeLabel: "Ir a Calificar",
  },
  {
    slug: "docente-notas",
    audience: "teacher",
    category: "Evaluar",
    icon: NotebookPen,
    title: "Calificar en escala 1-7",
    summary: "Nota, comentario y checklist por alumno; publica cuando estés listo.",
    overview:
      "En “Calificar” eliges una evaluación de tu cohorte y calificas a cada alumno: una nota de 1.0 a 7.0, un comentario y, si la evaluación tiene un checklist de criterios, marcas cuáles cumplió. Nada de esto lo ve el alumno hasta que lo publiques.",
    steps: [
      "Abre “Calificar” en tu panel y elige la evaluación y la cohorte.",
      "Ingresa la nota (1.0 a 7.0) y, si quieres, un comentario para el alumno.",
      "Si la evaluación tiene checklist, marca los criterios que cumplió.",
      "Usa “Guardar borrador” para revisarlo después, o “Guardar y publicar” para que el alumno lo vea de inmediato.",
      "¿Necesitas publicar varias notas de una vez? Usa “Publicar todas” arriba de la lista.",
    ],
    tips: [
      "Si prefieres cargar las notas desde una planilla, usa “Importar Excel”: acepta columnas email, nota (o porcentaje) y comentario, y te deja elegir si las publica de una vez o las deja como borrador.",
      "Si la evaluación es un quiz autocorregido, la nota del mejor intento ya aparece puesta y se publica sola: no hace falta que la cargues a mano.",
    ],
    faqs: [
      {
        q: "Ya hay una nota puesta y no la escribí yo.",
        a: "Es la nota automática de un quiz: se calcula con el mejor intento del alumno y se publica sola. Puedes dejarla así o sobrescribirla si corresponde.",
      },
      {
        q: "¿Puedo quitarle la nota a un alumno después de publicarla?",
        a: "Sí. Usa “Despublicar”: el alumno deja de verla hasta que la publiques de nuevo.",
      },
    ],
    route: () => "/docente/notas",
    routeLabel: "Ir a Calificar",
  },
  {
    slug: "docente-conversaciones",
    audience: "teacher",
    category: "Comunidad",
    icon: MessagesSquare,
    title: "Responder a tus alumnos",
    summary: "El foro del programa y los comentarios dentro de cada clase.",
    overview:
      "Tus alumnos conversan en dos lugares: el foro del programa (Conversaciones, compartido con las demás cohortes del mismo programa) y los comentarios dentro de cada clase grabada, anclados al minuto exacto del video. Puedes responder en ambos y moderar lo que ocurre en tu cohorte.",
    steps: [
      "Entra a “Conversaciones” desde tu panel o desde el classroom de tu cohorte.",
      "Abre un tema y responde igual que un alumno.",
      "Dentro de una clase grabada, revisa los comentarios anclados a un minuto del video y contesta ahí mismo.",
      "Si un tema necesita cerrarse o destacarse, puedes fijarlo o cerrarlo desde su detalle.",
    ],
    tips: [
      "El foro es por programa, no por cohorte: vas a ver preguntas de otras generaciones además de la tuya.",
    ],
    faqs: [
      {
        q: "¿Puedo borrar un comentario de un alumno?",
        a: "Sí, en el foro de tu cohorte puedes borrar cualquier comentario o respuesta, igual que en un tema que hayas abierto tú.",
      },
    ],
    route: (ctx) => cohort(ctx, "/conversaciones"),
    routeLabel: "Ir a Conversaciones",
  },
];
