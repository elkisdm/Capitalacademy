import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { DeliverablesManager } from "@/components/admin/deliverables/deliverables-manager";
import { getActiveEnv } from "@/lib/admin/active-env";

export default async function DeliverablesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const { data: programs } = await supabase
    .from("programs")
    .select("id, name")
    .order("name");

  const activeEnv = await getActiveEnv();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <div className="mb-7">
        <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Operaciones
        </div>
        <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">
          Entregables
        </h1>
        <p className="mt-1 text-[14px] text-ca-ink-soft">
          Crea tareas con ventana de entrega y revisa quién ya subió su archivo
        </p>
      </div>
      <DeliverablesManager
        programs={(programs ?? []) as { id: string; name: string }[]}
        initialProgramId={activeEnv ?? undefined}
      />
    </div>
  );
}
