import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { uuidLike } from "@/lib/utils/zod";
import { getPublicAuthorsMap } from "@/lib/profiles/public-authors";

export const runtime = "nodejs";

/** Strip HTML tags to prevent storing malicious content. */
function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

const commentLimiter = createRateLimiter({ limit: 10, windowSeconds: 60 });

const commentPostSchema = z.object({
  lessonId: uuidLike,
  content: z.string().trim().min(1, "El comentario no puede estar vacío").max(2000),
  parentId: uuidLike.optional(),
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

  if (!lessonId || !uuidLike.safeParse(lessonId).success) {
    return NextResponse.json(
      { error: "lessonId es requerido y debe ser un UUID válido" },
      { status: 422 },
    );
  }

  const { data, error } = await supabase
    .from("lesson_comments")
    .select("id, content, parent_id, created_at, updated_at, author_id")
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("comments GET error", error);
    return NextResponse.json(
      { error: "Error al obtener comentarios" },
      { status: 500 },
    );
  }

  // El autor se resuelve por service-role (solo id/nombre/avatar): la policy de
  // `profiles` está cerrada a dueño+staff (0045). Se mantiene la clave `profiles`
  // para no cambiar el contrato con el cliente.
  const rows = (data ?? []) as Array<{
    id: string;
    content: string;
    parent_id: string | null;
    created_at: string;
    updated_at: string | null;
    author_id: string;
  }>;
  const authorsMap = await getPublicAuthorsMap(rows.map((r) => r.author_id));
  const comments = rows.map((r) => ({
    id: r.id,
    content: r.content,
    parent_id: r.parent_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
    profiles: authorsMap.get(r.author_id) ?? {
      id: r.author_id,
      full_name: "Usuario",
      avatar_url: null,
    },
  }));

  return NextResponse.json({ comments });
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

  const { lessonId, parentId } = parsed.data;
  const content = stripHtml(parsed.data.content);

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

  if (!id || !uuidLike.safeParse(id).success) {
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
