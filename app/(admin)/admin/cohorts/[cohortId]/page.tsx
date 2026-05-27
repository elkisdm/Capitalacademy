import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCohortMembers } from "@/lib/admin/user-queries";
import { CohortDetailClient } from "./cohort-detail-client";

export default async function AdminCohortDetailPage(
  props: { params: Promise<{ cohortId: string }> },
) {
  const { cohortId } = await props.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", user.id)
    .single();

  if (!profile || !["ops", "admin"].includes(profile.system_role)) {
    redirect("/classroom");
  }

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("*, programs(id, name, code, description, total_modules)")
    .eq("id", cohortId)
    .single();

  if (!cohort) notFound();

  const members = await getCohortMembers(cohortId);

  const program = cohort.programs as {
    id: string;
    name: string;
    code: string;
    description: string | null;
    total_modules: number | null;
  } | null;

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
      <CohortDetailClient
        cohort={{
          id: cohort.id,
          name: cohort.name,
          code: cohort.code,
          status: cohort.status,
          start_date: cohort.start_date,
          end_date: cohort.end_date,
        }}
        program={
          program
            ? {
                id: program.id,
                name: program.name,
                code: program.code,
                description: program.description,
                total_modules: program.total_modules,
              }
            : null
        }
        members={members}
      />
    </div>
  );
}
