import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("cohort_id")
    .eq("student_id", user.id)
    .eq("status", "active")
    .order("enrolled_at", { ascending: false })
    .limit(1)
    .single();

  const name = profile?.full_name ?? user.email ?? "Alumno";
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isStaff = profile?.role === "admin" || profile?.role === "ops";

  return (
    <div className="flex min-h-screen flex-col md:flex-row md:h-screen" style={{ background: "var(--color-ca-bg)" }}>
      <ClassroomSidebar
        userInitials={initials}
        userName={name}
        cohortId={enrollment?.cohort_id}
        showOps={isStaff}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="ca-fade-up">{children}</div>
      </main>
    </div>
  );
}
