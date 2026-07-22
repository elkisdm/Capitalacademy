import { LayoutDashboard, ShieldQuestion } from "lucide-react";
import type { Article } from "../types";

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
];
