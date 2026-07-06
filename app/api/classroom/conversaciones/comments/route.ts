import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { uuidLike } from "@/lib/utils/zod";
import { sendConversacionNotificationEmail } from "@/lib/email/conversacion-notification";

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
  mentions: z.array(z.string()).optional(),
});

const BASE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://capitalacademy.cl"
).replace(/\/$/, "");

/**
 * Notifica menciones (fila 'mention' en `conversation_notifications`) + emails
 * (al autor del hilo con 'reply' y a cada mencionado con 'mention'). Todo con
 * el ADMIN client porque la RLS de `conversation_notifications`/`profiles` no
 * deja insertar/leer al authenticated. Best-effort: cualquier fallo se traga
 * (no debe romper la creación del comentario).
 */
async function notifyAndEmail(params: {
  threadId: string;
  commentId: string;
  threadAuthorId: string;
  threadTitle: string;
  actorId: string;
  actorName: string;
  mentions: string[];
  cohortSlug: string | null;
}) {
  const admin = createAdminClient();

  const url = params.cohortSlug
    ? `${BASE_URL}/classroom/${params.cohortSlug}/conversaciones/${params.threadId}`
    : `${BASE_URL}/classroom`;

  // Mencionados válidos: != autor, deduplicados, y que existan como perfil.
  const mentionCandidates = [
    ...new Set(params.mentions.filter((id) => id && id !== params.actorId)),
  ];

  let validMentions: Array<{ id: string; full_name: string | null; email: string | null }> = [];
  if (mentionCandidates.length > 0) {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", mentionCandidates);
    validMentions = (data ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
    }>;
  }

  // Notificaciones 'mention' (una por mencionado válido).
  if (validMentions.length > 0) {
    await admin.from("conversation_notifications").insert(
      validMentions.map((m) => ({
        user_id: m.id,
        actor_id: params.actorId,
        type: "mention",
        thread_id: params.threadId,
        comment_id: params.commentId,
      })),
    );
  }

  // Email al autor del hilo ('reply') si comenta otra persona.
  const emailJobs: Array<Promise<unknown>> = [];

  if (params.threadAuthorId !== params.actorId) {
    const { data: authorProfile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", params.threadAuthorId)
      .maybeSingle();

    if (authorProfile?.email) {
      emailJobs.push(
        sendConversacionNotificationEmail({
          to: authorProfile.email,
          recipientName: authorProfile.full_name ?? "",
          actorName: params.actorName,
          threadTitle: params.threadTitle,
          kind: "reply",
          url,
        }),
      );
    }
  }

  // Email a cada mencionado ('mention').
  for (const m of validMentions) {
    if (!m.email) continue;
    emailJobs.push(
      sendConversacionNotificationEmail({
        to: m.email,
        recipientName: m.full_name ?? "",
        actorName: params.actorName,
        threadTitle: params.threadTitle,
        kind: "mention",
        url,
      }),
    );
  }

  await Promise.allSettled(emailJobs);
}

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
  const mentions = parsed.data.mentions ?? [];
  const commentBody = stripHtml(parsed.data.body);

  const { data: thread, error: threadError } = await supabase
    .from("conversation_threads")
    .select("id, is_locked, author_id, title, program_id")
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

  // Menciones + emails (best-effort): no bloquea ni falla la respuesta.
  try {
    const authorName =
      (data.author as { full_name?: string | null } | null)?.full_name ?? "Alguien";

    // Slug de una cohorte del programa para armar el enlace del email.
    const { data: cohort } = await supabase
      .from("cohorts")
      .select("slug")
      .eq("program_id", thread.program_id)
      .not("slug", "is", null)
      .limit(1)
      .maybeSingle();

    await notifyAndEmail({
      threadId,
      commentId: data.id,
      threadAuthorId: thread.author_id,
      threadTitle: thread.title,
      actorId: user.id,
      actorName: authorName,
      mentions,
      cohortSlug: cohort?.slug ?? null,
    });
  } catch (err) {
    console.error("conversaciones comments notify error", err);
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
