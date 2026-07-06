import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProgramAccess } from "@/lib/conversaciones/access";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

const MEMBERS_CAP = 200;

// ── GET /api/classroom/conversaciones/members?programId=xxx ──────────
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

  // Staff transversal (admin/ops): puede mencionarse aunque no esté matriculado.
  const { data: staffRows } = await admin
    .from("profiles")
    .select("id")
    .or("system_role.in.(admin,ops),role.in.(admin,ops)");

  for (const row of (staffRows ?? []) as Array<{ id: string }>) {
    ids.add(row.id);
  }

  const memberIds = [...ids].slice(0, MEMBERS_CAP);

  if (memberIds.length === 0) {
    return NextResponse.json({ members: [] });
  }

  const { data: profileRows } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", memberIds);

  const members = ((profileRows ?? []) as Array<{ id: string; full_name: string | null }>)
    .map((p) => ({ id: p.id, full_name: p.full_name ?? "Usuario" }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "es"));

  return NextResponse.json({ members });
}
