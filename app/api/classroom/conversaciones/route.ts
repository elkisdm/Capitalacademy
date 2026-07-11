import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { uuidLike } from "@/lib/utils/zod";
import { getProgramThreads, type RecentThreadsCursor } from "@/lib/conversaciones/queries";
import { getPublicAuthorsMap } from "@/lib/profiles/public-authors";
import { isValidCategory } from "@/lib/conversaciones/categories";

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
  category: z.string().optional(),
});

const sortSchema = z.enum(["recent", "top", "unanswered"]).optional();

// ── GET /api/classroom/conversaciones?programId=xxx&sort=recent&q=&cursor= ──
// Feed de conversaciones de un programa (ADR-0010). `cursor` (solo aplica a
// sort 'recent') es `${isPinned}|${lastActivityAt}|${id}` del último hilo ya
// cargado — keyset pagination (T12, hallazgo 15).

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

  const q = searchParams.get("q")?.trim() || undefined;

  let cursor: RecentThreadsCursor | undefined;
  const cursorParam = searchParams.get("cursor");
  if (cursorParam) {
    const parts = cursorParam.split("|");
    const [isPinnedRaw, lastActivityAt, id] = parts;
    const validPinned = isPinnedRaw === "true" || isPinnedRaw === "false";
    if (
      parts.length !== 3 ||
      !validPinned ||
      Number.isNaN(Date.parse(lastActivityAt)) ||
      !uuidLike.safeParse(id).success
    ) {
      return NextResponse.json({ error: "cursor inválido" }, { status: 422 });
    }
    cursor = { isPinned: isPinnedRaw === "true", lastActivityAt, id };
  }

  try {
    const threads = await getProgramThreads(programId, user.id, {
      sort: sortParsed.data,
      q,
      cursor,
    });
    return NextResponse.json({ threads });
  } catch (err) {
    console.error("conversaciones GET error", err);
    return NextResponse.json(
      { error: "Error al cargar las conversaciones" },
      { status: 500 },
    );
  }
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
  const category = isValidCategory(parsed.data.category)
    ? (parsed.data.category as string)
    : "general";

  const { data, error } = await supabase
    .from("conversation_threads")
    .insert({
      program_id: programId,
      author_id: user.id,
      title,
      body: threadBody,
      category,
    })
    .select(
      "id, title, body, category, is_pinned, is_locked, comment_count, last_activity_at, created_at, author_id",
    )
    .single();

  if (error) {
    console.error("conversaciones POST error", error);
    return NextResponse.json(
      { error: "Error al crear la conversación" },
      { status: 500 },
    );
  }

  // Autor resuelto por service-role (la policy de profiles está cerrada, 0045).
  const authorsMap = await getPublicAuthorsMap([data.author_id]);
  const author = authorsMap.get(data.author_id) ?? {
    id: data.author_id,
    full_name: "Usuario",
    avatar_url: null,
    is_staff: false,
  };

  return NextResponse.json(
    { thread: { ...data, author, reaction_count: 0, viewer_reacted: false } },
    { status: 201 },
  );
}
