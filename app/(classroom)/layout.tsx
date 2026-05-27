import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCohortSlugById } from "@/lib/classroom/queries";
import { ClassroomSidebar } from "@/components/classroom/sidebar";

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

  const [{ data: profile }, { data: enrollment }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, role, system_role, onboarding_completed_at")
      .eq("id", user.id)
      .single(),
    supabase
      .from("enrollments")
      .select("cohort_id")
      .eq("student_id", user.id)
      .eq("status", "active")
      .order("enrolled_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

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

  // Resolve cohort slug for clean URLs
  const cohortSlug = enrollment?.cohort_id
    ? (await getCohortSlugById(enrollment.cohort_id)) ?? enrollment.cohort_id
    : undefined;

  return (
    <div className="flex min-h-screen flex-col md:flex-row md:h-screen" style={{ background: "var(--color-ca-bg)" }}>
      <ClassroomSidebar
        userInitials={initials}
        userName={name}
        userRole={sysRole ?? "user"}
        cohortId={cohortSlug}
        showOps={isStaff}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="ca-fade-up">{children}</div>
      </main>
    </div>
  );
}
