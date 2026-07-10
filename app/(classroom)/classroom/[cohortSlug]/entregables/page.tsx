import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getClassroomAccess } from "@/lib/classroom/access";
import { getCohortWithProgram } from "@/lib/classroom/queries";
import { resolveCohortSlug } from "@/lib/classroom/resolve-slugs";
import { resolveDeliverableUrls } from "@/lib/deliverables/storage";
import { DeliverableCard } from "@/components/classroom/deliverables/deliverable-card";

export const metadata: Metadata = {
  title: "Entregables · Capital Academy",
};

// `deliverables`/`deliverable_submissions` aún no están en el Database
// generado (migración 0053 no aplicada a prod). Provisional: `as never` +
// tipos locales, mismo patrón que las rutas API de entregables.
type DeliverableRow = {
  id: string;
  title: string;
  description: string | null;
  opens_at: string;
  due_at: string;
  allowed_file_types: string[];
  max_file_size_bytes: number;
  allow_multiple: boolean;
};

type SubmissionRow = {
  id: string;
  deliverable_id: string;
  filename: string;
  storage_path: string;
  uploaded_at: string;
};

export default async function EntregablesPage(
  props: { params: Promise<{ cohortSlug: string }> },
) {
  const { cohortSlug } = await props.params;
  const cohortId = await resolveCohortSlug(cohortSlug);
  if (!cohortId) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const [access, cohort] = await Promise.all([
    getClassroomAccess(user.id, cohortId),
    getCohortWithProgram(cohortId),
  ]);
  if (!access) notFound();
  if (!cohort) notFound();
  const program = cohort.programs as { id: string; name: string };

  const nowIso = new Date().toISOString();
  const { data: deliverableRows } = await supabase
    .from("deliverables" as never)
    .select("*")
    .eq("program_id", program.id)
    .lte("opens_at", nowIso)
    .order("due_at", { ascending: true })
    .overrideTypes<DeliverableRow[]>();
  const deliverables = deliverableRows ?? [];

  const deliverableIds = deliverables.map((d) => d.id);
  const submissionsByDeliverable = new Map<
    string,
    { id: string; filename: string; storage_path: string; uploaded_at: string; signedUrl: string | null }[]
  >();
  if (deliverableIds.length > 0) {
    const { data: submissionRows } = await supabase
      .from("deliverable_submissions" as never)
      .select("id, deliverable_id, filename, storage_path, uploaded_at")
      .eq("student_id", user.id)
      .in("deliverable_id", deliverableIds)
      .order("uploaded_at", { ascending: true })
      .overrideTypes<SubmissionRow[]>();
    const resolved = await resolveDeliverableUrls(submissionRows ?? []);
    for (const s of resolved) {
      const arr = submissionsByDeliverable.get(s.deliverable_id) ?? [];
      arr.push(s);
      submissionsByDeliverable.set(s.deliverable_id, arr);
    }
  }

  return (
    <div className="ca-fade-up mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-10">
      <div className="mb-7">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-ca-violet/[0.08] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-ca-violet">
          <UploadCloud className="h-3.5 w-3.5" />
          Entregables
        </div>
        <h1 className="text-[28px] font-black leading-tight tracking-tight text-ca-ink md:text-[34px]">
          Tareas de {program.name}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ca-ink-soft">
          Sube tus archivos dentro del plazo de cada tarea.
        </p>
      </div>

      {deliverables.length === 0 ? (
        <div className="ca-card flex flex-col items-center justify-center p-16 text-center">
          <UploadCloud className="h-10 w-10 text-ca-ink-soft/40" />
          <p className="mt-3 text-[14px] font-bold text-ca-ink">Aún no hay entregables</p>
          <p className="mt-1 text-[13px] text-ca-ink-soft">
            Cuando el equipo publique una tarea, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {deliverables.map((d) => (
            <DeliverableCard
              key={d.id}
              deliverable={d}
              files={submissionsByDeliverable.get(d.id) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
