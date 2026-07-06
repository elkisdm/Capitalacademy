import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getCohortSlugById } from "@/lib/classroom/queries";
import { getActiveEnv } from "@/lib/admin/active-env";
import { getActiveEnvCohortSlug } from "@/lib/classroom/staff-preview";

export default async function ClassroomIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getAuthUser();

  if (!user) redirect("/login");

  // Staff en preview: el classroom sigue el ENTORNO ACTIVO del switcher, no la
  // matrícula propia (un admin puede estar matriculado en otros programas). Un
  // alumno puro no tiene cookie de entorno → no entra aquí.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, system_role")
    .eq("id", user.id)
    .single();
  const sysRole = profile?.system_role ?? profile?.role;
  const isStaff = sysRole === "admin" || sysRole === "ops";
  if (isStaff) {
    const previewSlug = await getActiveEnvCohortSlug(await getActiveEnv());
    if (previewSlug) redirect(`/classroom/${previewSlug}`);
  }

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("cohort_id")
    .eq("student_id", user.id)
    .eq("status", "active")
    .order("enrolled_at", { ascending: false })
    .limit(1)
    .single();

  if (enrollment) {
    const slug = await getCohortSlugById(enrollment.cohort_id);
    redirect(`/classroom/${slug ?? enrollment.cohort_id}`);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-gray-900">
        Bienvenido al Classroom
      </h1>
      <p className="mt-3 text-gray-500">
        No tienes una matrícula activa en este momento. Si crees que esto es un
        error, contacta a operaciones.
      </p>
    </div>
  );
}
