import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getClassroomAccess } from "@/lib/classroom/access";
import { getCohortWithProgram } from "@/lib/classroom/queries";
import { resolveCohortSlug } from "@/lib/classroom/resolve-slugs";
import { getThreadWithComments } from "@/lib/conversaciones/queries";
import { ThreadDetail } from "@/components/classroom/conversaciones/thread-detail";

export default async function ConversacionDetallePage(
  props: { params: Promise<{ cohortSlug: string; threadId: string }> },
) {
  const { cohortSlug, threadId } = await props.params;
  const cohortId = await resolveCohortSlug(cohortSlug);
  if (!cohortId) notFound();

  const supabase = await createClient();
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

  const data = await getThreadWithComments(threadId, user.id);
  if (!data) notFound();
  if (data.thread.program_id !== program.id) notFound();

  const { data: me } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .single();

  const viewerName = me?.full_name ?? user.email ?? "Usuario";
  const viewerInitials = viewerName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="ca-fade-up mx-auto max-w-3xl px-4 py-8 md:px-8 md:py-10">
      <Link
        href={`/classroom/${cohortSlug}/conversaciones`}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ca-ink-soft transition-colors hover:text-ca-violet"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver
      </Link>

      <ThreadDetail
        thread={data.thread}
        initialComments={data.comments}
        cohortSlug={cohortSlug}
        viewerId={user.id}
        viewerName={viewerName}
        viewerInitials={viewerInitials}
        viewerAvatarUrl={me?.avatar_url ?? null}
        isStaff={access.isStaff}
      />
    </div>
  );
}
