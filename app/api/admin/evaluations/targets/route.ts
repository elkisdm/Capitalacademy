import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET  /api/admin/evaluations/targets?programId=xxx
//   Módulos y lecciones del programa, para los selectores de creación de
//   evaluaciones (scope=module / scope=lesson) en el admin central de quizes.
//   Solo identidad y orden — no entrega contenido de la lección.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");
  if (!programId) {
    return NextResponse.json({ error: "programId es requerido" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data: modules, error } = await admin
    .from("program_modules")
    .select("id, title, position, lessons(id, title, position)")
    .eq("program_id", programId)
    .order("position", { ascending: true });

  if (error) {
    console.error("Error fetching evaluation targets:", error);
    return NextResponse.json({ error: "Error al obtener módulos y lecciones" }, { status: 500 });
  }

  type RawLesson = { id: string; title: string; position: number };
  const mods = (modules ?? []).map((m) => ({ id: m.id, title: m.title }));
  const lessons = (modules ?? []).flatMap((m) =>
    ((m.lessons ?? []) as RawLesson[])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((l) => ({ id: l.id, title: l.title, moduleId: m.id, moduleTitle: m.title })),
  );

  return NextResponse.json({ modules: mods, lessons });
}
