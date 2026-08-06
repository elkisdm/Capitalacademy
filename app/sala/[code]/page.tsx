import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/auth";
import { getClassroomAccess } from "@/lib/classroom/access";
import { parseSessionRef } from "@/lib/livekit/meeting-code";
import { LiveClassRoom } from "@/components/classroom/live/live-class-room";

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
  if (ref.kind === "invalid") return { title: "Sala · Capital Academy" };

  const admin = createAdminClient();
  const { data } = await admin
    .from("class_sessions")
    .select("title")
    .eq(ref.kind === "code" ? "code" : "id", ref.value)
    .maybeSingle();

  const titulo = (data?.title as string | null) ?? "Clase en vivo";
  return { title: `${titulo} · Capital Academy` };
}

export default async function SalaPage(props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;

  const ref = parseSessionRef(code);
  if (ref.kind === "invalid") notFound();

  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/sala/${code}`)}`);

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("class_sessions")
    .select("id, code, title, cohort_id, modality, cohorts(slug)")
    .eq(ref.kind === "code" ? "code" : "id", ref.value)
    .maybeSingle();

  if (!session) notFound();

  // El acceso se decide igual que en el resto del aula. La ruta del token lo
  // vuelve a verificar por su cuenta: esto es para no mostrar una sala a la que
  // la persona no va a poder entrar.
  const access = await getClassroomAccess(user.id, session.cohort_id as string);
  if (!access) notFound();

  const cohortSlug = (session.cohorts as { slug: string | null } | null)?.slug ?? null;
  const title = (session.title as string | null) ?? "Clase en vivo";

  return (
    <div className="flex h-dvh flex-col bg-ca-ink">
      <header className="flex shrink-0 items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-black tracking-tight text-white">{title}</h1>
          {/* El código a la vista: es lo que se dicta o se pega para invitar. */}
          <p className="font-mono text-[11px] text-white/50">{session.code as string}</p>
        </div>
        {cohortSlug && (
          <Link
            href={`/classroom/${cohortSlug}/clase/${session.code as string}`}
            className="shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          >
            Volver a la clase
          </Link>
        )}
      </header>

      <main className="min-h-0 flex-1 px-3 pb-3">
        <LiveClassRoom sessionId={session.code as string} fill />
      </main>
    </div>
  );
}
