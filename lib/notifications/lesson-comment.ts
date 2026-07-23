import { createAdminClient } from "@/lib/supabase/admin";
import { getProgramStaffIds } from "@/lib/profiles/program-staff";
import { sendConversacionNotificationEmail } from "@/lib/email/conversacion-notification";
import { getPublicBaseUrl } from "@/lib/api/base-url";

const EMAIL_COOLDOWN_MS = 60 * 60 * 1000;

export type NotifyLessonCommentParams = {
  lessonId: string;
  lessonTitle: string;
  commentId: string;
  parentId: string | null;
  actorId: string;
  actorName: string;
  programId: string;
};

/**
 * Notifica un comentario/respuesta de lección (campana + correo), imitando el
 * patrón `notifyAndEmail` del foro (`.../conversaciones/comments/route.ts`).
 * Vía admin client: la RLS de `conversation_notifications`/`profiles` no deja
 * insertar/leer al `authenticated`. Best-effort: el caller debe envolver en
 * try/catch para no romper la creación del comentario.
 *
 * - `lesson_reply` → autor del comentario padre (si es una respuesta).
 * - `lesson_comment_new` → docentes/asistentes del programa (dedupe, excluye
 *   al actor y a quien ya recibe `lesson_reply`).
 *
 * Cooldown de correo por (usuario, tipo, lección) en la última hora: si ya
 * había >=1 notificación de ese tipo para ese usuario/lección, se omite el
 * correo (la campana in-app siempre se inserta).
 */
export async function notifyLessonComment(params: NotifyLessonCommentParams): Promise<void> {
  const admin = createAdminClient();
  const url = `${getPublicBaseUrl()}/classroom/go/lesson/${params.lessonId}`;

  let replyRecipientId: string | null = null;
  if (params.parentId) {
    const { data: parentComment } = await admin
      .from("lesson_comments")
      .select("author_id")
      .eq("id", params.parentId)
      .maybeSingle();
    if (parentComment && parentComment.author_id !== params.actorId) {
      replyRecipientId = parentComment.author_id;
    }
  }

  const staffIds = await getProgramStaffIds(params.programId);
  const newCommentRecipients = [...staffIds].filter(
    (id) => id !== params.actorId && id !== replyRecipientId,
  );

  type Recipient = { userId: string; type: "lesson_reply" | "lesson_comment_new" };
  const recipients: Recipient[] = [];
  if (replyRecipientId) recipients.push({ userId: replyRecipientId, type: "lesson_reply" });
  for (const userId of newCommentRecipients) {
    recipients.push({ userId, type: "lesson_comment_new" });
  }
  if (recipients.length === 0) return;

  // Cooldown: cuenta notificaciones previas del mismo tipo/usuario/lección en
  // la última hora ANTES de insertar la fila nueva (evita off-by-one).
  const sinceIso = new Date(Date.now() - EMAIL_COOLDOWN_MS).toISOString();
  const cooldownChecks = await Promise.all(
    recipients.map((r) =>
      admin
        .from("conversation_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", r.userId)
        .eq("type", r.type)
        .eq("lesson_id", params.lessonId)
        .gte("created_at", sinceIso),
    ),
  );
  const withinCooldown = cooldownChecks.map((res) => (res.count ?? 0) > 0);

  await admin.from("conversation_notifications").insert(
    recipients.map((r) => ({
      user_id: r.userId,
      actor_id: params.actorId,
      type: r.type,
      lesson_id: params.lessonId,
      lesson_comment_id: params.commentId,
    })),
  );

  const emailRecipients = recipients.filter((_, i) => !withinCooldown[i]);
  if (emailRecipients.length === 0) return;

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .in(
      "id",
      [...new Set(emailRecipients.map((r) => r.userId))],
    );
  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p] as const),
  );

  const emailJobs = emailRecipients.map((r) => {
    const profile = profileMap.get(r.userId);
    if (!profile?.email) return Promise.resolve();
    return sendConversacionNotificationEmail({
      to: profile.email,
      recipientName: profile.full_name ?? "",
      actorName: params.actorName,
      title: params.lessonTitle,
      kind: r.type,
      url,
    });
  });

  await Promise.allSettled(emailJobs);
}
