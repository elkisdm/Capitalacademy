import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { uuidLike } from "@/lib/utils/zod";
import { getPublicAuthorsMap } from "@/lib/profiles/public-authors";
import { sendConversacionNotificationEmail } from "@/lib/email/conversacion-notification";

export const runtime = "nodejs";

const commentLimiter = createRateLimiter({ limit: 20, windowSeconds: 60 });

const commentPostSchema = z.object({
  threadId: uuidLike,
  body: z.string().trim().min(1, "El comentario no puede estar vacío").max(5000),
  parentId: uuidLike.optional(),
  mentions: z.array(uuidLike).max(10).optional(),
});

const commentPatchSchema = z.object({
  id: uuidLike,
  body: z.string().trim().min(1, "El comentario no puede estar vacío").max(5000),
});

const BASE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://capitalacademy.cl"
).replace(/\/$/, "");

const EMAIL_COOLDOWN_MS = 60 * 60 * 1000; // 1 hora

/**
 * Antes de enviar un correo de `type` para un destinatario+hilo, cuenta
 * cuántas notificaciones de ese tipo tiene ese usuario para ese hilo en la
 * última hora (incluye la fila recién insertada por el trigger de reply).
 * Si ya había más de una, el correo se omite — el in-app queda intacto
 * siempre (lo inserta el trigger de BD, no este código).
 */
async function withinEmailCooldown(
  admin: ReturnType<typeof createAdminClient>,
  params: { type: string; userId: string; threadId: string },
): Promise<boolean> {
  const since = new Date(Date.now() - EMAIL_COOLDOWN_MS).toISOString();
  const { count } = await admin
    .from("conversation_notifications")
    .select("id", { count: "exact", head: true })
    .eq("type", params.type)
    .eq("user_id", params.userId)
    .eq("thread_id", params.threadId)
    .gte("created_at", since);
  return (count ?? 0) > 1;
}

/**
 * Notifica menciones (fila 'mention' en `conversation_notifications`) + emails
 * ('reply' al autor del hilo y al autor del comentario padre, 'mention' a cada
 * mencionado). El in-app de 'reply' lo inserta el trigger de BD
 * (`tg_conversation_reply_notification`, 0067) — este código solo resuelve
 * destinatarios para el EMAIL y para deduplicar las menciones. Todo con el
 * ADMIN client porque la RLS de `conversation_notifications`/`profiles` no
 * deja insertar/leer al authenticated. Best-effort: cualquier fallo se traga
 * (no debe romper la creación del comentario).
 */
