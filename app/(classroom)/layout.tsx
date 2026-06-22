import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ClassroomSidebar } from "@/components/classroom/sidebar";
import { getActiveEnv, getEnvOptions, getViewMode, type EnvOption, type ViewMode } from "@/lib/admin/active-env";

export const metadata = {
  title: "Classroom",
};

export default async function ClassroomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, system_role, onboarding_completed_at, avatar_url")
    .eq("id", user.id)
    .single();

  const sysRole = profile?.system_role ?? profile?.role;
  const isStaff = sysRole === "admin" || sysRole === "ops";

  if (profile && !profile.onboarding_completed_at && !isStaff) {
    redirect("/onboarding/complete-profile");
  }

  const name = profile?.full_name ?? user.email ?? "Alumno";
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Resolve cohort slug + program name for the sidebar.
  // Priority: URL path > user's most recent enrollment (fallback for /classroom root).
  let cohortSlug: string | undefined;
  let cohortLabel: string | undefined;

  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? "";
  const parts = pathname.split("/").filter(Boolean); // ['classroom', '<slug>', ...]
  // Sub-rutas que NO son slugs de cohorte: el sidebar debe seguir mostrando la
  // cohorte real del alumno (resuelta por su matrícula), no estas palabras.
  const RESERVED_SUBPATHS = new Set(["profile", "guia"]);
  const cohortSlugFromPath =
    parts[0] === "classroom" && parts[1] && !RESERVED_SUBPATHS.has(parts[1])
      ? parts[1]
      : undefined;

  if (cohortSlugFromPath) {
    const { data: cohortRow } = await supabase
      .from("cohorts")
      .select("slug, programs(name)")
      .or(`slug.eq.${cohortSlugFromPath},id.eq.${cohortSlugFromPath}`)
      .maybeSingle();
    cohortSlug = cohortRow?.slug ?? cohortSlugFromPath;
    cohortLabel =
      (cohortRow?.programs as { name: string } | null)?.name ?? undefined;
  } else {
    // Fallback: most recent enrollment (for /classroom dashboard)
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("cohort_id")
      .eq("student_id", user.id)
      .eq("status", "active")
      .order("enrolled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (enrollment?.cohort_id) {
      const { data: cohortRow } = await supabase
        .from("cohorts")
        .select("slug, programs(name)")
        .eq("id", enrollment.cohort_id)
        .single();
      cohortSlug = cohortRow?.slug ?? enrollment.cohort_id;
      cohortLabel =
        (cohortRow?.programs as { name: string } | null)?.name ?? undefined;
    }
  }

  // Controles de staff (selector de entorno + modo de vista). Solo se cargan
  // para staff; un alumno puro no los ve.
  let envOptions: EnvOption[] = [];
  let activeEnv: string | null = null;
  let viewMode: ViewMode = "admin";
  if (isStaff) {
    [envOptions, activeEnv, viewMode] = await Promise.all([
      getEnvOptions(),
      getActiveEnv(),
      getViewMode(),
    ]);
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row md:h-screen" style={{ background: "var(--color-ca-bg)" }}>
      <ClassroomSidebar
        userInitials={initials}
        userName={name}
        userRole={sysRole ?? "user"}
        userAvatarUrl={profile?.avatar_url ?? null}
        cohortId={cohortSlug}
        cohortLabel={cohortLabel}
        showOps={isStaff}
        viewMode={viewMode}
        envOptions={envOptions}
        activeEnv={activeEnv}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="ca-fade-up">{children}</div>
      </main>
    </div>
  );
}
