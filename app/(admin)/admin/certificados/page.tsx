import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getActiveEnv, resolveProgramScope } from "@/lib/admin/active-env";
import { CertificadosTab } from "@/components/admin/quiz/certificados-tab";

export default async function AdminCertificadosPage(props: {
  searchParams: Promise<{ program?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: programs } = await supabase.from("programs").select("id, name").order("name");
  const programOptions = (programs ?? []) as { id: string; name: string }[];

  if (programOptions.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
        <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Operaciones · Evaluación
        </div>
        <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">Certificados</h1>
        <p className="mt-4 text-ca-ink-soft">No hay programas configurados.</p>
      </div>
    );
  }

  const { program: programParam } = await props.searchParams;
  const activeEnv = await getActiveEnv();
  const programId = resolveProgramScope(programParam, activeEnv, programOptions)!;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <div className="mb-7">
        <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Operaciones · Evaluación
        </div>
        <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">Certificados</h1>
        <p className="mt-1 text-[14px] text-ca-ink-soft">Lista, descarga y reemisión de certificados emitidos</p>
      </div>
      <CertificadosTab programId={programId} />
    </div>
  );
}
