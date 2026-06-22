import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";

export const runtime = "nodejs";

// Edición de metadatos del módulo. El `slug` no se edita (rompería URLs). El
// `code` sí (unique por programa) — se re-valida la unicidad.
const patchModuleSchema = z
  .object({
    code: z.string().trim().min(1).max(40).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullish(),
  })
  .refine((o) => Object.keys(o).length > 0, "Debe incluir al menos un campo a actualizar");

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ moduleId: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { moduleId } = await ctx.params;
  const supabase = await createClient();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = patchModuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const { code, title, description } = parsed.data;

  // Si cambia el code, validar unicidad dentro del programa del módulo.
  if (code !== undefined) {
    const { data: current } = await supabase
      .from("program_modules")
      .select("program_id")
      .eq("id", moduleId)
      .maybeSingle();
    if (!current) {
      return NextResponse.json({ error: "Módulo no encontrado" }, { status: 404 });
    }
    const { data: dupe } = await supabase
      .from("program_modules")
      .select("id")
      .eq("program_id", current.program_id)
      .eq("code", code)
      .neq("id", moduleId)
      .maybeSingle();
    if (dupe) {
      return NextResponse.json(
        { error: `Ya existe otro módulo con el código "${code}" en este programa` },
        { status: 409 },
      );
    }
  }

  const patch: { code?: string; title?: string; description?: string | null } = {};
  if (code !== undefined) patch.code = code;
  if (title !== undefined) patch.title = title;
  if (description !== undefined) patch.description = description ?? null;

  const { data, error } = await supabase
    .from("program_modules")
    .update(patch)
    .eq("id", moduleId)
    .select("id, code, title, description, position, slug")
    .maybeSingle();

  if (error) {
    console.error("module update error", error);
    if (error.code === "42501") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error al actualizar el módulo" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Módulo no encontrado" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ moduleId: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { moduleId } = await ctx.params;
  const supabase = await createClient();

  // Guarda de datos: no borrar si alguna lección del módulo tiene progreso de
  // alumnos (el borrado cascadearía lecciones → video_progress).
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id")
    .eq("module_id", moduleId);
  const lessonIds = (lessons ?? []).map((l) => l.id as string);

  if (lessonIds.length > 0) {
    const { count: progressCount } = await supabase
      .from("video_progress")
      .select("id", { count: "exact", head: true })
      .in("lesson_id", lessonIds);
    if ((progressCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "No se puede eliminar: hay lecciones con progreso de alumnos. Quítalas u ocúltalas primero.",
        },
        { status: 409 },
      );
    }
  }

  // Guarda de integridad: no borrar si hay sesiones de calendario vinculadas.
  // La FK es ON DELETE SET NULL, así que borrar dejaría las sesiones huérfanas
  // (module_id = NULL) en silencio, desapareciéndolas del módulo en el aula.
  const { count: sessionCount } = await supabase
    .from("class_sessions")
    .select("id", { count: "exact", head: true })
    .eq("module_id", moduleId);
  if ((sessionCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `No se puede eliminar: hay ${sessionCount} sesión(es) de calendario vinculada(s) a este módulo. Desvincúlalas o reasígnalas primero.`,
      },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("program_modules")
    .delete()
    .eq("id", moduleId)
    .select("id");

  if (error) {
    console.error("module delete error", error);
    return NextResponse.json({ error: "Error al eliminar el módulo" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Módulo no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
