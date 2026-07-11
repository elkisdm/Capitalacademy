import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { uuidLike } from "@/lib/utils/zod";
import { REACTION_EMOJIS } from "@/lib/conversaciones/reactions";

export const runtime = "nodejs";

const reactionLimiter = createRateLimiter({ limit: 30, windowSeconds: 60 });

const reactionPostSchema = z
  .object({
    threadId: uuidLike.optional(),
    commentId: uuidLike.optional(),
    emoji: z.string(),
  })
  .refine((v) => Boolean(v.threadId) !== Boolean(v.commentId), {
    message: "Debes enviar exactamente uno de threadId o commentId",
  })
  .refine((v) => (REACTION_EMOJIS as readonly string[]).includes(v.emoji), {
    message: "Emoji no permitido",
    path: ["emoji"],
  });

// ── POST /api/classroom/conversaciones/reactions ────────────────────
// Reacción con emoji sobre un thread o un comentario (uno de los dos). Una
// sola reacción por usuario y target (índice único): mismo emoji = quitar,
// otro emoji = cambiar, sin previa = agregar.

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

  const { threadId, commentId, emoji } = parsed.data;
  const targetColumn = threadId ? "thread_id" : "comment_id";
  const targetId = (threadId ?? commentId) as string;

  const { data: existing, error: existingError } = await supabase
    .from("conversation_reactions")
    .select("id, emoji")
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

  if (existing) {
    if (existing.emoji === emoji) {
      // Mismo emoji → toggle off.
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
    } else {
      // Otro emoji → cambia el existente.
      const { error } = await supabase
        .from("conversation_reactions")
        .update({ emoji })
        .eq("id", existing.id);
      if (error) {
        console.error("conversaciones reactions UPDATE error", error);
        return NextResponse.json(
          { error: "Error al procesar la reacción" },
          { status: 500 },
        );
      }
    }
  } else {
    const { error } = await supabase.from("conversation_reactions").insert({
      user_id: user.id,
      thread_id: threadId ?? null,
      comment_id: commentId ?? null,
      emoji,
    });

    // 23505 = índice único (user_id, target) ya insertado por una request
    // concurrente (doble-tap). Idempotente: seguimos y devolvemos el estado
    // agregado actual en vez de fallar con 500.
    if (error && error.code !== "23505") {
      console.error("conversaciones reactions INSERT error", error);
      return NextResponse.json(
        { error: "Error al procesar la reacción" },
        { status: 500 },
      );
    }
  }

  // Estado nuevo: conteo agrupado por emoji para este target + reacción del viewer.
  const { data: rows } = await supabase
    .from("conversation_reactions")
    .select("emoji, user_id")
    .eq(targetColumn, targetId);

  const counts = new Map<string, number>();
  let viewerReaction: string | null = null;
  for (const row of (rows ?? []) as Array<{ emoji: string; user_id: string }>) {
    counts.set(row.emoji, (counts.get(row.emoji) ?? 0) + 1);
    if (row.user_id === user.id) viewerReaction = row.emoji;
  }

  const reactions = REACTION_EMOJIS.filter((e) => (counts.get(e) ?? 0) > 0).map(
    (e) => ({ emoji: e, count: counts.get(e) as number }),
  );

  return NextResponse.json({ reactions, viewer_reaction: viewerReaction });
}
