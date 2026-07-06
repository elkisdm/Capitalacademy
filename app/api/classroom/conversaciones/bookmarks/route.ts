import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

const bookmarkLimiter = createRateLimiter({ limit: 30, windowSeconds: 60 });

const bookmarkPostSchema = z.object({
  threadId: uuidLike,
});

// ── POST /api/classroom/conversaciones/bookmarks ────────────────────
// Toggle de "guardado" de un hilo para el viewer. La policy RLS de
// `conversation_bookmarks` exige user_id = auth.uid() en select/insert/delete,
// así que el cliente normal (con la sesión del usuario) basta.

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = bookmarkLimiter.check(user.id);
  if (!rl.ok) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const parsed = bookmarkPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { threadId } = parsed.data;

  const { data: existing, error: existingError } = await supabase
    .from("conversation_bookmarks")
    .select("thread_id")
    .eq("user_id", user.id)
    .eq("thread_id", threadId)
    .maybeSingle();

  if (existingError) {
    console.error("conversaciones bookmarks lookup error", existingError);
    return NextResponse.json(
      { error: "Error al procesar el guardado" },
      { status: 500 },
    );
  }

  if (existing) {
    const { error } = await supabase
      .from("conversation_bookmarks")
      .delete()
      .eq("user_id", user.id)
      .eq("thread_id", threadId);

    if (error) {
      console.error("conversaciones bookmarks DELETE error", error);
      return NextResponse.json(
        { error: "Error al procesar el guardado" },
        { status: 500 },
      );
    }
    return NextResponse.json({ bookmarked: false });
  }

  const { error } = await supabase.from("conversation_bookmarks").insert({
    user_id: user.id,
    thread_id: threadId,
  });

  if (error) {
    console.error("conversaciones bookmarks INSERT error", error);
    return NextResponse.json(
      { error: "Error al procesar el guardado" },
      { status: 500 },
    );
  }

  return NextResponse.json({ bookmarked: true });
}
