import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

const lessonKind = z.enum(["live_in_person", "live_online", "recorded"]);

// Edición de metadatos de la lección. El `slug` NO se edita: cambiarlo rompería
// URLs/bookmarks existentes (se fija al crear). El video/recursos se gestionan
// en sus propios endpoints (mux/upload, lesson_resources).
const patchLessonSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullish(),
    kind: lessonKind.optional(),
    unlockAt: z
      .string()
      .trim()
      .nullish()
      .refine((v) => !v || !Number.isNaN(Date.parse(v)), "unlockAt debe ser una fecha válida"),
    // Mover la lección a otro módulo (del mismo programa).
    moduleId: uuidLike.optional(),
  })
  .refine(
    (o) => Object.keys(o).length > 0,
    "Debe incluir al menos un campo a actualizar",
  );

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ lessonId: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { lessonId } = await ctx.params;
  const supabase = await createClient();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = patchLessonSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const { title, description, kind, unlockAt, moduleId } = parsed.data;

  const patch: {
    title?: string;
    description?: string | null;
    kind?: "live_in_person" | "live_online" | "recorded";
    unlock_at?: string | null;
    module_id?: string;
    position?: number;
  } = {};
  if (title !== undefined) patch.title = title;
  if (description !== undefined) patch.description = description ?? null;
  if (kind !== undefined) patch.kind = kind;
  // unlockAt presente (incluso null/"") = setear/limpiar la apertura por calendario.
  if (unlockAt !== undefined) patch.unlock_at = unlockAt || null;

  // Mover a otro módulo: el destino debe ser del MISMO programa (no se cruzan
  // tenants), y la lección se ubica al final del módulo destino.
  if (moduleId !== undefined) {
    const { data: lessonRow } = await supabase
      .from("lessons")
      .select("module_id")
      .eq("id", lessonId)
      .maybeSingle();
    if (!lessonRow) {
      return NextResponse.json({ error: "Lección no encontrada" }, { status: 404 });
    }
    const [{ data: curMod }, { data: tgtMod }] = await Promise.all([
      supabase.from("program_modules").select("program_id").eq("id", lessonRow.module_id).maybeSingle(),
      supabase.from("program_modules").select("program_id").eq("id", moduleId).maybeSingle(),
    ]);
    if (!tgtMod) {
      return NextResponse.json({ error: "El módulo destino no existe" }, { status: 422 });
    }
    if (!curMod || tgtMod.program_id !== curMod.program_id) {
      return NextResponse.json(
        { error: "No se puede mover la lección a un módulo de otro programa" },
        { status: 422 },
      );
    }
    if (moduleId !== lessonRow.module_id) {
      patch.module_id = moduleId;
      const { data: maxPos } = await supabase
        .from("lessons")
        .select("position")
        .eq("module_id", moduleId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      patch.position = (maxPos?.position ?? 0) + 1;
    }
  }

  // Caso no-op (p.ej. mover al mismo módulo sin otros cambios): nada que escribir.
  if (Object.keys(patch).length === 0) {
    const { data: current } = await supabase
      .from("lessons")
      .select("id, title, description, kind, unlock_at, slug, position")
      .eq("id", lessonId)
      .maybeSingle();
    if (!current) {
      return NextResponse.json({ error: "Lección no encontrada" }, { status: 404 });
    }
    return NextResponse.json(current);
  }

  const { data, error } = await supabase
    .from("lessons")
    .update(patch)
    .eq("id", lessonId)
    .select("id, title, description, kind, unlock_at, slug, position")
    .maybeSingle();

  if (error) {
    console.error("lesson update error", error);
    if (error.code === "42501") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error al actualizar la lección" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Lección no encontrada" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ lessonId: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { lessonId } = await ctx.params;
  const supabase = await createClient();

  // Guarda de seguridad de datos: no borrar una lección con progreso de alumnos
  // (el borrado cascadearía video_progress). Soft-delete/archivar queda como futuro.
  const { count: progressCount } = await supabase
    .from("video_progress")
    .select("id", { count: "exact", head: true })
    .eq("lesson_id", lessonId);

  if ((progressCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "No se puede eliminar: la lección ya tiene progreso de alumnos. Edítala u ocúltala en su lugar.",
      },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("lessons")
    .delete()
    .eq("id", lessonId)
    .select("id");

  if (error) {
    console.error("lesson delete error", error);
    return NextResponse.json({ error: "Error al eliminar la lección" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Lección no encontrada" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
