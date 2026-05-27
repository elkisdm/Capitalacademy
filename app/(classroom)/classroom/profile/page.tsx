import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StudentProfileClient } from "./student-profile-client";

export const metadata = {
  title: "Mi perfil · Capital Academy",
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, phone, rut, company, job_title, linkedin_url, bio, avatar_url, system_role, created_at, emergency_contact_name, emergency_contact_phone",
    )
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const { data: cohortRoles } = await supabase
    .from("cohort_roles")
    .select(
      "cohort_id, role, cohorts(name, code, slug, status)",
    )
    .eq("user_id", user.id);

  const cohorts = (cohortRoles ?? []).map((cr) => {
    const cohort = cr.cohorts as { name: string; code: string; slug: string | null; status: string } | null;
    return {
      cohort_id: cr.cohort_id,
      role: cr.role as "student" | "teacher" | "assistant",
      cohort_name: cohort?.name ?? "",
      cohort_code: cohort?.code ?? "",
      cohort_slug: cohort?.slug ?? cr.cohort_id,
      cohort_status: cohort?.status ?? "active",
    };
  });

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[900px] px-4 py-6 md:px-8 md:py-8">
      <StudentProfileClient
        profile={{
          full_name: profile.full_name,
          email: profile.email ?? user.email ?? "",
          phone: profile.phone,
          rut: profile.rut,
          company: profile.company,
          job_title: profile.job_title,
          linkedin_url: profile.linkedin_url,
          bio: profile.bio,
          avatar_url: profile.avatar_url,
          birthday: ((profile as unknown as Record<string, unknown>).birthday as string) ?? null,
          system_role: profile.system_role,
          created_at: profile.created_at,
          emergency_contact_name: profile.emergency_contact_name,
          emergency_contact_phone: profile.emergency_contact_phone,
        }}
        lastSignIn={user.last_sign_in_at ?? null}
        cohorts={cohorts}
      />
    </div>
  );
}
