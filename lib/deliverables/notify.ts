import { createAdminClient } from "@/lib/supabase/admin";
import { sendDeliverableOpenEmail } from "@/lib/email/deliverable-open";

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

  // Marca el envío como TERMINADO (0063): a partir de aquí ninguna corrida
  // futura vuelve a reclamar esta fila, ni por "nunca reservada" ni por
  // "reserva vieja sin terminar". `open_notified_count` (0060) queda como
  // bitácora del conteo real de envíos exitosos.
  await admin
    .from("deliverables")
    .update({ open_notified_count: sent, open_notify_completed_at: new Date().toISOString() })
    .eq("id", deliverableId);

  return { skipped: false, sent };
}
