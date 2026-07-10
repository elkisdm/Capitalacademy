import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { resolveDeliverableUrls } from "@/lib/deliverables/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ deliverableId: string }> };

type RosterFile = {
  id: string;
  filename: string;
  signedUrl: string | null;
  uploaded_at: string;
};

// `deliverables`/`deliverable_submissions` aún no están en el Database
// generado (migración 0053 no aplicada a prod). Provisional: `as never` +
// tipo local, mismo patrón que app/api/admin/deliverables/route.ts.
type DeliverableRow = { id: string; program_id: string };
type SubmissionRow = {
  id: string;
  student_id: string;
  filename: string;
  storage_path: string;
  uploaded_at: string;
};

// ---------------------------------------------------------------------------
// GET  /api/admin/deliverables/[deliverableId]/submissions
//   Roster: cruza alumnos con matrícula activa del programa con sus entregas.
// ---------------------------------------------------------------------------

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { deliverableId } = await params;
  const admin = createAdminClient();

  const { data: deliverable, error: deliverableError } = await admin
    .from("deliverables" as never)
    .select("*")
    .eq("id", deliverableId)
    .single<DeliverableRow>();
  if (deliverableError || !deliverable) {
    return NextResponse.json({ error: "Entregable no encontrado" }, { status: 404 });
  }

  const { data: enrollments } = await admin
    .from("enrollments")
    .select("student_id, profiles(id, email, full_name), cohorts!inner(program_id)")
    .eq("cohorts.program_id", deliverable.program_id)
    .eq("status", "active");

  const studentsById = new Map<
    string,
    { id: string; email: string; full_name: string | null }
  >();
  for (const e of (enrollments ?? []) as Array<{
    student_id: string;
    profiles: { id: string; email: string; full_name: string | null } | null;
  }>) {
    if (e.profiles && !studentsById.has(e.student_id)) {
      studentsById.set(e.student_id, e.profiles);
    }
  }

  const { data: submissions } = await admin
    .from("deliverable_submissions" as never)
    .select("id, student_id, filename, storage_path, uploaded_at")
    .eq("deliverable_id", deliverableId)
    .order("uploaded_at", { ascending: true })
    .overrideTypes<SubmissionRow[]>();

  const resolved = await resolveDeliverableUrls(submissions ?? []);

  const filesByStudent = new Map<string, RosterFile[]>();
  for (const s of resolved) {
    const arr = filesByStudent.get(s.student_id) ?? [];
    arr.push({
      id: s.id,
      filename: s.filename,
      signedUrl: s.signedUrl,
      uploaded_at: s.uploaded_at,
    });
    filesByStudent.set(s.student_id, arr);
  }

  const roster = [...studentsById.values()].map((student) => {
    const files = filesByStudent.get(student.id) ?? [];
    return { student, files, submitted: files.length > 0 };
  });

  return NextResponse.json({ deliverable, roster });
}
