import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCohortSlugById } from "@/lib/classroom/queries";
import { ClassroomSidebar } from "@/components/classroom/sidebar";
import { getActiveEnv, getEnvOptions, getViewMode } from "@/lib/admin/active-env";
import { getActiveEnvCohortSlug } from "@/lib/classroom/staff-preview";

export const metadata = {
  title: "Admin",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, system_role")
    .eq("id", user.id)
    .single();

  if (!profile || !["ops", "admin"].includes(profile.system_role ?? profile.role)) {
    redirect("/classroom");
  }

  const name = profile?.full_name ?? user.email ?? "Admin";
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const [envOptions, activeEnv, viewMode] = await Promise.all([
    getEnvOptions(),
    getActiveEnv(),
    getViewMode(),
  ]);

  // cohortSlug alimenta el sidebar (y el link "Conversaciones"): prioriza el
  // entorno activo del switcher; si no hay entorno o cohorte, cae a la
  // matrícula propia del admin.
  const previewSlug = await getActiveEnvCohortSlug(activeEnv);
  let cohortSlug: string | undefined = previewSlug ?? undefined;
  if (!cohortSlug) {
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("cohort_id")
      .eq("student_id", user.id)
      .eq("status", "active")
      .order("enrolled_at", { ascending: false })
      .limit(1)
      .single();
    cohortSlug = enrollment?.cohort_id
      ? (await getCohortSlugById(enrollment.cohort_id)) ?? enrollment.cohort_id
      : undefined;
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row md:h-screen" style={{ background: "var(--color-ca-bg)" }}>
      <ClassroomSidebar
        userInitials={initials}
        userName={name}
        userRole={profile.system_role ?? profile.role}
        cohortId={cohortSlug}
        showOps={true}
        viewMode={viewMode}
        envOptions={envOptions}
        activeEnv={activeEnv}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
