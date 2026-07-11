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
    .from("deliverables")
    .select("*")
    .eq("id", deliverableId)
    .single();
  if (deliverableError || !deliverable) {
    return NextResponse.json({ error: "Entregable no encontrado" }, { status: 404 });
  }

  // Incluye "completed" además de "active": un alumno puede terminar su
  // cohorte (o el programa) después de entregar, y su entrega no debe
  // desaparecer del roster.
  const { data: enrollments } = await admin
    .from("enrollments")
    .select("student_id, profiles(id, email, full_name), cohorts!inner(program_id)")
    .eq("cohorts.program_id", deliverable.program_id)
    .in("status", ["active", "completed"]);

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
    .from("deliverable_submissions")
    .select("id, student_id, filename, storage_path, uploaded_at")
    .eq("deliverable_id", deliverableId)
    .order("uploaded_at", { ascending: true });

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

  // Entregas cuyo student_id no aparece en la matrícula (active/completed) del
  // programa: se resuelven aparte para que no desaparezcan del roster, y se
  // marcan con `enrolled: false` para distinguirlas en la UI.
  const orphanIds = [...filesByStudent.keys()].filter((id) => !studentsById.has(id));
  if (orphanIds.length > 0) {
    const { data: orphanProfiles } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", orphanIds);
    for (const p of orphanProfiles ?? []) {
      studentsById.set(p.id, p);
    }
  }

  const roster = [...studentsById.values()].map((student) => {
    const files = filesByStudent.get(student.id) ?? [];
    return {
      student,
      files,
      submitted: files.length > 0,
      enrolled: !orphanIds.includes(student.id),
    };
  });

  return NextResponse.json({ deliverable, roster });
}
