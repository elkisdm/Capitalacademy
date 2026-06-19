import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/authorize-admin";

export const runtime = "nodejs";

const typeSchema = z.enum(["pdf", "link", "template", "document", "other"]);

const createResourceSchema = z.object({
  lessonId: z.string().trim().min(1, "lessonId es requerido"),
  title: z.string().trim().min(1, "title es requerido"),
  type: typeSchema,
  url: z
    .string()
    .trim()
    .url("url debe ser una URL válida")
    // Solo http(s): bloquea esquemas peligrosos (javascript:, data:) que el
    // alumno abriría como enlace clicable (XSS almacenado).
    .refine(
      (value) => {
        try {
          const protocol = new URL(value).protocol;
          return protocol === "http:" || protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "url debe usar protocolo http o https" },
    ),
});

export async function POST(req: Request) {
  const staff = await requireStaff();
  if ("error" in staff) return staff.error;
  const user = staff.user;

  const supabase = await createClient();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = createResourceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { lessonId, title, type, url } = parsed.data;

  const { data: maxPos } = await supabase
    .from("lesson_resources")
    .select("position")
    .eq("lesson_id", lessonId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (maxPos?.position ?? 0) + 1;

  const { data, error } = await supabase
    .from("lesson_resources")
    .insert({
      lesson_id: lessonId,
      title,
      type,
      url,
      position: nextPosition,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("resource insert error", error);
    // 42501 = insufficient_privilege (rechazo de RLS): no enmascarar como 500.
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "No autorizado para crear recurso" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Error al crear recurso" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: Request) {
  const staff = await requireStaff();
  if ("error" in staff) return staff.error;

  const supabase = await createClient();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id es requerido" }, { status: 422 });
  }

  const { data, error } = await supabase
    .from("lesson_resources")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("resource delete error", error);
    return NextResponse.json({ error: "Error al eliminar recurso" }, { status: 500 });
  }

  // Si no se borró nada (id inexistente u oculto/bloqueado por RLS), array vacío.
  // No mentir con {deleted:true}: devolver 404 para no aparentar un borrado que
  // no ocurrió (la propiedad por rol/autoría se refuerza en el lote del rol Profesor).
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Recurso no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
