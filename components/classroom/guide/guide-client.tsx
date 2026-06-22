"use client";

import { useState } from "react";
import Link from "next/link";
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
  ArrowRight,
  Lightbulb,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

type Section = {
  icon: LucideIcon;
  title: string;
  description: string;
  steps?: string[];
  tip?: string;
  link?: { href: string; label: string } | null;
};

export function GuideClient({
  isStaff,
  cohortSlug,
  adminCohortId,
  firstName,
}: {
  isStaff: boolean;
  cohortSlug: string | null;
  adminCohortId: string | null;
  firstName: string | null;
}) {
  const [tab, setTab] = useState<"student" | "team">("student");

  const cohort = (sub: string) => (cohortSlug ? `/classroom/${cohortSlug}${sub}` : null);

  const studentSections: Section[] = [
    {
      icon: GraduationCap,
      title: "Tus programas",
      description:
        "El punto de partida. Aquí ves todos los programas en los que estás inscrito y tu avance en cada uno.",
      steps: [
        "Entra a “Mis programas” en el menú lateral.",
        "Haz clic en un programa para ver sus módulos y clases.",
      ],
      link: { href: "/classroom", label: "Ir a Mis programas" },
    },
    {
      icon: PlayCircle,
      title: "Ver una clase grabada",
      description:
        "El reproductor tiene todo para que aprendas a tu ritmo: video, capítulos, transcripción, resumen y comentarios.",
      steps: [
        "Entra a un módulo y elige una lección.",
        "Usa los controles: velocidad (0.5x–2x), subtítulos, capítulos y pantalla completa.",
        "Abre las pestañas de Transcripción, Resumen (IA) y Comentarios.",
        "Tu progreso se guarda solo; al terminar el video queda marcado como completado.",
      ],
      tip: "¿Una duda puntual? Deja un comentario en el minuto exacto del video; tu profesor responde ahí.",
      link: { href: "/classroom", label: "Ir a mis clases" },
    },
    {
      icon: CalendarDays,
      title: "Calendario de clases en vivo",
      description:
        "Tus clases en vivo (online o presenciales) con fecha, profesor y el material de cada clase.",
      steps: [
        "Abre “Calendario” en el menú.",
        "Cambia entre vista de lista y vista de mes.",
        "Descarga el material de cada clase y entra a la reunión cuando esté en vivo.",
      ],
      tip: "Recibes un recordatorio por correo antes de cada clase.",
      link: cohort("/calendario") ? { href: cohort("/calendario")!, label: "Ir al calendario" } : null,
    },
    {
      icon: ListChecks,
      title: "Quizzes de práctica",
      description:
        "Al final de algunas clases hay un quiz formativo. Es práctica: no bloquea tu avance ni afecta tu certificado.",
      steps: [
        "Al terminar la clase, baja hasta “Evaluación de la clase”.",
        "Responde y envía: verás tu nota y la corrección al instante.",
        "Puedes reintentar para reforzar lo aprendido.",
      ],
      tip: "Hay 4 tipos de pregunta: opción única, opción múltiple, verdadero/falso y respuesta corta.",
      link: null,
    },
    {
      icon: ClipboardCheck,
      title: "Examen final",
      description:
        "El examen que certifica el programa. Se habilita cuando completas el porcentaje de contenido requerido.",
      steps: [
        "Abre “Quiz final” en el menú.",
        "Si aún no está disponible, te indica cuánto contenido te falta completar.",
        "Cuando esté listo, rinde el examen; al aprobar se genera tu certificado.",
      ],
      link: cohort("/quiz") ? { href: cohort("/quiz")!, label: "Ir al examen final" } : null,
    },
    {
      icon: Award,
      title: "Tu certificado",
      description:
        "Al aprobar el examen final obtienes tu certificado en PDF, con un código de verificación público.",
      steps: [
        "Entra a “Certificado” desde el menú de tu programa.",
        "Descárgalo o compártelo; el código permite verificar su autenticidad.",
      ],
      tip: "Solo el examen final emite certificado. Los quizzes de práctica no.",
      link: cohort("/certificado") ? { href: cohort("/certificado")!, label: "Ir a mi certificado" } : null,
    },
    {
      icon: UserCircle,
      title: "Tu perfil",
      description: "Mantén tus datos al día: foto, teléfono, RUT y cumpleaños.",
      steps: ["Abre “Mi perfil” desde tu avatar.", "Edita y guarda tus datos."],
      link: { href: "/classroom/profile", label: "Ir a mi perfil" },
    },
  ];

  const teamSections: Section[] = [
    {
      icon: Users,
      title: "Usuarios y matrículas",
      description:
        "Crea y gestiona cuentas, asigna roles y matricula alumnos en sus cohortes.",
      steps: [
        "Crea usuarios uno por uno (“Nuevo usuario”) o en masa (“Importar CSV”).",
        "Filtra por entorno (programa), estado (activos/pendientes) y rol.",
        "Asigna a una cohorte con su rol: alumno, profesor o ayudante.",
        "Envía o reenvía invitaciones de activación de cuenta.",
        "Marca alumnos “Capital Inteligente” para mostrarles clases exclusivas.",
      ],
      tip: "Solo un Administrador puede crear o ascender cuentas a Ops/Admin.",
      link: { href: "/admin/users", label: "Ir a Usuarios" },
    },
    {
      icon: BookOpen,
      title: "Contenido: módulos y lecciones",
      description:
        "Estructura cada programa en módulos y lecciones grabadas, sube los videos y ordena el contenido.",
      steps: [
        "Elige el programa (y la cohorte, para ver sus clases en vivo).",
        "Crea módulos y, dentro, lecciones grabadas.",
        "Sube el video (Mux, hasta 12 GB); procesa en unos minutos.",
        "Reordena con flechas y mueve lecciones entre módulos.",
        "Usa “apertura por calendario” para que una lección se desbloquee en una fecha.",
      ],
      tip: "No se puede eliminar una lección/módulo con progreso de alumnos o clases vinculadas (te avisa).",
      link: { href: "/admin/lessons", label: "Ir a Lecciones" },
    },
    {
      icon: CalendarDays,
      title: "Calendario y clases en vivo",
      description:
        "Agenda las clases en vivo de cada cohorte, asigna profesor y carga el material.",
      steps: [
        "Crea o edita sesiones (fecha, modalidad, instructor, link de reunión, módulo).",
        "Define la audiencia: toda la cohorte o solo el segmento “Capital Inteligente”.",
        "Adjunta el “Material de la clase” (archivos o enlaces).",
        "La plataforma envía recordatorios automáticos a los alumnos.",
      ],
      link: adminCohortId
        ? { href: `/admin/cohorts/${adminCohortId}/sesiones`, label: "Ir al calendario" }
        : null,
    },
    {
      icon: FolderOpen,
      title: "Recursos y materiales",
      description:
        "Sube PDFs, plantillas, documentos o enlaces a cada lección y a cada clase en vivo.",
      steps: [
        "Elige el programa y la lección.",
        "Sube un archivo (hasta 50 MB, cualquier tipo) o pega un enlace.",
        "Para las clases en vivo, entra desde la lista al editor de calendario.",
      ],
      tip: "El alumno descarga los archivos con un enlace seguro y temporal.",
      link: { href: "/admin/resources", label: "Ir a Recursos" },
    },
    {
      icon: ListChecks,
      title: "Quizzes por clase (práctica)",
      description:
        "Crea evaluaciones formativas dentro de cada lección, con 4 tipos de pregunta. No certifican.",
      steps: [
        "Entra al editor de una lección y baja a “Evaluación de la clase”.",
        "Crea la evaluación y agrega preguntas: opción única, múltiple, verdadero/falso o respuesta corta.",
        "Actívala para que el alumno la vea (requiere al menos una pregunta).",
      ],
      tip: "Estos quizzes son práctica: no bloquean el avance ni emiten certificado.",
      link: { href: "/admin/lessons", label: "Ir a Lecciones" },
    },
    {
      icon: ClipboardCheck,
      title: "Examen final y certificación",
      description:
        "Configura el examen que certifica el programa y administra los certificados emitidos.",
      steps: [
        "En “Quizzes”, ajusta la configuración: completitud mínima, nota de aprobación, intentos.",
        "Carga el pool de preguntas manualmente o genéralas con IA.",
        "Revisa los intentos de los alumnos y los certificados emitidos.",
      ],
      tip: "El examen final solo admite preguntas de opción única (A–D). Los otros tipos son para los quizzes de práctica.",
      link: { href: "/admin/quizzes", label: "Ir a Quizzes" },
    },
    {
      icon: BarChart3,
      title: "Progreso de la cohorte",
      description:
        "Mira el avance de cada alumno por módulo e identifica a quiénes están en riesgo.",
      steps: [
        "Elige la cohorte.",
        "Revisa el promedio, quiénes completaron y quiénes van atrasados (<30%).",
        "Haz clic en un alumno para ver su detalle por módulo.",
      ],
      link: { href: "/admin/progress", label: "Ir a Progreso" },
    },
    {
      icon: CreditCard,
      title: "Cobros y pagos",
      description:
        "Genera enlaces de cobro firmados para montos puntuales y compártelos con el cliente.",
      steps: [
        "Define el monto y el concepto.",
        "Genera el enlace y compártelo por correo o WhatsApp.",
        "El cliente paga al contado o en cuotas (el recargo se calcula solo).",
      ],
      link: { href: "/admin/cobros", label: "Ir a Cobros" },
    },
  ];

  const sections = tab === "student" ? studentSections : teamSections;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-10">
      {/* Header */}
      <div className="mb-7">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-ca-violet/[0.08] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-ca-violet">
          <Sparkles className="h-3.5 w-3.5" />
          Centro de ayuda
        </div>
        <h1 className="text-[30px] font-black leading-tight tracking-tight text-ca-ink md:text-[38px]">
          {firstName ? `Hola ${firstName}, ` : ""}aquí tienes la guía
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ca-ink-soft md:text-[15px]">
          Todo lo que puedes hacer en la plataforma, paso a paso y con enlaces directos a cada
          pantalla. {isStaff ? "Cambia entre la vista de alumno y la del equipo." : "Si te trabas en algo, esta es tu primera parada."}
        </p>
      </div>

      {/* Tabs (solo si es staff) */}
      {isStaff && (
        <div className="mb-7 inline-flex rounded-2xl border border-ca-ink/[0.08] bg-white p-1">
          <button
            onClick={() => setTab("student")}
            className="rounded-xl px-5 py-2 text-[13px] font-bold transition-colors"
            style={{
              background: tab === "student" ? "var(--color-ca-violet)" : "transparent",
              color: tab === "student" ? "#fff" : "var(--color-ca-ink-soft)",
            }}
          >
            Para alumnos
          </button>
          <button
            onClick={() => setTab("team")}
            className="rounded-xl px-5 py-2 text-[13px] font-bold transition-colors"
            style={{
              background: tab === "team" ? "var(--color-ca-violet)" : "transparent",
              color: tab === "team" ? "#fff" : "var(--color-ca-ink-soft)",
            }}
          >
            Para el equipo
          </button>
        </div>
      )}

      {/* Secciones */}
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.title} className="ca-card flex flex-col p-5 md:p-6">
              <div className="mb-3 flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ca-violet/[0.08] text-ca-violet">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-[17px] font-black tracking-tight text-ca-ink">{s.title}</h2>
              </div>

              <p className="text-[13.5px] leading-relaxed text-ca-ink-soft">{s.description}</p>

              {s.steps && (
                <ol className="mt-3 flex flex-col gap-1.5">
                  {s.steps.map((step, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ca-ink">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ca-bg-soft text-[10px] font-bold text-ca-ink-soft">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              )}

              {s.tip && (
                <div className="mt-3 flex gap-2 rounded-xl bg-ca-lime/[0.12] px-3 py-2.5">
                  <Lightbulb className="h-4 w-4 shrink-0 text-[#5a7a05]" />
                  <p className="text-[12.5px] font-medium leading-relaxed text-[#3f5a05]">{s.tip}</p>
                </div>
              )}

              {s.link && (
                <Link
                  href={s.link.href}
                  className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-ca-ink px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-ca-ink/90"
                >
                  {s.link.label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-[12px] text-ca-ink-soft">
        ¿Necesitas ayuda con algo que no está aquí? Escríbenos a{" "}
        <a href="mailto:academia@capitalacademy.cl" className="font-bold text-ca-violet hover:underline">
          academia@capitalacademy.cl
        </a>
      </p>
    </div>
  );
}
