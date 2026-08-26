import { createAdminClient } from "@/lib/supabase/admin";
import { buildCapacitacionFollowupEmail } from "@/lib/email/capacitacion-emails";
import { buildRecordingAvailableEmail } from "@/lib/email/recording-available";
import { sendEmailBatch, type BatchMessage } from "@/lib/email/send-batch";
import { getPublicBaseUrl } from "@/lib/api/base-url";
import { isRealStudent } from "@/lib/profiles/account-type";

// Ciclo de Capacitación Comercial CI: solo sus grabaciones disparan el
// seguimiento post-clase. Ver lib/programs/registry.ts.
const CAP_CI_PROGRAM_ID = "a0000000-0000-0000-0000-000000000004";

// CTA "programa pago" del follow-up. La URL base se resuelve por entorno de
// deploy (getPublicBaseUrl → NEXT_PUBLIC_*), no se hardcodea; apunta a la
// landing del sitio donde están todos los programas. El Diplomado es el
// flagship pago destino. Si a futuro hay un checkout/landing dedicado, cambiar
// el path (ej. `/pago`).
const FOLLOWUP_CTA_URL = getPublicBaseUrl();
const FOLLOWUP_CTA_LABEL = "Conoce nuestros programas";
const FOLLOWUP_PAID_PROGRAM_NAME = "el Diplomado de Capital Academy";

// Ventana de "reserva sin terminar". Mismo criterio que RETRY_STALE_MS en 0063:
// > maxDuration del webhook (300s, una sola corrida) y < período del cron (30 min).
export const RETRY_STALE_MS = 10 * 60 * 1000; // 10 min

/**
 * Seguimiento post-clase del ciclo CAP-CI: cuando la grabación de una sesión
 * en vivo queda publicada (lesson recorded enlazada vía class_sessions.lesson_id),
 * envía el correo "grabación disponible" + CTA a programa pago a los inscritos
 * activos de la cohorte. Idempotente en dos tiempos (0064): la reserva es el
 * INSERT en capacitacion_followup_log (PK session_id); si ya existe (23505) se
 * intenta reclamar una reserva vieja sin completar (`completed_at` null y
 * `sent_at` anterior a RETRY_STALE_MS: señal de crash a mitad del loop) antes
 * de rendirse. `completed_at` se marca SOLO tras terminar el loop de envío.
 * Nunca lanza: los errores se registran y el webhook responde 2xx igual.
 */
