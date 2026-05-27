import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// ── GET /api/classroom/comments?lessonId=xxx ────────────────
// Returns flat list of comments with author info. Client builds the tree.

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const lessonId = searchParams.get("lessonId");

  if (!lessonId) {
    return NextResponse.json(
      { error: "lessonId es requerido" },
      { status: 422 },
    );
  }

  const { data, error } = await supabase
    .from("lesson_comments")
    .select(
      "id, content, parent_id, created_at, updated_at, profiles!inner(id, full_name)",
    )
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("comments GET error", error);
    return NextResponse.json(
      { error: "Error al obtener comentarios" },
      { status: 500 },
    );
  }

  return NextResponse.json({ comments: data ?? [] });
}

// ── POST /api/classroom/comments ────────────────────────────
// Create a comment (or reply if parentId is provided).

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const { lessonId, content, parentId } = body as {
    lessonId?: string;
    content?: string;
    parentId?: string;
  };

  if (!lessonId || !content?.trim()) {
    return NextResponse.json(
      { error: "lessonId y content son requeridos" },
      { status: 422 },
    );
  }

  const { data, error } = await supabase
    .from("lesson_comments")
    .insert({
      lesson_id: lessonId,
      author_id: user.id,
      parent_id: parentId || null,
      content: content.trim(),
    })
    .select(
      "id, content, parent_id, created_at, profiles!inner(id, full_name)",
    )
    .single();

  if (error) {
    console.error("comments POST error", error);
    return NextResponse.json(
      { error: "Error al crear comentario" },
      { status: 500 },
    );
  }

  return NextResponse.json({ comment: data }, { status: 201 });
}

// ── DELETE /api/classroom/comments?id=xxx ───────────────────
// Delete a comment. RLS policy: only author or staff can delete.

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "id es requerido" },
      { status: 422 },
    );
  }

  const { error } = await supabase
    .from("lesson_comments")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("comments DELETE error", error);
    return NextResponse.json(
      { error: "Error al eliminar comentario" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
