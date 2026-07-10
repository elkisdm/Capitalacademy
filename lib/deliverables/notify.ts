import { createAdminClient } from "@/lib/supabase/admin";
import { sendDeliverableOpenEmail } from "@/lib/email/deliverable-open";

type NotifyResult = { skipped: true } | { skipped: false; sent: number };

// `deliverables`/`deliverable_submissions` aún no están en el Database
// generado (migración 0053 no aplicada a prod). Provisional: `as never` +
// tipos locales, siguiendo el patrón de payments antes de su regeneración
// (ver commit "chore(types): regenerate Supabase types and remove
// provisional casts"). Quitar los casts cuando se regeneren los tipos.
type ReservedDeliverable = {
  id: string;
  title: string;
  due_at: string;
  program_id: string;
};

/**
 * Envía el correo de apertura de un entregable a los alumnos con matrícula
 * activa en su programa.
 *
 * Idempotente: reserva `open_notified_at` con un update condicional ANTES de
 * enviar (mismo criterio que session_reminders/0051). Si el update no
 * devuelve fila, ya fue notificado (o aún no abre la ventana) y se aborta sin
 * reenviar. Se llama tanto al crear un entregable con ventana ya abierta como
 * desde el cron para aperturas futuras.
 */
export async function notifyDeliverableOpen(deliverableId: string): Promise<NotifyResult> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: reserved, error: reserveError } = await admin
    .from("deliverables" as never)
    .update({ open_notified_at: now } as never)
    .eq("id", deliverableId)
    .is("open_notified_at", null)
    .lte("opens_at", now)
    .select("id, title, due_at, program_id")
    .maybeSingle<ReservedDeliverable>();

  if (reserveError) {
    console.error("notifyDeliverableOpen reserve error", reserveError);
    return { skipped: true };
  }
  if (!reserved) return { skipped: true };

  const { data: program } = await admin
    .from("programs")
    .select("name")
    .eq("id", reserved.program_id)
    .single();

  const { data: enrollments } = await admin
    .from("enrollments")
    .select("profiles(email, full_name), cohorts!inner(program_id)")
    .eq("cohorts.program_id", reserved.program_id)
    .eq("status", "active");

  const recipients = new Map<string, string>();
  for (const e of (enrollments ?? []) as Array<{
    profiles: { email: string; full_name: string | null } | null;
  }>) {
    const p = e.profiles;
    if (p?.email && !recipients.has(p.email)) {
      recipients.set(p.email, p.full_name ?? "");
    }
  }

  let sent = 0;
  for (const [email, fullName] of recipients) {
    const res = await sendDeliverableOpenEmail({
      email,
      fullName,
      deliverableTitle: reserved.title,
      dueAtIso: reserved.due_at,
      programName: program?.name,
    });
    if (res.success) sent++;
  }

  return { skipped: false, sent };
}
