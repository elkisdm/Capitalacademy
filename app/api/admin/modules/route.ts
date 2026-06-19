import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uniqueSlug } from "@/lib/utils/slug";

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

const createModuleSchema = z.object({
  programId: z.string().trim().min(1, "programId es requerido"),
  code: z.string().trim().min(1, "code es requerido").max(40),
  title: z.string().trim().min(1, "title es requerido").max(200),
  description: z.string().trim().max(2000).nullish(),
});

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = createModuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const { programId, code, title, description } = parsed.data;

  const { data: program } = await supabase
    .from("programs")
    .select("id")
    .eq("id", programId)
    .maybeSingle();
  if (!program) {
    return NextResponse.json({ error: "Programa no encontrado" }, { status: 404 });
  }

  // code es unique(program_id, code): rechazar duplicado con mensaje claro.
  const { data: dupe } = await supabase
    .from("program_modules")
    .select("id")
    .eq("program_id", programId)
    .eq("code", code)
    .maybeSingle();
  if (dupe) {
    return NextResponse.json(
      { error: `Ya existe un módulo con el código "${code}" en este programa` },
      { status: 409 },
    );
  }

  // Posición al final del programa (unique(program_id, position)).
  const { data: lastPos } = await supabase
    .from("program_modules")
    .select("position")
    .eq("program_id", programId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (lastPos?.position ?? 0) + 1;

  // Slug único global (program_modules_slug_idx).
  const { data: slugRows } = await supabase
    .from("program_modules")
    .select("slug")
    .not("slug", "is", null);
  const taken = (slugRows ?? []).map((r) => r.slug as string);
  const slug = uniqueSlug(`${code} ${title}`, taken);

  const { data, error } = await supabase
    .from("program_modules")
    .insert({
      program_id: programId,
      code,
      title,
      description: description ?? null,
      position,
      slug,
    })
    .select("id, code, title, position, slug")
    .single();

  if (error) {
    console.error("module insert error", error);
    if (error.code === "42501") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error al crear el módulo" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
