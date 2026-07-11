import { createAdminClient } from "@/lib/supabase/admin";
import { sendCapacitacionFollowupEmail } from "@/lib/email/capacitacion-emails";
import { sendRecordingAvailableEmail } from "@/lib/email/recording-available";
import { getPublicBaseUrl } from "@/lib/api/base-url";

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
      .select("id, cohort_id, title, cohorts(program_id, slug)")
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
      .select("profiles(email, full_name)")
      .eq("cohort_id", sessionRow.cohort_id)
      .eq("status", "active");

    const recipients = (
      (enrollments ?? []) as Array<{
        profiles: { email: string; full_name: string | null } | null;
      }>
    )
      .map((e) => e.profiles)
      .filter(
        (p): p is { email: string; full_name: string | null } =>
          Boolean(p?.email),
      );

    const cohortSlug = cohort.slug ?? sessionRow.cohort_id;
    const recordingUrl = `${getPublicBaseUrl()}/classroom/${cohortSlug}/clase/${sessionRow.id}`;
    const title = sessionRow.title ?? "tu capacitación";

    let sent = 0;
    for (const r of recipients) {
      const res = await sendCapacitacionFollowupEmail({
        email: r.email,
        fullName: r.full_name ?? "",
        sessionTitle: title,
        recordingUrl,
        programCtaUrl: FOLLOWUP_CTA_URL,
        programCtaLabel: FOLLOWUP_CTA_LABEL,
        programName: FOLLOWUP_PAID_PROGRAM_NAME,
      });
      if (res.success) sent++;
    }

    await supabase
      .from("capacitacion_followup_log")
      .update({ recipients_count: sent, completed_at: new Date().toISOString() })
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
        "id, cohort_id, title, cohorts(program_id, slug, name, programs(name))",
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
      .select("profiles(email, full_name)")
      .eq("cohort_id", sessionRow.cohort_id)
      .eq("status", "active");

    const recipients = (
      (enrollments ?? []) as Array<{
        profiles: { email: string; full_name: string | null } | null;
      }>
    )
      .map((e) => e.profiles)
      .filter(
        (p): p is { email: string; full_name: string | null } =>
          Boolean(p?.email),
      );

    const cohortSlug = cohort.slug ?? sessionRow.cohort_id;
    const recordingUrl = `${getPublicBaseUrl()}/classroom/${cohortSlug}/clase/${sessionRow.id}`;
    const lessonTitle = sessionRow.title ?? "tu clase";
    const programName = cohort.programs?.name ?? "Capital Academy";

    for (const r of recipients) {
      const res = await sendRecordingAvailableEmail({
        to: r.email,
        studentName: r.full_name ?? "",
        lessonTitle,
        programName,
        cohortName: cohort.name,
        url: recordingUrl,
      });
      if (!res.ok) {
        console.error(
          "Mux webhook: envío de notificación de grabación falló",
          lessonId,
          r.email,
          res.error,
        );
      }
    }

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
