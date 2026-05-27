import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";

export const runtime = "nodejs";

type AssignRoleBody = {
  user_id?: string;
  cohort_id?: string;
  role?: "student" | "teacher" | "assistant";
};

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;
  const caller = auth.user;

  const supabase = await createClient();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { user_id, cohort_id, role } = body as AssignRoleBody;

  if (!user_id || !cohort_id || !role) {
    return NextResponse.json(
      { error: "user_id, cohort_id y role son requeridos" },
      { status: 422 },
    );
  }

  const validRoles = ["student", "teacher", "assistant"];
  if (!validRoles.includes(role)) {
    return NextResponse.json(
      { error: `role debe ser uno de: ${validRoles.join(", ")}` },
      { status: 422 },
    );
  }

  const { data: existing } = await supabase
    .from("cohort_roles")
    .select("id")
    .eq("user_id", user_id)
    .eq("cohort_id", cohort_id)
    .eq("role", role)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "El usuario ya tiene este rol en la cohorte" },
      { status: 409 },
    );
  }

  const { data: cohortRole, error } = await supabase
    .from("cohort_roles")
    .insert({
      user_id,
      cohort_id,
      role,
      granted_by: caller.id,
    })
    .select()
    .single();

  if (error) {
    console.error("cohort_role insert error", error);
    return NextResponse.json(
      { error: "Error al asignar rol" },
      { status: 500 },
    );
  }

  // Optionally set teacher_id on unassigned modules of this cohort's program
  if (role === "teacher") {
    const { data: cohort } = await supabase
      .from("cohorts")
      .select("program_id")
      .eq("id", cohort_id)
      .single();

    if (cohort) {
      await supabase
        .from("program_modules")
        .update({ teacher_id: user_id })
        .eq("program_id", cohort.program_id)
        .is("teacher_id", null);
    }
  }

  return NextResponse.json(cohortRole, { status: 201 });
}

export async function DELETE(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "id es requerido como query param" },
      { status: 422 },
    );
  }

  const { error } = await supabase
    .from("cohort_roles")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("cohort_role delete error", error);
    return NextResponse.json(
      { error: "Error al eliminar rol" },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: true });
}
