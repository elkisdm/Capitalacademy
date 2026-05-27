import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();

  const { searchParams } = new URL(req.url);
  const cohortId = searchParams.get("cohortId");

  if (!cohortId) {
    return NextResponse.json(
      { error: "cohortId es requerido" },
      { status: 422 },
    );
  }

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("program_id")
    .eq("id", cohortId)
    .single();

  if (!cohort) {
    return NextResponse.json(
      { error: "Cohorte no encontrada" },
      { status: 404 },
    );
  }

  const { data: modules } = await supabase
    .from("program_modules")
    .select("id, title, position")
    .eq("program_id", cohort.program_id)
    .order("position", { ascending: true });

  return NextResponse.json(
    (modules ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      position: m.position,
    })),
  );
}
