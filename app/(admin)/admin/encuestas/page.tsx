import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getActiveEnv } from "@/lib/admin/active-env";
import { SurveysManager } from "@/components/admin/encuestas/surveys-manager";

export default async function EncuestasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const [{ data: programs }, { data: cohorts }] = await Promise.all([
    supabase.from("programs").select("id, name").order("name"),
    supabase.from("cohorts").select("id, name, program_id").order("start_date", { ascending: false }),
  ]);

  const activeEnv = await getActiveEnv();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <div className="mb-7">
        <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Operaciones · Encuestas
        </div>
        <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">Encuestas</h1>
        <p className="mt-1 text-[14px] text-ca-ink-soft">
          Crea una encuesta, envíala a un grupo de alumnos y revisa las respuestas
        </p>
      </div>
      <SurveysManager
        programs={(programs ?? []) as { id: string; name: string }[]}
        cohorts={(cohorts ?? []) as { id: string; name: string; program_id: string }[]}
        initialProgramId={activeEnv ?? undefined}
      />
    </div>
  );
}
