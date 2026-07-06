import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { uuidLike } from "@/lib/utils/zod";
import { getProgramThreads } from "@/lib/conversaciones/queries";

export const runtime = "nodejs";

/** Strip HTML tags to prevent storing malicious content. */
function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

const threadLimiter = createRateLimiter({ limit: 10, windowSeconds: 60 });

const threadPostSchema = z.object({
  programId: uuidLike,
  title: z.string().trim().min(1, "El título no puede estar vacío").max(200),
  body: z.string().trim().min(1, "El cuerpo no puede estar vacío").max(10000),
});

const sortSchema = z.enum(["recent", "top"]).optional();

// ── GET /api/classroom/conversaciones?programId=xxx&sort=recent ────
// Feed de conversaciones de un programa (ADR-0010).

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");

  if (!programId || !uuidLike.safeParse(programId).success) {
    return NextResponse.json(
      { error: "programId es requerido y debe ser un UUID válido" },
      { status: 422 },
    );
  }

  const sortParsed = sortSchema.safeParse(searchParams.get("sort") ?? undefined);
  if (!sortParsed.success) {
    return NextResponse.json(
      { error: "sort inválido" },
      { status: 422 },
    );
  }

  const threads = await getProgramThreads(programId, user.id, {
    sort: sortParsed.data,
  });

  return NextResponse.json({ threads });
}

// ── POST /api/classroom/conversaciones ──────────────────────────────
// Crea una conversación (thread) en el foro de un programa.

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = threadLimiter.check(user.id);
  if (!rl.ok) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const parsed = threadPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { programId } = parsed.data;
  const title = stripHtml(parsed.data.title);
  const threadBody = parsed.data.body;

  const { data, error } = await supabase
    .from("conversation_threads")
    .insert({
      program_id: programId,
      author_id: user.id,
      title,
      body: threadBody,
    })
    .select(
      "id, title, body, category, is_pinned, is_locked, comment_count, last_activity_at, created_at, author:profiles!conversation_threads_author_id_fkey(id, full_name, avatar_url)",
    )
    .single();

  if (error) {
    console.error("conversaciones POST error", error);
    return NextResponse.json(
      { error: "Error al crear la conversación" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { thread: { ...data, reaction_count: 0, viewer_reacted: false } },
    { status: 201 },
  );
}