export async function dispatchCapacitacionFollowup(
  supabase: ReturnType<typeof createAdminClient>,
  lessonId: string,
): Promise<void> {
  try {
    // ¿Esta lección es la repetición de una sesión, y de qué programa?
    const { data: session } = await supabase
      .from("class_sessions")
      .select("id, code, cohort_id, title, cohorts(program_id, slug)")
      .eq("lesson_id", lessonId)
      .maybeSingle();

    if (!session) return;
    const cohort = (
      session as unknown as {
        cohorts: { program_id: string; slug: string | null } | null;
      }
    ).cohorts;
    if (!cohort || cohort.program_id !== CAP_CI_PROGRAM_ID) return;

    const sessionRow = session as unknown as {
      id: string;
      // Código legible de la clase (0089): es lo que va en el enlace del correo.
      code: string;
      cohort_id: string;
      title: string | null;
    };

    // Idempotencia en dos tiempos (0064): reservar el envío ANTES de mandar
    // correos. Si la fila ya existe (23505), reclama una reserva vieja sin
    // completar (crash a mitad del loop); si no hay ninguna reclamable, otro
    // evento ya envió -> no reenviar.
    const nowIso = new Date().toISOString();
    const staleCutoffIso = new Date(Date.now() - RETRY_STALE_MS).toISOString();

    const { error: reserveErr } = await supabase
      .from("capacitacion_followup_log")
      .insert({ session_id: sessionRow.id, recipients_count: 0, sent_at: nowIso });

    let claimed = !reserveErr;
    if (reserveErr) {
      // 23505 = fila ya existe → puede ser un envío ya terminado o una
      // reserva vieja sin completar (reclamable). Cualquier otro error (red,
      // timeout) SÍ se loguea para dejar traza.
      if (!String(reserveErr.code).includes("23505")) {
        console.error(
          "Mux webhook: reserva del follow-up CAP-CI falló para sesión",
          sessionRow.id,
          reserveErr,
        );
        return;
      }
      const { data: retriedStale } = await supabase
        .from("capacitacion_followup_log")
        .update({ sent_at: nowIso, recipients_count: 0 })
        .eq("session_id", sessionRow.id)
        .is("completed_at", null)
        .lt("sent_at", staleCutoffIso)
        .select("session_id")
        .maybeSingle();
      claimed = Boolean(retriedStale);
    }
    if (!claimed) return;

    // Inscritos activos de la cohorte (mismo patrón que el cron de recordatorios).
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("student_id, profiles(email, full_name, account_type)")
      .eq("cohort_id", sessionRow.cohort_id)
      .eq("status", "active");

    const recipients = (
      (enrollments ?? []) as Array<{
        student_id: string;
        profiles: { email: string; full_name: string | null; account_type: string } | null;
      }>
    )
      // Cuentas del equipo y de QA fuera del correo (ADR-0037): conservan el
      // acceso a la repetición, pero no se les avisa.
      .filter((e) => isRealStudent(e.profiles))
      .filter((e) => Boolean(e.profiles?.email))
      .map((e) => ({
        studentId: e.student_id,
        email: e.profiles!.email,
        fullName: e.profiles!.full_name ?? "",
      }));

    const cohortSlug = cohort.slug ?? sessionRow.cohort_id;
    const recordingUrl = `${getPublicBaseUrl()}/classroom/${cohortSlug}/clase/${sessionRow.code}`;
    const title = sessionRow.title ?? "tu capacitación";

    // IDEMPOTENCIA POR DESTINATARIO (migración 0077): a quién YA le llegó.
    const { data: ledger, error: ledgerReadErr } = await supabase
      .from("recording_notify_recipients")
      .select("student_id")
      .eq("session_id", sessionRow.id)
      .eq("kind", "capacitacion_followup")
      .eq("channel", "email")
      .eq("status", "sent");
    if (ledgerReadErr) {
      console.error(
        "Mux webhook: ledger read del follow-up CAP-CI falló para sesión",
        sessionRow.id,
        ledgerReadErr,
      );
      return;
    }
    const alreadyDelivered = new Set(
      ((ledger ?? []) as Array<{ student_id: string }>).map((r) => r.student_id),
    );
    const missing = recipients.filter((r) => !alreadyDelivered.has(r.studentId));

    const studentIdByEmail = new Map(missing.map((r) => [r.email, r.studentId]));
    const messages: BatchMessage[] = missing.map((r) => ({
      to: r.email,
      ...buildCapacitacionFollowupEmail({
        email: r.email,
        fullName: r.fullName,
        sessionTitle: title,
        recordingUrl,
        programCtaUrl: FOLLOWUP_CTA_URL,
        programCtaLabel: FOLLOWUP_CTA_LABEL,
        programName: FOLLOWUP_PAID_PROGRAM_NAME,
      }),
    }));

    const outcome = await sendEmailBatch(
      messages,
      `rn:${sessionRow.id}:capacitacion_followup`,
    );

    const ledgerRows = [
      ...outcome.sent.map((to) => ({
        session_id: sessionRow.id,
        student_id: studentIdByEmail.get(to)!,
        kind: "capacitacion_followup",
        channel: "email",
        status: "sent",
        error: null as string | null,
      })),
      ...outcome.failed.map((f) => ({
        session_id: sessionRow.id,
        student_id: studentIdByEmail.get(f.to)!,
        kind: "capacitacion_followup",
        channel: "email",
        status: "failed",
        error: f.error,
      })),
    ];
    if (ledgerRows.length > 0) {
      const { error: ledgerErr } = await supabase
        .from("recording_notify_recipients")
        .upsert(ledgerRows, { onConflict: "session_id,kind,channel,student_id" });
      if (ledgerErr) {
        console.error(
          "Mux webhook: ledger write del follow-up CAP-CI falló para sesión",
          sessionRow.id,
          ledgerErr,
        );
      }
    }

    const deliveredTotal = alreadyDelivered.size + outcome.sent.length;

    // No se marca completed_at con entregas parciales: 'failed' es
    // reintentable y el próximo reclamo solo reenvía a quien falta.
    if (outcome.failed.length > 0) {
      await supabase
        .from("capacitacion_followup_log")
        .update({ recipients_count: deliveredTotal })
        .eq("session_id", sessionRow.id);
      return;
    }

    await supabase
      .from("capacitacion_followup_log")
      .update({ recipients_count: deliveredTotal, completed_at: new Date().toISOString() })
      .eq("session_id", sessionRow.id);
  } catch (err) {
    console.error(
      "Mux webhook: capacitación follow-up failed for lesson",
      lessonId,
      err,
    );
  }
}

