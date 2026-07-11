import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { getAuthUser, getViewerProfile } from "@/lib/supabase/auth";
import { getClassroomAccess } from "@/lib/classroom/access";
import { getCohortWithProgram } from "@/lib/classroom/queries";
import { resolveCohortSlug } from "@/lib/classroom/resolve-slugs";
import { getProgramThreads } from "@/lib/conversaciones/queries";
import { ThreadList } from "@/components/classroom/conversaciones/thread-list";

export const metadata: Metadata = {
  title: "Conversaciones · Capital Academy",
};

export default async function ConversacionesPage(
  props: { params: Promise<{ cohortSlug: string }> },
) {
  const { cohortSlug } = await props.params;
  const cohortId = await resolveCohortSlug(cohortSlug);
  if (!cohortId) notFound();

  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const [access, cohort] = await Promise.all([
    getClassroomAccess(user.id, cohortId),
    getCohortWithProgram(cohortId),
  ]);
  if (!access) notFound();
  if (!cohort) notFound();
  const program = cohort.programs as { id: string; name: string };

  const threads = await getProgramThreads(program.id, user.id);

  const me = await getViewerProfile(user.id);

  const viewerName = me?.full_name ?? user.email ?? "Usuario";
  const viewerInitials = viewerName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="ca-fade-up mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-10">
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-ca-violet/[0.08] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-ca-violet">
            <MessageCircle className="h-3.5 w-3.5" />
            Conversaciones
          </div>
          <h1 className="text-[28px] font-black leading-tight tracking-tight text-ca-ink md:text-[34px]">
            Comunidad de {program.name}
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ca-ink-soft">
            Comparte dudas, avances y aprendizajes con el resto de tus compañeros del programa.
          </p>
        </div>
      </div>

      <ThreadList
        programId={program.id}
        programName={program.name}
        cohortSlug={cohortSlug}
        initialThreads={threads}
        viewerId={user.id}
        viewerName={viewerName}
        viewerInitials={viewerInitials}
        viewerAvatarUrl={me?.avatar_url ?? null}
        isStaff={access.isStaff}
      />
    </div>
  );
}
