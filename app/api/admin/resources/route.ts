import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function requireStaff(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["ops", "admin", "teacher"].includes(profile.role)) {
    return null;
  }
  return user;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const user = await requireStaff(supabase);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { lessonId, title, type, url } = body as {
    lessonId?: string;
    title?: string;
    type?: string;
    url?: string;
  };

  if (!lessonId || !title || !type || !url) {
    return NextResponse.json(
      { error: "lessonId, title, type, y url son requeridos" },
      { status: 422 },
    );
  }

  const { data: maxPos } = await supabase
    .from("lesson_resources")
    .select("position")
    .eq("lesson_id", lessonId)
    .order("position", { ascending: false })
    .limit(1)
    .single();

  const nextPosition = (maxPos?.position ?? 0) + 1;

  const { data, error } = await supabase
    .from("lesson_resources")
    .insert({
      lesson_id: lessonId,
      title,
      type: type as "pdf" | "link" | "template" | "document" | "other",
      url,
      position: nextPosition,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("resource insert error", error);
    return NextResponse.json(
      { error: "Error al crear recurso" },
      { status: 500 },
    );
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const user = await requireStaff(supabase);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id es requerido" }, { status: 422 });
  }

  const { error } = await supabase
    .from("lesson_resources")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("resource delete error", error);
    return NextResponse.json(
      { error: "Error al eliminar recurso" },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: true });
}
