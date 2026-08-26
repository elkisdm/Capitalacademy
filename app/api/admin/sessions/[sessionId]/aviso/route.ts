import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { getSessionRecipients } from "@/lib/classroom/session-recipients";
import { buildSessionChangeEmail } from "@/lib/email/session-change";
import { sendEmailBatch } from "@/lib/email/send-batch";

export const runtime = "nodejs";

/**
 * POST /api/admin/sessions/:sessionId/aviso
 *
 * Le avisa a los alumnos de la cohorte que la clase cambió de horario o se
 * canceló. Lo dispara quien edita, a mano, después de ver a cuántos alcanza:
 * reacomodar un calendario mueve varias clases seguidas y un aviso automático
 * mandaría una tanda de correos por cada una.
 *
 * El horario ANTERIOR llega en el body y no se lee de la base a propósito: para
 * cuando esta ruta corre, la fila ya tiene el horario NUEVO (o ya no existe, si
 * es una cancelación). Ese dato solo lo tiene quien hizo el cambio.
 *
 * Para una cancelación se llama ANTES del DELETE, porque hace falta la fila para
 * saber a quién escribirle.
 */

/**
 * GET /api/admin/sessions/:sessionId/aviso
 * A cuántos alcanzaría el aviso. Se pide antes de mostrar la confirmación, para
 * que quien decide vea el tamaño de lo que está por mandar.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { sessionId } = await ctx.params;
  if (!uuidLike.safeParse(sessionId).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("class_sessions")
    .select("cohort_id, audience, attendee_student_ids")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "No encontramos esta clase." }, { status: 404 });
  }

  try {
    const recipients = await getSessionRecipients(admin, session);
    return NextResponse.json({ count: recipients.length });
  } catch (err) {
    console.error("[aviso] conteo", err);
    return NextResponse.json({ error: "No se pudo calcular a cuántos avisar" }, { status: 500 });
  }
}

const schema = z
  .object({
    kind: z.enum(["rescheduled", "cancelled"]),
    previousStartsAt: z.string().datetime({ offset: true }),
    previousEndsAt: z.string().datetime({ offset: true }),
    motivo: z.string().trim().max(300).nullable().optional(),
  })
  .refine((v) => new Date(v.previousEndsAt) > new Date(v.previousStartsAt), {
    message: "El horario anterior es incoherente",
    path: ["previousEndsAt"],
  });

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { sessionId } = await ctx.params;
  if (!uuidLike.safeParse(sessionId).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const v = parsed.data;
  const admin = createAdminClient();

  const { data: session } = await admin
    .from("class_sessions")
    .select("id, cohort_id, title, starts_at, ends_at, modality, audience, teacher_id, attendee_student_ids")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "No encontramos esta clase." }, { status: 404 });
  }

  // Una reprogramación que no cambió nada no se avisa: sería un correo que dice
  // "cambió de horario" mostrando dos veces la misma hora.
  if (
    v.kind === "rescheduled" &&
    session.starts_at === v.previousStartsAt &&
    session.ends_at === v.previousEndsAt
  ) {
    return NextResponse.json(
      { error: "El horario no cambió, no hay nada que avisar." },
      { status: 422 },
    );
  }

  let teacherName: string | null = null;
  if (session.teacher_id) {
    const { data: teacher } = await admin
      .from("instructors")
      .select("full_name")
      .eq("id", session.teacher_id)
      .maybeSingle();
    teacherName = teacher?.full_name ?? null;
  }

  let recipients;
  try {
    recipients = await getSessionRecipients(admin, session);
  } catch (err) {
    console.error("[aviso] destinatarios", err);
    return NextResponse.json({ error: "No se pudo resolver a quién avisar" }, { status: 500 });
  }

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "No hay alumnos activos a quienes avisar en esta cohorte." },
      { status: 422 },
    );
  }

  const title = session.title ?? "Tu clase";
  const messages = recipients.map((r) => ({
    to: r.email,
    ...buildSessionChangeEmail({
      fullName: r.fullName ?? "",
      sessionTitle: title,
      kind: v.kind,
      previousStartsAtIso: v.previousStartsAt,
      previousEndsAtIso: v.previousEndsAt,
      startsAtIso: v.kind === "rescheduled" ? session.starts_at : null,
      endsAtIso: v.kind === "rescheduled" ? session.ends_at : null,
      modality: session.modality ?? "live_online",
      teacherName,
      motivo: v.motivo ?? null,
    }),
  }));

  // El prefijo ancla la clave de idempotencia de Resend a ESTE aviso: un
  // reintento del mismo lote no vuelve a entregar.
  const outcome = await sendEmailBatch(messages, `scn:${sessionId}:${v.kind}`);

  await admin.from("session_change_notices").insert({
    session_id: session.id,
    session_title: title,
    cohort_id: session.cohort_id,
    kind: v.kind,
    previous_starts_at: v.previousStartsAt,
    previous_ends_at: v.previousEndsAt,
    new_starts_at: v.kind === "rescheduled" ? session.starts_at : null,
    new_ends_at: v.kind === "rescheduled" ? session.ends_at : null,
    motivo: v.motivo ?? null,
    recipients_count: outcome.sent.length,
    sent_by: auth.user.id,
  });

  return NextResponse.json({
    sent: outcome.sent.length,
    failed: outcome.failed.length,
    total: recipients.length,
  });
}
