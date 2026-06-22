import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { QuizManager } from "@/components/admin/quiz-manager";
import { getActiveEnv } from "@/lib/admin/active-env";

export default async function QuizzesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch programs to populate dropdown
  const { data: programs } = await supabase
    .from("programs")
    .select("id, name")
    .order("name");

  const activeEnv = await getActiveEnv();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <div className="mb-7">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Operaciones
        </div>
        <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">
          Gestión de Quizzes
        </h1>
        <p className="mt-1 text-[14px] text-ca-ink-soft">
          Genera, edita y configura quizzes por programa
        </p>
      </div>
      <QuizManager
        programs={(programs ?? []) as { id: string; name: string }[]}
        initialProgramId={activeEnv ?? undefined}
      />
    </div>
  );
}
