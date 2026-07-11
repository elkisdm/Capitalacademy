import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProgramAccess } from "@/lib/conversaciones/access";
import { getProgramStaffIds } from "@/lib/profiles/program-staff";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

const MEMBERS_CAP = 200;

// ── GET /api/classroom/conversaciones/members?programId=xxx&q=... ────
// Miembros del programa (SOLO id + nombre) para el typeahead de menciones.
// La policy RLS de `profiles` está cerrada (0045), por eso se resuelven los
// nombres con el ADMIN client y se devuelve exclusivamente id+full_name (sin
// PII). Acceso limitado a quien ya tiene acceso al foro del programa.

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";

  if (!programId || !uuidLike.safeParse(programId).success) {
    return NextResponse.json(
      { error: "programId es requerido y debe ser un UUID válido" },
      { status: 422 },
    );
  }

  const access = await getProgramAccess(user.id, programId);
  if (!access) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Alumnos matriculados (active/completed) en cualquier cohorte del programa.
  const { data: enrollmentRows } = await admin
    .from("enrollments")
    .select("student_id, cohorts!inner(program_id)")
    .eq("cohorts.program_id", programId)
    .in("status", ["active", "completed"]);

  const ids = new Set<string>();
  for (const row of (enrollmentRows ?? []) as Array<{ student_id: string }>) {
    ids.add(row.student_id);
  }

  // Docentes/asistentes del programa (`cohort_roles`) + staff transversal
  // (admin/ops): así un docente puro sin matrícula también es mencionable
  // (T11 — antes solo entraban admin/ops).
  const staffIds = await getProgramStaffIds(programId);
  for (const id of staffIds) ids.add(id);

  if (ids.size === 0) {
    return NextResponse.json({ members: [] });
  }

  const { data: profileRows } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", [...ids]);

  let members = ((profileRows ?? []) as Array<{ id: string; full_name: string | null }>)
    .map((p) => ({ id: p.id, full_name: p.full_name ?? "Usuario" }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "es"));

  if (q) {
    members = members.filter((m) => m.full_name.toLowerCase().includes(q));
  }

  // Ordena ANTES de capar: con la lista ya ordenada alfabéticamente, el cap
  // no deja miembros fuera por orden de inserción (T11).
  members = members.slice(0, MEMBERS_CAP);

  return NextResponse.json({ members });
}
