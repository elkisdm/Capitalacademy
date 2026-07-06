import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

const reactionLimiter = createRateLimiter({ limit: 30, windowSeconds: 60 });

const reactionPostSchema = z
  .object({
    threadId: uuidLike.optional(),
    commentId: uuidLike.optional(),
  })
  .refine((v) => Boolean(v.threadId) !== Boolean(v.commentId), {
    message: "Debes enviar exactamente uno de threadId o commentId",
  });

// ── POST /api/classroom/conversaciones/reactions ────────────────────
// Toggle de reacción ❤️ sobre un thread o un comentario (uno de los dos).

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = reactionLimiter.check(user.id);
  if (!rl.ok) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const parsed = reactionPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { threadId, commentId } = parsed.data;
  const targetColumn = threadId ? "thread_id" : "comment_id";
  const targetId = (threadId ?? commentId) as string;

  const { data: existing, error: existingError } = await supabase
    .from("conversation_reactions")
    .select("id")
    .eq("user_id", user.id)
    .eq(targetColumn, targetId)
    .maybeSingle();

  if (existingError) {
    console.error("conversaciones reactions lookup error", existingError);
    return NextResponse.json(
      { error: "Error al procesar la reacción" },
      { status: 500 },
    );
  }

  let reacted: boolean;

  if (existing) {
    const { error } = await supabase
      .from("conversation_reactions")
      .delete()
      .eq("id", existing.id);

    if (error) {
      console.error("conversaciones reactions DELETE error", error);
      return NextResponse.json(
        { error: "Error al procesar la reacción" },
        { status: 500 },
      );
    }
    reacted = false;
  } else {
    const { error } = await supabase.from("conversation_reactions").insert({
      user_id: user.id,
      thread_id: threadId ?? null,
      comment_id: commentId ?? null,
    });

    if (error) {
      console.error("conversaciones reactions INSERT error", error);
      return NextResponse.json(
        { error: "Error al procesar la reacción" },
        { status: 500 },
      );
    }
    reacted = true;
  }

  const { count } = await supabase
    .from("conversation_reactions")
    .select("id", { count: "exact", head: true })
    .eq(targetColumn, targetId);

  return NextResponse.json({ reacted, count: count ?? 0 });
}
