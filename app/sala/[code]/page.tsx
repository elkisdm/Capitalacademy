import { redirect, notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/auth";
import { getClassroomAccess } from "@/lib/classroom/access";
import { getViewerProfile } from "@/lib/supabase/auth";
import { parseSessionRef } from "@/lib/livekit/meeting-code";
import { LiveClassRoom } from "@/components/classroom/live/live-class-room";
import { GuestJoin } from "@/components/classroom/live/guest-join";
import { SalaShell } from "@/components/classroom/live/sala-shell";
import { formatChile, TZ_CHILE } from "@/lib/time";
import { isWithinRoomWindow } from "@/lib/livekit/access";
import { getBrandByProgramId } from "@/lib/programs/registry";

/**
 * Sala de clase en vivo, como pantalla PROPIA (ADR-0031).
 *
 * Vive fuera del grupo `(classroom)` a propósito: una reunión no se mira entre
 * la barra lateral y el resto de la navegación del aula. Acá la sala ocupa la
 * pantalla completa, como en Meet, y lo único que la acompaña es la vuelta a la
 * clase.
 *
 * La URL usa el CÓDIGO legible (`/sala/abc-defg-hij`), no el UUID: es un enlace
 * que se puede dictar por teléfono o pegar en un correo sin que parezca un error.
 */

export const runtime = "nodejs";

/** El título de la pestaña es el de la clase: con varias salas abiertas, es lo
 *  único que las distingue en la barra del navegador. */
export async function generateMetadata(props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  const ref = parseSessionRef(code);
  // La sala nunca se indexa: la portada del invitado es pública para quien
  // tenga el código y muestra el nombre del docente, el programa y el código
  // mismo. Un enlace filtrado a una superficie rastreable lo deja en un índice.
  const noIndexar = { robots: { index: false, follow: false } };

  if (ref.kind === "invalid") return { title: "Sala", ...noIndexar };

  const admin = createAdminClient();
  const { data } = await admin
    .from("class_sessions")
    .select("title")
    .eq(ref.kind === "code" ? "code" : "id", ref.value)
    .maybeSingle();

  const titulo = (data?.title as string | null) ?? "Clase en vivo";
  // El sufijo "· Capital Academy" lo pone la plantilla del layout raíz.
  return { title: titulo, ...noIndexar };
}

export default async function SalaPage(props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;

  const ref = parseSessionRef(code);
  if (ref.kind === "invalid") notFound();

  // La sesión se carga ANTES de exigir sesión iniciada: si esta sala admite
  // invitados (0099), quien no tiene cuenta no va al login sino a la pantalla de
  // nombre. Sin saber qué sala es, esa decisión no se puede tomar.
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("class_sessions")
    .select(
      "id, code, title, cohort_id, modality, guest_access, starts_at, ends_at, instructors(full_name), cohorts(slug, programs(id, name))",
    )
    .eq(ref.kind === "code" ? "code" : "id", ref.value)
    .maybeSingle();

  if (!session) notFound();

  const {
    data: { user },
  } = await getAuthUser();

  const title = (session.title as string | null) ?? "Clase en vivo";
  const docente =
    (session.instructors as { full_name: string | null } | null)?.full_name ?? null;
  const programaRow = (session.cohorts as { programs: { id: string; name: string } | null } | null)
    ?.programs;
  const programa = programaRow?.name ?? null;
  // La marca del entorno, igual que en login y onboarding: la portada es la
  // puerta de entrada de un programa, no de la academia en abstracto.
  const marca = getBrandByProgramId(programaRow?.id ?? null);

  // La sala solo existe dentro de su ventana (-30 min / +2 h). Sin esto la
  // portada dice "En vivo ahora" y habilita el botón para un enlace reenviado
  // dias antes, y el 409 llega recién al enviar.
  const enVentana =
    session.starts_at && session.ends_at
      ? isWithinRoomWindow(
          {
            id: session.id as string,
            cohort_id: session.cohort_id as string,
            starts_at: session.starts_at as string,
            ends_at: session.ends_at as string,
            modality: session.modality as string | null,
          },
          new Date(),
        )
      : true;
  // La franja lleva el día cuando la clase NO es hoy: el enlace se reenvía por
  // WhatsApp y se abre días antes, así que "19:00 – 21:00" a secas se lee como
  // "es ahora".
  const horario = session.starts_at
    ? [
        esHoyEnChile(session.starts_at as string)
          ? null
          : formatChile(session.starts_at as string, {
              weekday: "long",
              day: "numeric",
              month: "long",
            }),
        [
          formatChile(session.starts_at as string, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          session.ends_at
            ? formatChile(session.ends_at as string, {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })
            : null,
        ]
          .filter(Boolean)
          .join(" – "),
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  if (!user) {
    // Sala cerrada a invitados: el camino de siempre, login y de vuelta acá.
    if (!session.guest_access) {
      redirect(`/login?next=${encodeURIComponent(`/sala/${code}`)}`);
    }
    return (
      <GuestJoin
        code={session.code as string}
        titulo={title}
        docente={docente}
        horario={horario}
        programa={programa}
        enVentana={enVentana}
        marcaNombre={marca.shortName}
        marcaAcento={marca.accent}
      />
    );
  }

  // El acceso se decide igual que en el resto del aula. La ruta del token lo
  // vuelve a verificar por su cuenta: esto es para no mostrar una sala a la que
  // la persona no va a poder entrar.
  const access = await getClassroomAccess(user.id, session.cohort_id as string);
  if (!access) notFound();

  const perfil = await getViewerProfile(user.id);
  const cohortSlug = (session.cohorts as { slug: string | null } | null)?.slug ?? null;

  return (
    <SalaShell
      title={title}
      code={session.code as string}
      volverA={cohortSlug ? `/classroom/${cohortSlug}/clase/${session.code as string}` : null}
    >
      <LiveClassRoom
        sessionId={session.code as string}
        fill
        userName={perfil?.full_name ?? null}
      />
    </SalaShell>
  );
}

/** ¿La clase es hoy en hora de Chile? Decide si la franja necesita fecha. */
function esHoyEnChile(iso: string): boolean {
  const dia = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ_CHILE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  return dia(new Date(iso)) === dia(new Date());
}
