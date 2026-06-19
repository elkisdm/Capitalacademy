import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uniqueSlug } from "@/lib/utils/slug";

export const runtime = "nodejs";

const lessonKind = z.enum(["live_in_person", "live_online", "recorded"]);

const createLessonSchema = z.object({
  moduleId: z.string().trim().min(1, "moduleId es requerido"),
  title: z.string().trim().min(1, "title es requerido").max(200),
  description: z.string().trim().max(2000).nullish(),
  kind: lessonKind.default("recorded"),
  // unlock_at: ISO o null (apertura por calendario). Vacío = disponible siempre.
  unlockAt: z
    .string()
    .trim()
    .nullish()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "unlockAt debe ser una fecha válida"),
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

  const parsed = createLessonSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const { moduleId, title, description, kind, unlockAt } = parsed.data;

  // El módulo debe existir (evita FK error opaco).
  const { data: mod } = await supabase
    .from("program_modules")
    .select("id")
    .eq("id", moduleId)
    .maybeSingle();
  if (!mod) {
    return NextResponse.json({ error: "Módulo no encontrado" }, { status: 404 });
  }

  // Posición: al final del módulo (unique(module_id, position)).
  const { data: lastPos } = await supabase
    .from("lessons")
    .select("position")
    .eq("module_id", moduleId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (lastPos?.position ?? 0) + 1;

  // Slug único GLOBAL (lessons_slug_idx es global).
  const { data: slugRows } = await supabase
    .from("lessons")
    .select("slug")
    .not("slug", "is", null);
  const taken = (slugRows ?? []).map((r) => r.slug as string);
  const slug = uniqueSlug(title, taken);

  const { data, error } = await supabase
    .from("lessons")
    .insert({
      module_id: moduleId,
      title,
      description: description ?? null,
      kind,
      unlock_at: unlockAt || null,
      position,
      slug,
    })
    .select("id, slug, title, position")
    .single();

  if (error) {
    console.error("lesson insert error", error);
    if (error.code === "42501") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error al crear la lección" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
