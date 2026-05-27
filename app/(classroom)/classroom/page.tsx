import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ClassroomIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("cohort_id")
    .eq("student_id", user.id)
    .eq("status", "active")
    .order("enrolled_at", { ascending: false })
    .limit(1)
    .single();

  if (enrollment) {
    redirect(`/classroom/${enrollment.cohort_id}`);
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
