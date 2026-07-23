import { createAdminClient } from "@/lib/supabase/admin";
import { buildDeliverableOpenEmail } from "@/lib/email/deliverable-open";
import { sendEmailBatch, type BatchMessage } from "@/lib/email/send-batch";

type NotifyResult = { skipped: true } | { skipped: false; sent: number };

// Ventana de "reserva sin terminar": si `open_notified_at` quedó seteado pero
// `open_notify_completed_at` sigue null pasado este margen, el proceso murió
// a mitad del loop de envío (crash) y la reserva se puede reclamar de nuevo.
// Mismo criterio que RETRY_STALE_MS en session-reminders/route.ts (0063):
// mayor al maxDuration del cron que llama esto (60s) y menor al período del
// cron (>=30 min), para no pisar una corrida activa.
const RETRY_STALE_MS = 10 * 60 * 1000; // 10 min

/**
 * Envía el correo de apertura de un entregable a los alumnos con matrícula
 * activa en su programa.
 *
 * Idempotente en dos tiempos (0063): `open_notified_at` marca la RESERVA
 * (envío en curso) y `open_notify_completed_at` marca que el loop de envío
 * TERMINÓ. El reclamo es un update condicional atómico — solo una corrida
 * puede ganar la fila, porque Postgres re-evalúa el WHERE contra el valor ya
 * comprometido (mismo razonamiento que el reclamo de session_reminders). Se
 * intenta primero reclamar un entregable nunca reservado; si no hay fila, se
 * intenta reclamar una reserva vieja sin terminar (`open_notify_completed_at`
 * null y `open_notified_at` anterior a RETRY_STALE_MS: señal de crash a
 * mitad del loop). Si ninguna reclama, ya fue notificado (o está en curso
 * por otra corrida, o aún no abre la ventana) y se aborta sin reenviar.
 * Se llama tanto al crear un entregable con ventana ya abierta como desde el
 * cron para aperturas futuras.
 */
export async function notifyDeliverableOpen(deliverableId: string): Promise<NotifyResult> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const staleCutoffIso = new Date(Date.now() - RETRY_STALE_MS).toISOString();

  const { data: reserveData, error: reserveError } = await admin
    .from("deliverables")
    .update({ open_notified_at: now, open_notify_completed_at: null })
    .eq("id", deliverableId)
    .is("open_notified_at", null)
    .lte("opens_at", now)
    .select("id, title, due_at, program_id")
    .maybeSingle();
  let reserved = reserveData;

  if (reserveError) {
    console.error("notifyDeliverableOpen reserve error", reserveError);
    return { skipped: true };
  }

  if (!reserved) {
    // No había reserva nueva disponible: puede que ya esté notificado, en
    // curso, o que sea una reserva vieja sin terminar (crash). Solo la
    // última es reintentable.
    const { data: retriedStale, error: retryError } = await admin
      .from("deliverables")
      .update({ open_notified_at: now, open_notify_completed_at: null })
      .eq("id", deliverableId)
      .is("open_notify_completed_at", null)
      .lt("open_notified_at", staleCutoffIso)
      .lte("opens_at", now)
      .select("id, title, due_at, program_id")
      .maybeSingle();
    if (retryError) {
      console.error("notifyDeliverableOpen retry error", retryError);
      return { skipped: true };
    }
    reserved = retriedStale;
  }
  if (!reserved) return { skipped: true };

  const { data: program } = await admin
    .from("programs")
    .select("name")
    .eq("id", reserved.program_id)
    .single();

  const { data: enrollments, error: enrollmentsError } = await admin
    .from("enrollments")
    .select("student_id, profiles(email, full_name), cohorts!inner(program_id)")
    .eq("cohorts.program_id", reserved.program_id)
    .eq("status", "active");

  if (enrollmentsError) {
    console.error("notifyDeliverableOpen enrollments error", enrollmentsError);
    return { skipped: true };
  }

  const byStudent = new Map<string, { email: string; fullName: string }>();
  for (const e of (enrollments ?? []) as Array<{
    student_id: string;
    profiles: { email: string; full_name: string | null } | null;
  }>) {
    const p = e.profiles;
    if (p?.email && !byStudent.has(e.student_id)) {
      byStudent.set(e.student_id, { email: p.email, fullName: p.full_name ?? "" });
    }
  }
  const recipients = [...byStudent].map(([studentId, r]) => ({ studentId, ...r }));

  // IDEMPOTENCIA POR DESTINATARIO (migración 0077): a quién YA le llegó, para
  // que un reclamo de una reserva vieja sin terminar no reenvíe desde cero
  // (mismo bug y mismo fix que session_reminder_recipients / 0075).
  const { data: ledger, error: ledgerReadErr } = await admin
    .from("deliverable_open_recipients")
    .select("student_id")
    .eq("deliverable_id", reserved.id)
    .eq("kind", "deliverable_open")
    .eq("channel", "email")
    .eq("status", "sent");
  if (ledgerReadErr) {
    console.error("notifyDeliverableOpen ledger read error", ledgerReadErr);
    return { skipped: true };
  }
  const alreadyDelivered = new Set(
    ((ledger ?? []) as Array<{ student_id: string }>).map((r) => r.student_id),
  );
  const missing = recipients.filter((r) => !alreadyDelivered.has(r.studentId));

  const studentIdByEmail = new Map(missing.map((r) => [r.email, r.studentId]));
  const messages: BatchMessage[] = missing.map((r) => ({
    to: r.email,
    ...buildDeliverableOpenEmail({
      email: r.email,
      fullName: r.fullName,
      deliverableTitle: reserved.title,
      dueAtIso: reserved.due_at,
      programName: program?.name,
    }),
  }));

  const outcome = await sendEmailBatch(messages, `do:${reserved.id}`);

  const ledgerRows = [
    ...outcome.sent.map((to) => ({
      deliverable_id: reserved.id,
      student_id: studentIdByEmail.get(to)!,
      kind: "deliverable_open",
      channel: "email",
      status: "sent",
      error: null as string | null,
    })),
    ...outcome.failed.map((f) => ({
      deliverable_id: reserved.id,
      student_id: studentIdByEmail.get(f.to)!,
      kind: "deliverable_open",
      channel: "email",
      status: "failed",
      error: f.error,
    })),
  ];
  if (ledgerRows.length > 0) {
    const { error: ledgerErr } = await admin
      .from("deliverable_open_recipients")
      .upsert(ledgerRows, { onConflict: "deliverable_id,kind,channel,student_id" });
    if (ledgerErr) console.error("notifyDeliverableOpen ledger write error", ledgerErr);
  }

  const deliveredTotal = alreadyDelivered.size + outcome.sent.length;

  // Estado real del envío (mismo criterio que session_reminders/0075): no se
  // marca open_notify_completed_at con entregas parciales. 'failed' aquí es
  // reintentable y seguro: el próximo reclamo solo reenvía a quien falta.
  if (outcome.failed.length > 0) {
    await admin
      .from("deliverables")
      .update({ open_notified_count: deliveredTotal })
      .eq("id", reserved.id);
    return { skipped: false, sent: outcome.sent.length };
  }

  await admin
    .from("deliverables")
    .update({
      open_notified_count: deliveredTotal,
      open_notify_completed_at: new Date().toISOString(),
    })
    .eq("id", reserved.id);

  return { skipped: false, sent: outcome.sent.length };
}
