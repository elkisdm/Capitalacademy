import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { uuidLike } from "@/lib/utils/zod";
import { getPublicAuthorsMap } from "@/lib/profiles/public-authors";
import { getProgramStaffIds } from "@/lib/profiles/program-staff";
import { notifyLessonComment } from "@/lib/notifications/lesson-comment";

export const runtime = "nodejs";

const commentLimiter = createRateLimiter({ limit: 10, windowSeconds: 60 });

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const commentPostSchema = z.object({
  lessonId: uuidLike,
  content: z.string().trim().min(1, "El comentario no puede estar vacío").max(2000),
  parentId: uuidLike.optional(),
});

const commentPatchSchema = z.object({
  id: uuidLike,
  content: z.string().trim().min(1, "El comentario no puede estar vacío").max(2000),
});

type CommentRow = {
  id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  edited_at: string | null;
  author_id: string;
};

type CommentRowWithLesson = CommentRow & { lesson_id: string };

/** Resuelve el `program_id` (y opcionalmente el título) de una lección. */
async function getLessonProgramId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lessonId: string,
): Promise<{ programId: string | null; title: string | null }> {
  const { data } = await supabase
    .from("lessons")
    .select("title, program_modules(program_id)")
    .eq("id", lessonId)
    .maybeSingle();
  const moduleRow = data?.program_modules as { program_id: string } | null;
  return { programId: moduleRow?.program_id ?? null, title: data?.title ?? null };
}

/** Mapea una fila cruda a la forma pública que consume el cliente. */
function toPublicComment(
  r: CommentRow,
  authorsMap: Map<string, { id: string; full_name: string; avatar_url: string | null; is_staff: boolean }>,
  staffIds: Set<string>,
) {
  const author = authorsMap.get(r.author_id) ?? {
    id: r.author_id,
    full_name: "Usuario",
    avatar_url: null,
    is_staff: false,
  };
  const deleted = r.deleted_at !== null;
  return {
    id: r.id,
    content: deleted ? null : r.content,
    parent_id: r.parent_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
    edited_at: r.edited_at,
    deleted,
    profiles: {
      ...author,
      is_staff: author.is_staff || staffIds.has(r.author_id),
    },
  };
}

// ── GET /api/classroom/comments?lessonId=xxx&limit=&before= ─
// Devuelve una página de comentarios (más recientes primero, revertidos a
// orden ascendente para el árbol) con overlay de `is_staff` docente y flag
// `deleted` (soft delete: `content: null`, se preserva la fila si tiene hijos).

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

  const limitParam = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, MAX_LIMIT)
    : DEFAULT_LIMIT;
  const before = searchParams.get("before");

  let query = supabase
    .from("lesson_comments")
    .select("id, content, parent_id, created_at, updated_at, deleted_at, edited_at, author_id")
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (before) {
    const beforeDate = new Date(before);
    if (!Number.isNaN(beforeDate.getTime())) {
      query = query.lt("created_at", beforeDate.toISOString());
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error("comments GET error", error);
    return NextResponse.json(
      { error: "Error al obtener comentarios" },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as CommentRow[];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse(); // ascendente para el árbol del cliente

  // El autor se resuelve por service-role (solo id/nombre/avatar): la policy de
  // `profiles` está cerrada a dueño+staff (0045).
  const authorsMap = await getPublicAuthorsMap(page.map((r) => r.author_id));
  const { programId } = await getLessonProgramId(supabase, lessonId);
  const staffIds = programId ? await getProgramStaffIds(programId) : new Set<string>();

  const comments = page.map((r) => toPublicComment(r, authorsMap, staffIds));

  return NextResponse.json({ comments, hasMore });
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
    .select("id, content, parent_id, created_at, updated_at, deleted_at, edited_at, author_id")
    .single();

  if (error) {
    console.error("comments POST error", error);
    if (error.code === "42501" || error.code === "PGRST301") {
      return NextResponse.json(
        { error: "No tienes acceso a comentar en esta lección" },
        { status: 403 },
      );
    }
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "Comentario padre no encontrado" },
        { status: 404 },
      );
    }
    if (error.code === "23514") {
      return NextResponse.json(
        { error: "No se puede responder a este comentario" },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: "Error al crear comentario" },
      { status: 500 },
    );
  }

  const row = data as CommentRow;
  const authorsMap = await getPublicAuthorsMap([row.author_id]);
  const { programId, title } = await getLessonProgramId(supabase, lessonId);
  const staffIds = programId ? await getProgramStaffIds(programId) : new Set<string>();
  const comment = toPublicComment(row, authorsMap, staffIds);

  // Notificaciones best-effort: no deben romper la creación del comentario.
  if (programId) {
    try {
      await notifyLessonComment({
        lessonId,
        lessonTitle: title ?? "",
        commentId: row.id,
        parentId: parentId ?? null,
        actorId: user.id,
        actorName: authorsMap.get(user.id)?.full_name ?? "Alguien",
        programId,
      });
    } catch (err) {
      console.error("lesson comment notify error", err);
    }
  }

  return NextResponse.json({ comment }, { status: 201 });
}

// ── DELETE /api/classroom/comments?id=xxx ───────────────────
// Soft delete (RLS: autor o staff). Preserva las respuestas.

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = commentLimiter.check(user.id);
  if (!rl.ok) return rateLimitResponse(rl);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id || !uuidLike.safeParse(id).success) {
    return NextResponse.json(
      { error: "id es requerido y debe ser un UUID válido" },
      { status: 422 },
    );
  }

  const { data, error } = await supabase
    .from("lesson_comments")
    .update({ deleted_at: new Date().toISOString(), content: "" })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("comments DELETE error", error);
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "No tienes permiso para eliminar este comentario" },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: "Error al eliminar comentario" },
      { status: 500 },
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Comentario no encontrado" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}

// ── PATCH /api/classroom/comments ───────────────────────────
// Edita el content propio (marca edited_at). RLS: solo autor.

export async function PATCH(req: Request) {
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

  const parsed = commentPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { id, content } = parsed.data;

  const { data, error } = await supabase
    .from("lesson_comments")
    .update({ content, edited_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, content, parent_id, created_at, updated_at, deleted_at, edited_at, author_id, lesson_id")
    .maybeSingle();

  if (error) {
    console.error("comments PATCH error", error);
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "No tienes permiso para editar este comentario" },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: "Error al editar comentario" },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Comentario no encontrado" },
      { status: 404 },
    );
  }

  const row = data as CommentRowWithLesson;
  const authorsMap = await getPublicAuthorsMap([row.author_id]);
  const { programId } = await getLessonProgramId(supabase, row.lesson_id);
  const staffIds = programId ? await getProgramStaffIds(programId) : new Set<string>();
  const comment = toPublicComment(row, authorsMap, staffIds);

  return NextResponse.json({ comment });
}
