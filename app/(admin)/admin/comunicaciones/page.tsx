import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getActiveEnv } from "@/lib/admin/active-env";
import { CampaignsManager } from "@/components/admin/comunicaciones/campaigns-manager";

export default async function ComunicacionesPage() {
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
          Operaciones · Comunicaciones
        </div>
        <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">
          Correos a alumnos
        </h1>
        <p className="mt-1 text-[14px] text-ca-ink-soft">
          Escribe un comunicado, revisa a cuántas personas llega y envíalo con el sello de Capital
          Academy
        </p>
      </div>
      <CampaignsManager
        programs={(programs ?? []) as { id: string; name: string }[]}
        cohorts={(cohorts ?? []) as { id: string; name: string; program_id: string }[]}
        initialProgramId={activeEnv ?? undefined}
      />
    </div>
  );
}