/**
 * Notificación "grabación disponible" para el resto de los programas (todo
 * menos CAP-CI, que ya tiene su propio seguimiento en
 * dispatchCapacitacionFollowup arriba, con su copy y CTA a programa pago).
 * Se dispara cuando la lección notificada es la repetición de una sesión en
 * vivo (class_sessions.lesson_id) y avisa a los inscritos activos de la
 * cohorte. Idempotente en dos tiempos (0064): `recording_notified_at` marca la
 * RESERVA (envío en curso) y `recording_notify_completed_at` marca que el loop
 * de envío TERMINÓ. El reclamo es un update condicional atómico: primero se
 * intenta reclamar una lección nunca reservada; si no hay fila, se intenta
 * reclamar una reserva vieja sin terminar (`recording_notify_completed_at`
 * null y `recording_notified_at` anterior a RETRY_STALE_MS: señal de crash a
 * mitad del loop). Nunca lanza: los errores se registran y el webhook responde
 * 2xx igual.
 */
export async function dispatchRecordingAvailableNotification(
  supabase: ReturnType<typeof createAdminClient>,
  lessonId: string,
): Promise<void> {
  try {
    // ¿Esta lección es la repetición de una sesión, y de qué programa/cohorte?
    const { data: session } = await supabase
      .from("class_sessions")
      .select(
        "id, code, cohort_id, title, cohorts(program_id, slug, name, programs(name))",
      )
      .eq("lesson_id", lessonId)
      .maybeSingle();

    if (!session) return;
    const cohort = (
      session as unknown as {
        cohorts: {
          program_id: string;
          slug: string | null;
          name: string;
          programs: { name: string } | null;
        } | null;
      }
    ).cohorts;
    // CAP-CI usa su propio follow-up; el resto de los programas usa esta
    // notificación genérica. Mutuamente excluyentes -> sin doble envío.
    if (!cohort || cohort.program_id === CAP_CI_PROGRAM_ID) return;

    const sessionRow = session as unknown as {
      id: string;
      // Código legible de la clase (0089): es lo que va en el enlace del correo.
      code: string;
      cohort_id: string;
      title: string | null;
    };

    // Idempotencia en dos tiempos (0064): reservar el envío marcando la
    // lección ANTES de mandar correos. Se intenta primero reclamar una
    // lección nunca reservada; si no hay fila, se intenta reclamar una
    // reserva vieja sin terminar (crash a mitad del loop).
    const nowIso = new Date().toISOString();
    const staleCutoffIso = new Date(Date.now() - RETRY_STALE_MS).toISOString();

    const { data: reservedNew, error: reserveErr } = await supabase
      .from("lessons")
      .update({ recording_notified_at: nowIso, recording_notify_completed_at: null })
      .eq("id", lessonId)
      .is("recording_notified_at", null)
      .select("id");

    if (reserveErr) {
      console.error(
        "Mux webhook: reserva de notificación de grabación falló para lección",
        lessonId,
        reserveErr,
      );
      return;
    }

    let reserved: { id: string }[] | null = reservedNew;
    if (!reserved || reserved.length === 0) {
      const { data: retriedStale } = await supabase
        .from("lessons")
        .update({ recording_notified_at: nowIso, recording_notify_completed_at: null })
        .eq("id", lessonId)
        .is("recording_notify_completed_at", null)
        .lt("recording_notified_at", staleCutoffIso)
        .select("id");
      reserved = retriedStale;
    }
    if (!reserved || reserved.length === 0) return; // ya notificada, en curso, o reserva reciente

    // Inscritos activos de la cohorte (mismo patrón que el follow-up CAP-CI).
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("student_id, profiles(email, full_name, account_type)")
      .eq("cohort_id", sessionRow.cohort_id)
      .eq("status", "active");

    const recipients = (
      (enrollments ?? []) as Array<{
        student_id: string;
        profiles: { email: string; full_name: string | null; account_type: string } | null;
      }>
    )
      // Cuentas del equipo y de QA fuera del correo (ADR-0037): conservan el
      // acceso a la repetición, pero no se les avisa.
      .filter((e) => isRealStudent(e.profiles))
      .filter((e) => Boolean(e.profiles?.email))
      .map((e) => ({
        studentId: e.student_id,
        email: e.profiles!.email,
        fullName: e.profiles!.full_name ?? "",
      }));

    const cohortSlug = cohort.slug ?? sessionRow.cohort_id;
    const recordingUrl = `${getPublicBaseUrl()}/classroom/${cohortSlug}/clase/${sessionRow.code}`;
    const lessonTitle = sessionRow.title ?? "tu clase";
    const programName = cohort.programs?.name ?? "Capital Academy";

    // IDEMPOTENCIA POR DESTINATARIO (migración 0077): a quién YA le llegó.
    const { data: ledger, error: ledgerReadErr } = await supabase
      .from("recording_notify_recipients")
      .select("student_id")
      .eq("session_id", sessionRow.id)
      .eq("kind", "recording_available")
      .eq("channel", "email")
      .eq("status", "sent");
    if (ledgerReadErr) {
      console.error(
        "Mux webhook: ledger read de notificación de grabación falló",
        lessonId,
        ledgerReadErr,
      );
      return;
    }
    const alreadyDelivered = new Set(
      ((ledger ?? []) as Array<{ student_id: string }>).map((r) => r.student_id),
    );
    const missing = recipients.filter((r) => !alreadyDelivered.has(r.studentId));

    const studentIdByEmail = new Map(missing.map((r) => [r.email, r.studentId]));
    const messages: BatchMessage[] = missing.map((r) => ({
      to: r.email,
      ...buildRecordingAvailableEmail({
        to: r.email,
        studentName: r.fullName,
        lessonTitle,
        programName,
        cohortName: cohort.name,
        url: recordingUrl,
      }),
    }));

    const outcome = await sendEmailBatch(
      messages,
      `rn:${sessionRow.id}:recording_available`,
    );

    const ledgerRows = [
      ...outcome.sent.map((to) => ({
        session_id: sessionRow.id,
        student_id: studentIdByEmail.get(to)!,
        kind: "recording_available",
        channel: "email",
        status: "sent",
        error: null as string | null,
      })),
      ...outcome.failed.map((f) => ({
        session_id: sessionRow.id,
        student_id: studentIdByEmail.get(f.to)!,
        kind: "recording_available",
        channel: "email",
        status: "failed",
        error: f.error,
      })),
    ];
    if (ledgerRows.length > 0) {
      const { error: ledgerErr } = await supabase
        .from("recording_notify_recipients")
        .upsert(ledgerRows, { onConflict: "session_id,kind,channel,student_id" });
      if (ledgerErr) {
        console.error(
          "Mux webhook: ledger write de notificación de grabación falló",
          lessonId,
          ledgerErr,
        );
      }
    }

    // No se marca recording_notify_completed_at con entregas parciales: la
    // próxima corrida reclama la reserva y reintenta solo a quien falta.
    if (outcome.failed.length > 0) return;

    // Marca el envío como TERMINADO (0064): a partir de aquí ninguna corrida
    // futura vuelve a reclamar esta fila, ni por "nunca reservada" ni por
    // "reserva vieja sin terminar".
    await supabase
      .from("lessons")
      .update({ recording_notify_completed_at: new Date().toISOString() })
      .eq("id", lessonId);
  } catch (err) {
    console.error(
      "Mux webhook: recording-available notification failed for lesson",
      lessonId,
      err,
    );
  }
}
