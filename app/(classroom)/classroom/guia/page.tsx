import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GuideClient } from "@/components/classroom/guide/guide-client";

export const metadata: Metadata = {
  title: "Guía y ayuda · Capital Academy",
};

export default async function GuiaPage() {
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

  const sysRole = profile?.system_role ?? profile?.role;
  const isStaff = sysRole === "admin" || sysRole === "ops";

  // Cohorte del alumno (para enlaces contextuales: calendario, quiz, certificado).
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("cohort_id")
    .eq("student_id", user.id)
    .eq("status", "active")
    .order("enrolled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let cohortSlug: string | null = null;
  if (enrollment?.cohort_id) {
    const { data: cohort } = await supabase
      .from("cohorts")
      .select("slug, id")
      .eq("id", enrollment.cohort_id)
      .single();
    cohortSlug = cohort?.slug ?? cohort?.id ?? null;
  }

  // Para el equipo: una cohorte cualquiera para enlazar el editor de calendario.
  let adminCohortId: string | null = null;
  if (isStaff) {
    const { data: anyCohort } = await supabase
      .from("cohorts")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    adminCohortId = anyCohort?.id ?? null;
  }

  return (
    <GuideClient
      isStaff={isStaff}
      cohortSlug={cohortSlug}
      adminCohortId={adminCohortId}
      firstName={(profile?.full_name ?? "").split(" ")[0] || null}
    />
  );
}
