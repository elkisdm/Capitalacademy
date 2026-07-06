import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

/** Strip HTML tags to prevent storing malicious content. */
function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

const commentLimiter = createRateLimiter({ limit: 20, windowSeconds: 60 });

const commentPostSchema = z.object({
  threadId: uuidLike,
  body: z.string().trim().min(1, "El comentario no puede estar vacío").max(5000),
  parentId: uuidLike.optional(),
});

// ── POST /api/classroom/conversaciones/comments ─────────────────────
// Crea un comentario (o reply, con 1 solo nivel vía parentId).

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

  const { threadId, parentId } = parsed.data;
  const commentBody = stripHtml(parsed.data.body);

  const { data: thread, error: threadError } = await supabase
    .from("conversation_threads")
    .select("id, is_locked")
    .eq("id", threadId)
    .maybeSingle();

  if (threadError || !thread) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  if (thread.is_locked) {
    return NextResponse.json(
      { error: "Esta conversación está cerrada" },
      { status: 403 },
    );
  }

  if (parentId) {
    const { data: parentComment, error: parentError } = await supabase
      .from("conversation_comments")
      .select("id, parent_id")
      .eq("id", parentId)
      .maybeSingle();

    if (parentError || !parentComment) {
      return NextResponse.json({ error: "Comentario padre no encontrado" }, { status: 404 });
    }

    if (parentComment.parent_id !== null) {
      return NextResponse.json(
        { error: "Solo se permite 1 nivel de respuesta" },
        { status: 422 },
      );
    }
  }

  const { data, error } = await supabase
    .from("conversation_comments")
    .insert({
      thread_id: threadId,
      author_id: user.id,
      parent_id: parentId ?? null,
      body: commentBody,
    })
    .select(
      "id, body, parent_id, created_at, author:profiles!conversation_comments_author_id_fkey(id, full_name, avatar_url)",
    )
    .single();

  if (error) {
    console.error("conversaciones comments POST error", error);
    return NextResponse.json(
      { error: "Error al crear el comentario" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { comment: { ...data, reaction_count: 0, viewer_reacted: false } },
    { status: 201 },
  );
}

// ── DELETE /api/classroom/conversaciones/comments?id=xxx ────────────
// RLS permite autor o staff.

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

  if (!id || !uuidLike.safeParse(id).success) {
    return NextResponse.json(
      { error: "id es requerido y debe ser un UUID válido" },
      { status: 422 },
    );
  }

  const { error } = await supabase
    .from("conversation_comments")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("conversaciones comments DELETE error", error);
    return NextResponse.json(
      { error: "Error al eliminar el comentario" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
