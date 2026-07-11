import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPublicAuthorsMap } from "@/lib/profiles/public-authors";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

// ── GET /api/classroom/conversaciones/notifications ─────────────────
// Últimas ~20 notificaciones del viewer + conteo de no-leídas. Cubre foro
// (thread_id) Y lección (lesson_id, T14/0067): por cada notificación calcula
// `href`/`title` server-side (vía la ruta neutra `classroom/go/*`) para que
// la campana no necesite conocer la cohorte del hilo/lección (evita 404
// cross-programa/cross-cohorte). El cliente RLS auto-scopea a auth.uid()
// (policy: user_id = auth.uid()).

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const [{ data: rows }, { count: unread }] = await Promise.all([
    supabase
      .from("conversation_notifications")
      .select("id, type, actor_id, thread_id, lesson_id, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("conversation_notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);

  const notifications = rows ?? [];

  const actorsMap = await getPublicAuthorsMap(
    notifications.map((n) => n.actor_id),
  );

  const threadIds = [
    ...new Set(
      notifications
        .map((n) => n.thread_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const lessonIds = [
    ...new Set(
      notifications
        .map((n) => n.lesson_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const threadTitleMap = new Map<string, string>();
  if (threadIds.length > 0) {
    const { data: threads } = await supabase
      .from("conversation_threads")
      .select("id, title")
      .in("id", threadIds);
    for (const t of threads ?? []) {
      threadTitleMap.set(t.id, t.title);
    }
  }

  const lessonTitleMap = new Map<string, string>();
  if (lessonIds.length > 0) {
    const { data: lessons } = await supabase
      .from("lessons")
      .select("id, title")
      .in("id", lessonIds);
    for (const l of lessons ?? []) {
      lessonTitleMap.set(l.id, l.title);
    }
  }

  return NextResponse.json({
    notifications: notifications.map((n) => {
      const href = n.thread_id
        ? `/classroom/go/thread/${n.thread_id}`
        : n.lesson_id
          ? `/classroom/go/lesson/${n.lesson_id}`
          : null;
      const title = n.thread_id
        ? (threadTitleMap.get(n.thread_id) ?? null)
        : n.lesson_id
          ? (lessonTitleMap.get(n.lesson_id) ?? null)
          : null;
      return {
        id: n.id,
        type: n.type,
        actorName: n.actor_id
          ? (actorsMap.get(n.actor_id)?.full_name ?? "Usuario")
          : "Usuario",
        title,
        href,
        read: n.read_at !== null,
        createdAt: n.created_at,
      };
    }),
    unread: unread ?? 0,
  });
}

// ── POST /api/classroom/conversaciones/notifications ────────────────
// Marca leídas: { id } (una), { ids } (solo las visibles en el panel) o
// { all: true } (todas las no-leídas). RLS enforce user_id = auth.uid().

const postSchema = z.union([
  z.object({ id: uuidLike }),
  z.object({ ids: z.array(uuidLike).min(1).max(100) }),
  z.object({ all: z.literal(true) }),
]);

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

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const readAt = new Date().toISOString();
  let query = supabase
    .from("conversation_notifications")
    .update({ read_at: readAt });

  if ("all" in parsed.data) {
    query = query.is("read_at", null);
  } else if ("ids" in parsed.data) {
    query = query.in("id", parsed.data.ids);
  } else {
    query = query.eq("id", parsed.data.id);
  }

  const { error } = await query;

  if (error) {
    console.error("conversaciones notifications POST error", error);
    return NextResponse.json(
      { error: "Error al marcar como leídas" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