async function notifyAndEmail(params: {
  threadId: string;
  commentId: string;
  threadAuthorId: string;
  parentAuthorId: string | null;
  threadTitle: string;
  actorId: string;
  actorName: string;
  mentions: string[];
  programId: string;
}) {
  const admin = createAdminClient();

  const url = `${BASE_URL}/classroom/go/thread/${params.threadId}`;

  // Destinatarios de 'reply' (autor del hilo y autor del comentario padre, si
  // aplica): el trigger de BD ya les insertó la notificación in-app; acá solo
  // se resuelve a quién avisar por correo.
  const replyRecipients = [
    ...new Set(
      [params.threadAuthorId, params.parentAuthorId].filter(
        (id): id is string => Boolean(id) && id !== params.actorId,
      ),
    ),
  ];

  // Mencionados válidos: != autor, != destinatarios de 'reply' (dedupe —
  // evita doble correo/notificación a quien ya recibe 'reply'), deduplicados,
  // y con acceso al programa del hilo.
  const mentionCandidates = [
    ...new Set(
      params.mentions.filter(
        (id) => id && id !== params.actorId && !replyRecipients.includes(id),
      ),
    ),
  ];

  // Filtra a quienes tienen acceso al programa del hilo (mismo criterio que
  // /api/classroom/conversaciones/members): matrícula active/completed en
  // alguna cohorte del programa, o staff (docente del programa o admin/ops).
  // Evita que un ID de otro tenant gatille notificación/email cross-tenant.
  let validMentions: Array<{ id: string; full_name: string | null; email: string | null }> = [];
  if (mentionCandidates.length > 0) {
    const allowedIds = new Set<string>();

    const { data: enrollmentRows } = await admin
      .from("enrollments")
      .select("student_id, cohorts!inner(program_id)")
      .eq("cohorts.program_id", params.programId)
      .in("status", ["active", "completed"])
      .in("student_id", mentionCandidates);
    for (const row of (enrollmentRows ?? []) as Array<{ student_id: string }>) {
      allowedIds.add(row.student_id);
    }

    const { data: cohorts } = await admin
      .from("cohorts")
      .select("id")
      .eq("program_id", params.programId);
    const cohortIds = (cohorts ?? []).map((c) => c.id);
    if (cohortIds.length > 0) {
      const { data: roleRows } = await admin
        .from("cohort_roles")
        .select("user_id")
        .in("cohort_id", cohortIds)
        .in("role", ["teacher", "assistant"])
        .in("user_id", mentionCandidates);
      for (const row of (roleRows ?? []) as Array<{ user_id: string }>) {
        allowedIds.add(row.user_id);
      }
    }

    const { data: staffRows } = await admin
      .from("profiles")
      .select("id")
      .in("id", mentionCandidates)
      .or("system_role.in.(admin,ops),role.in.(admin,ops)");
    for (const row of (staffRows ?? []) as Array<{ id: string }>) {
      allowedIds.add(row.id);
    }

    const allowedMentions = mentionCandidates.filter((id) => allowedIds.has(id));

    if (allowedMentions.length > 0) {
      const { data } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", allowedMentions);
      validMentions = (data ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
      }>;
    }
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

  const emailJobs: Array<Promise<unknown>> = [];

  // Email 'reply' (autor del hilo y/o del comentario padre), con cooldown de
  // 1 hora por destinatario+hilo.
  for (const recipientId of replyRecipients) {
    const onCooldown = await withinEmailCooldown(admin, {
      type: "reply",
      userId: recipientId,
      threadId: params.threadId,
    });
    if (onCooldown) continue;

    const { data: recipientProfile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", recipientId)
      .maybeSingle();

    if (recipientProfile?.email) {
      emailJobs.push(
        sendConversacionNotificationEmail({
          to: recipientProfile.email,
          recipientName: recipientProfile.full_name ?? "",
          actorName: params.actorName,
          title: params.threadTitle,
          kind: "reply",
          url,
        }),
      );
    }
  }

  // Email a cada mencionado ('mention'): sin cooldown, es una acción
  // deliberada del autor.
  for (const m of validMentions) {
    if (!m.email) continue;
    emailJobs.push(
      sendConversacionNotificationEmail({
        to: m.email,
        recipientName: m.full_name ?? "",
        actorName: params.actorName,
        title: params.threadTitle,
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
  // Contenido crudo: React escapa al render (sin dangerouslySetInnerHTML), no
  // hace falta stripHtml.
  const commentBody = parsed.data.body;

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

  let parentAuthorId: string | null = null;
  if (parentId) {
    const { data: parentComment, error: parentError } = await supabase
      .from("conversation_comments")
      .select("id, parent_id, author_id")
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

    parentAuthorId = parentComment.author_id;
  }

  const { data, error } = await supabase
    .from("conversation_comments")
    .insert({
      thread_id: threadId,
      author_id: user.id,
      parent_id: parentId ?? null,
      body: commentBody,
    })
    .select("id, body, parent_id, created_at, edited_at")
    .single();

  if (error) {
    console.error("conversaciones comments POST error", error);
    return NextResponse.json(
      { error: "Error al crear el comentario" },
      { status: 500 },
    );
  }

  // Autor resuelto por service-role (la policy de profiles está cerrada, 0045).
  const authorsMap = await getPublicAuthorsMap([user.id]);
  const author = authorsMap.get(user.id) ?? {
    id: user.id,
    full_name: "Usuario",
    avatar_url: null,
    is_staff: false,
  };

  // Menciones + emails (best-effort): no bloquea ni falla la respuesta.
  try {
    await notifyAndEmail({
      threadId,
      commentId: data.id,
      threadAuthorId: thread.author_id,
      parentAuthorId,
      threadTitle: thread.title,
      actorId: user.id,
      actorName: author.full_name,
      mentions,
      programId: thread.program_id,
    });
  } catch (err) {
    console.error("conversaciones comments notify error", err);
  }

  return NextResponse.json(
    {
      comment: {
        ...data,
        deleted: false,
        author,
        reaction_count: 0,
        reactions: [],
        viewer_reaction: null,
      },
    },
    { status: 201 },
  );
}

// ── PATCH /api/classroom/conversaciones/comments ────────────────────
// Autor edita el body propio (RLS: conversation_comments_author_update).

export async function PATCH(req: Request) {
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

  const parsed = commentPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { id, body: newBody } = parsed.data;

  const { data, error } = await supabase
    .from("conversation_comments")
    .update({ body: newBody, edited_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, body, parent_id, created_at, edited_at, author_id")
    .maybeSingle();

  if (error) {
    console.error("conversaciones comments PATCH error", error);
    if (error.code === "42501" || error.code === "PGRST301") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Error al editar el comentario" },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: "Comentario no encontrado" }, { status: 404 });
  }

  const authorsMap = await getPublicAuthorsMap([data.author_id]);
  const author = authorsMap.get(data.author_id) ?? {
    id: data.author_id,
    full_name: "Usuario",
    avatar_url: null,
    is_staff: false,
  };

  return NextResponse.json({
    comment: { ...data, deleted: false, author },
  });
}

// ── DELETE /api/classroom/conversaciones/comments?id=xxx ────────────
// Soft delete (deleted_at + body vacío): RLS permite autor o staff del
// programa (conversation_comments_author_update / _staff_update).

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

  const { data, error } = await supabase
    .from("conversation_comments")
    .update({ deleted_at: new Date().toISOString(), body: "" })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("conversaciones comments DELETE error", error);
    if (error.code === "42501" || error.code === "PGRST301") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Error al eliminar el comentario" },
      { status: 500 },
    );
  }

  // RLS filtra silenciosamente (0 filas, sin error) cuando el viewer no es
  // autor ni staff del programa del hilo.
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Comentario no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
