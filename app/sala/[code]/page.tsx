import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/auth";
import { getClassroomAccess } from "@/lib/classroom/access";
import { getViewerProfile } from "@/lib/supabase/auth";
import { parseSessionRef } from "@/lib/livekit/meeting-code";
import { LiveClassRoom } from "@/components/classroom/live/live-class-room";
import { GuestJoin } from "@/components/classroom/live/guest-join";

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
  if (ref.kind === "invalid") return { title: "Sala" };

  const admin = createAdminClient();
  const { data } = await admin
    .from("class_sessions")
    .select("title")
    .eq(ref.kind === "code" ? "code" : "id", ref.value)
    .maybeSingle();

  const titulo = (data?.title as string | null) ?? "Clase en vivo";
  // El sufijo "· Capital Academy" lo pone la plantilla del layout raíz.
  return { title: titulo };
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
    .select("id, code, title, cohort_id, modality, guest_access, cohorts(slug)")
    .eq(ref.kind === "code" ? "code" : "id", ref.value)
    .maybeSingle();

  if (!session) notFound();

  const {
    data: { user },
  } = await getAuthUser();

  const title = (session.title as string | null) ?? "Clase en vivo";

  if (!user) {
    // Sala cerrada a invitados: el camino de siempre, login y de vuelta acá.
    if (!session.guest_access) {
      redirect(`/login?next=${encodeURIComponent(`/sala/${code}`)}`);
    }
    return (
      <SalaShell title={title} code={session.code as string} volverA={null}>
        <GuestJoin code={session.code as string} titulo={title} />
      </SalaShell>
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

/**
 * Marco de la sala: encabezado mínimo y el resto de la pantalla para el video.
 *
 * Lo comparten el participante con cuenta y el invitado, para que la sala se vea
 * igual en los dos casos. Lo único que cambia es el "Volver a la clase", que un
 * invitado no tiene adónde seguir.
 */
function SalaShell({
  title,
  code,
  volverA,
  children,
}: {
  title: string;
  code: string;
  volverA: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col bg-ca-ink">
      <header className="flex shrink-0 items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-black tracking-tight text-white">{title}</h1>
          {/* El código a la vista: es lo que se dicta o se pega para invitar. */}
          <p className="font-mono text-[11px] text-white/50">{code}</p>
        </div>
        {volverA && (
          <Link
            href={volverA}
            className="shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          >
            Volver a la clase
          </Link>
        )}
      </header>

      <main className="min-h-0 flex-1 px-3 pb-3">{children}</main>
    </div>
  );
}
