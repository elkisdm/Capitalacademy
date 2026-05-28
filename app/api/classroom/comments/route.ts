import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

const commentLimiter = createRateLimiter({ limit: 10, windowSeconds: 60 });

const commentPostSchema = z.object({
  lessonId: z.string().uuid(),
  content: z.string().trim().min(1, "El comentario no puede estar vacío").max(2000),
  parentId: z.string().uuid().optional(),
});

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

  if (!lessonId || !z.string().uuid().safeParse(lessonId).success) {
    return NextResponse.json(
      { error: "lessonId es requerido y debe ser un UUID válido" },
      { status: 422 },
    );
  }

  const { data, error } = await supabase
    .from("lesson_comments")
    .select(
      "id, content, parent_id, created_at, updated_at, profiles!inner(id, full_name, avatar_url)",
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

  const rl = commentLimiter.check(user.id);
  if (!rl.ok) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const parsed = commentPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { lessonId, content, parentId } = parsed.data;

  const { data, error } = await supabase
    .from("lesson_comments")
    .insert({
      lesson_id: lessonId,
      author_id: user.id,
      parent_id: parentId ?? null,
      content,
    })
    .select(
      "id, content, parent_id, created_at, profiles!inner(id, full_name, avatar_url)",
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

  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json(
      { error: "id es requerido y debe ser un UUID válido" },
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
