import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSessionReminderEmail } from "@/lib/email/session-reminder";
import { buildCapacitacionReminderEmail } from "@/lib/email/capacitacion-emails";
import {
  sendEmailBatch,
  type BatchMessage,
  type ReminderKind,
} from "@/lib/email/send-batch";
import { sendAttendanceWarningEmail } from "@/lib/email/attendance-warning";
import { getPublicBaseUrl } from "@/lib/api/base-url";
import { getStudentsAtAbsenceThreshold } from "@/lib/asistencia/queries";
import { authorizeCron } from "@/lib/api/cron-auth";
import { joinHrefFor } from "@/lib/classroom/enlace-clase";

export const runtime = "nodejs";
export const maxDuration = 60;
// Evita que Next intente cachear/estatizar la ruta del cron.
export const dynamic = "force-dynamic";

const CHANNEL = "email" as const;

// Ciclo de Capacitación Comercial CI (entorno de captación). Sus sesiones son
// class_sessions normales, así que caen en este mismo cron; el único cambio es
// enrutar el recordatorio a la voz de captación (sendCapacitacionReminderEmail)
// en vez del genérico. Ningún otro programa cambia. Ver lib/programs/registry.ts.
const CAP_CI_PROGRAM_ID = "a0000000-0000-0000-0000-000000000004";

// Ventanas de antelación. El cron debe correr al menos cada 30 min para que
// ninguna sesión se escape de su ventana. La tolerancia (slack) cubre el jitter
// del scheduler: una sesión entra en la ventana '24h' si starts_at cae entre
// (ahora + 24h) y (ahora + 24h + slack); análogo para '72h' y '1h'.
const REMINDER_WINDOWS: Array<{ kind: ReminderKind; leadMs: number }> = [
  { kind: "72h", leadMs: 72 * 60 * 60 * 1000 },
  { kind: "24h", leadMs: 24 * 60 * 60 * 1000 },
  { kind: "1h", leadMs: 60 * 60 * 1000 },
];
// Ancho de cada ventana. Debe ser >= al período del cron para no perder envíos.
const WINDOW_SLACK_MS = 35 * 60 * 1000; // 35 min
// Techo del catch-up: cuánto downtime real del cron se cubre hacia atrás.
// Acotado (no "desde ahora") para que una sesión creada con <24h de antelación
// no reciba el recordatorio '24h' (con copy hard-coded "mañana") cuando en
// realidad es en horas.
const CATCHUP_MS = 3 * 60 * 60 * 1000; // 3 horas

// Alerta de inasistencia: se avisa al alumno al llegar a 2 clases en vivo sin
// registro (por debajo del máximo tolerado de 3) y OTRA VEZ cada vez que ese
// conteo sube. Ver ADR-0037, que reemplaza el "una sola vez" del ADR-0013.
//
// La fila de `attendance_alerts` funciona como MARCA DE AGUA: guarda el conteo
// del último aviso enviado y solo se vuelve a escribir cuando el conteo real lo
// supera. De ahí sale gratis el anti-ráfaga: un alumno que salta de 2 a 16
// inasistencias (típico tras cargar asistencia por Excel) recibe UN correo que
// dice 16, no catorce correos de los niveles intermedios.
//
// El sufijo `_2` del kind es el umbral de ENTRADA, no un nivel: se mantiene
// como identificador estable de la bitácora, no como "aviso número 2".
const ABSENCE_ALERT_KIND = "absence_2";
const ABSENCE_ALERT_THRESHOLD = 2;
const MAX_ABSENCES_TOLERATED = 3;

// Ventana de "reserva sin terminar" (status='pending' que nunca llegó a un
// estado terminal): señal de que el proceso murió a mitad de camino entre la
// reserva y el envío/update final. Mayor al maxDuration del handler (60s,
// límite duro de una sola corrida) y menor al período del cron (>=30 min),
// para reintentar recuperando el correo perdido sin pisar una corrida activa.
// Ver migración 0063 (agrega el estado 'pending' a session_reminders y
// attendance_alerts).
const RETRY_STALE_MS = 10 * 60 * 1000; // 10 min

type SessionRow = {
  id: string;
  cohort_id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  modality: string;
  meeting_url: string | null;
  status: string;
  teacher_id: string | null;
  code: string | null;
  audience: string;
};

async function processWindow(
  admin: ReturnType<typeof createAdminClient>,
  kind: ReminderKind,
  leadMs: number,
  now: number,
): Promise<{ kind: string; sessions: number; emails: number; errors: string[] }> {
  const errors: string[] = [];
  const to = new Date(now + leadMs + WINDOW_SLACK_MS).toISOString();
  // Catch-up: si el cron se saltó una o más corridas (>35 min de downtime),
  // la ventana estricta [now+lead, now+lead+slack) puede quedar atrás del
  // starts_at de una sesión sin haberla recordado nunca. Barremos desde
  // (now+lead-CATCHUP_MS), no desde "ahora", hasta el mismo límite superior;
  // así se cubre downtime realista sin ensanchar la ventana '24h' a "en algún
  // momento hoy" para sesiones creadas con poca antelación. La sesión solo se
  // procesa si de verdad le falta el recordatorio (ver `alreadySent` más
  // abajo, que excluye 'failed' y 'pending' viejo para permitir reintento).
  const catchupFrom = new Date(now + leadMs - CATCHUP_MS).toISOString();

  const { data: sessionsData, error: sessErr } = await admin
    .from("class_sessions")
    .select(
      "id, cohort_id, title, starts_at, ends_at, modality, meeting_url, code, status, teacher_id, audience",
    )
    .eq("status", "scheduled")
    // Las grabadas no son eventos en vivo: no se recuerdan.
    .neq("modality", "recorded")
    .gte("starts_at", catchupFrom)
    .lt("starts_at", to);

  if (sessErr) {
    errors.push(`query sessions (${kind}): ${sessErr.message}`);
    return { kind, sessions: 0, emails: 0, errors };
  }

  const sessions = (sessionsData ?? []) as unknown as SessionRow[];
  if (sessions.length === 0) return { kind, sessions: 0, emails: 0, errors };

  // Idempotencia: descartar sesiones que YA tienen recordatorio RESUELTO de
  // esta ventana ('sent'/'skipped') o RESERVADO hace poco ('pending' fresco:
  // probablemente una corrida concurrente todavía en curso). 'failed' y
  // 'pending' viejo (>RETRY_STALE_MS, reserva que nunca terminó — señal de
  // crash a mitad de camino) SÍ se reintentan: el unique de 0026 + el
  // reclamo atómico condicional más abajo siguen protegiendo contra
  // duplicados.
  const sessionIds = sessions.map((s) => s.id);
  const staleCutoffIso = new Date(now - RETRY_STALE_MS).toISOString();
  const { data: existing } = await admin
    .from("session_reminders")
    .select("session_id, status, sent_at")
    .eq("kind", kind)
    .eq("channel", CHANNEL)
    .in("session_id", sessionIds);
  const alreadySent = new Set(
    (
      (existing ?? []) as Array<{ session_id: string; status: string; sent_at: string }>
    )
      .filter(
        (r) =>
          r.status === "sent" ||
          r.status === "skipped" ||
          (r.status === "pending" && r.sent_at >= staleCutoffIso),
      )
      .map((r) => r.session_id),
  );
  const pending = sessions.filter((s) => !alreadySent.has(s.id));
  if (pending.length === 0) return { kind, sessions: 0, emails: 0, errors };

  // Programa de cada cohorte (una sola consulta) para enrutar la voz del correo:
  // las sesiones del ciclo CAP-CI usan la plantilla de captación; el resto queda
  // exactamente igual con el recordatorio genérico.
  const cohortIds = [...new Set(pending.map((s) => s.cohort_id))];
  const programByCohort = new Map<string, string>();
  if (cohortIds.length > 0) {
    const { data: cohorts } = await admin
      .from("cohorts")
      .select("id, program_id")
      .in("id", cohortIds);
    for (const c of (cohorts ?? []) as Array<{ id: string; program_id: string }>) {
      programByCohort.set(c.id, c.program_id);
    }
  }

  // Docentes (una sola consulta).
  const teacherIds = [
    ...new Set(
      pending.map((s) => s.teacher_id).filter((id): id is string => Boolean(id)),
    ),
  ];
  const teacherMap = new Map<string, string>();
  if (teacherIds.length > 0) {
    const { data: instructors } = await admin
      .from("instructors")
      .select("id, full_name")
      .in("id", teacherIds);
    for (const i of (instructors ?? []) as Array<{ id: string; full_name: string }>) {
      teacherMap.set(i.id, i.full_name);
    }
  }

  let totalEmails = 0;
  let sessionsProcessed = 0;

  for (const session of pending) {
    // RESERVA del slot ANTES de enviar: el unique (session_id, kind, channel)
    // bloquea cualquier ejecución concurrente del cron. Se reserva en
    // status='pending' (no terminal) para que, si el proceso muere antes del
    // update final más abajo, la próxima corrida pueda detectarlo y
    // reintentar en vez de darlo por enviado.
    const nowIso = new Date(now).toISOString();
    const { error: reserveErr } = await admin.from("session_reminders").insert({
      session_id: session.id,
      kind,
      channel: CHANNEL,
      status: "pending",
      recipients_count: 0,
      sent_at: nowIso,
    });
    if (reserveErr) {
      if (String(reserveErr.code).includes("23505")) {
        // 23505 = unique_violation: ya existe una fila para este slot. Puede
        // ser una corrida concurrente (status 'sent'/'skipped'/'pending'
        // fresco, dejar en paz) o un intento previo sin terminar: 'failed'
        // (reintentable de inmediato) o 'pending' viejo (>RETRY_STALE_MS,
        // crash a mitad de camino). El reclamo es un update condicional
        // atómico: Postgres re-evalúa el WHERE contra el valor ya
        // comprometido, así que si otra corrida ya reclamó la fila (cambió
        // status/sent_at) este update no matchea ninguna fila y `retried`
        // queda vacío — no hay forma de que dos corridas ganen la misma fila.
        const { data: retriedFailed } = await admin
          .from("session_reminders")
          .update({ status: "pending", recipients_count: 0, error: null, sent_at: nowIso })
          .eq("session_id", session.id)
          .eq("kind", kind)
          .eq("channel", CHANNEL)
          .eq("status", "failed")
          .select("session_id")
          .maybeSingle();
        let retried = retriedFailed;
        if (!retried) {
          const { data: retriedStale } = await admin
            .from("session_reminders")
            .update({ status: "pending", recipients_count: 0, error: null, sent_at: nowIso })
            .eq("session_id", session.id)
            .eq("kind", kind)
            .eq("channel", CHANNEL)
            .eq("status", "pending")
            .lt("sent_at", staleCutoffIso)
            .select("session_id")
            .maybeSingle();
          retried = retriedStale;
        }
        if (!retried) continue; // no era reintentable: otra corrida ya tiene el slot.
      } else {
        errors.push(`reserve ${session.id} (${kind}): ${reserveErr.message}`);
        continue;
      }
    }

    // Alumnos con matrícula activa del cohorte. Si la sesión es exclusiva de
    // Capital Inteligente (audience='capital_inteligente'), solo se recuerda a
    // los alumnos marcados con ese segmento — el cron usa service_role y bypassa
    // la RLS de audiencia (0024), así que el filtro debe ser explícito aquí.
    let enrollQuery = admin
      .from("enrollments")
      .select("student_id, profiles(email, full_name)")
      .eq("cohort_id", session.cohort_id)
      .eq("status", "active")
      .order("student_id", { ascending: true });
    if (session.audience === "capital_inteligente") {
      enrollQuery = enrollQuery.eq("segment", "capital_inteligente");
    }
    const { data: enrollments, error: enrollErr } = await enrollQuery;
    if (enrollErr) {
      errors.push(`enrollments ${session.id} (${kind}): ${enrollErr.message}`);
      continue;
    }

    // Se conserva student_id: es la clave de la bitácora por destinatario.
    const recipients = (
      (enrollments ?? []) as Array<{
        student_id: string;
        profiles: { email: string; full_name: string | null } | null;
      }>
    )
      .filter((e) => Boolean(e.profiles?.email))
      .map((e) => ({
        studentId: e.student_id,
        email: e.profiles!.email,
        fullName: e.profiles!.full_name,
      }));

    const title = session.title ?? "Tu próxima clase";
    const teacherName = session.teacher_id
      ? (teacherMap.get(session.teacher_id) ?? null)
      : null;
    const isCapacitacion =
      programByCohort.get(session.cohort_id) === CAP_CI_PROGRAM_ID;

    // IDEMPOTENCIA POR DESTINATARIO (migración 0075): a quién YA le llegó.
    // Sin esto, un reclamo de fila 'pending'/'failed' reenviaba desde el
    // destinatario 1 (auditoría C4).
    const { data: ledger, error: ledgerReadErr } = await admin
      .from("session_reminder_recipients")
      .select("student_id")
      .eq("session_id", session.id)
      .eq("kind", kind)
      .eq("channel", CHANNEL)
      .eq("status", "sent");
    if (ledgerReadErr) {
      errors.push(`ledger read ${session.id} (${kind}): ${ledgerReadErr.message}`);
      continue; // la fila queda 'pending' → se reclama como stale a los 10 min
    }
    const alreadyDelivered = new Set(
      ((ledger ?? []) as Array<{ student_id: string }>).map((r) => r.student_id),
    );
    const missing = recipients.filter((r) => !alreadyDelivered.has(r.studentId));

    const studentIdByEmail = new Map(missing.map((r) => [r.email, r.studentId]));

    // A dónde entra el alumno. La regla vive en `joinHrefFor`, compartida con el
    // calendario y la pantalla de clase: el enlace externo manda cuando existe,
    // la sala propia es el camino por defecto. Acá se absolutiza la ruta porque
    // va dentro de un correo.
    const destino = joinHrefFor(session);
    const enlaceParaEntrar =
      destino && destino.startsWith("/") ? `${getPublicBaseUrl()}${destino}` : destino;
    const messages: BatchMessage[] = missing.map((r) => {
      const content = isCapacitacion
        ? buildCapacitacionReminderEmail({
            email: r.email,
            fullName: r.fullName ?? "",
            sessionTitle: title,
            startsAtIso: session.starts_at,
            endsAtIso: session.ends_at,
            modality: session.modality,
            meetingUrl: enlaceParaEntrar,
            kind,
          })
        : buildSessionReminderEmail({
            email: r.email,
            fullName: r.fullName ?? "",
            sessionTitle: title,
            startsAtIso: session.starts_at,
            endsAtIso: session.ends_at,
            modality: session.modality,
            meetingUrl: enlaceParaEntrar,
            teacherName,
            kind,
          });
      return { to: r.email, ...content };
    });

    // Fan-out por lotes de 100: 239 destinatarios = 3 llamadas a Resend
    // (~2-4s) en vez de 239 requests secuenciales que cruzan el rate limit de
    // 10 req/s y el techo de la función.
    const outcome = await sendEmailBatch(messages, `sr:${session.id}:${kind}`);

    // Bitácora por destinatario. Un 'failed' aquí se reintenta en la próxima
    // corrida (solo a él); un 'sent' no se vuelve a tocar nunca.
    const ledgerRows = [
      ...outcome.sent.map((to) => ({
        session_id: session.id,
        student_id: studentIdByEmail.get(to)!,
        kind,
        channel: CHANNEL,
        status: "sent",
        error: null as string | null,
      })),
      ...outcome.failed.map((f) => ({
        session_id: session.id,
        student_id: studentIdByEmail.get(f.to)!,
        kind,
        channel: CHANNEL,
        status: "failed",
        error: f.error,
      })),
    ];
    if (ledgerRows.length > 0) {
      const { error: ledgerErr } = await admin
        .from("session_reminder_recipients")
        .upsert(ledgerRows, { onConflict: "session_id,kind,channel,student_id" });
      if (ledgerErr) errors.push(`ledger ${session.id} (${kind}): ${ledgerErr.message}`);
    }

    const deliveredTotal = alreadyDelivered.size + outcome.sent.length;
    totalEmails += outcome.sent.length;
    sessionsProcessed++;

    // Estado real del envío. NO se marca 'sent' con entregas parciales (bug C4:
    // 4 de 5 corridas históricas quedaron 'sent' con 429 y correos perdidos sin
    // reintento). 'failed' es reintentable y ahora es seguro: la bitácora hace
    // que el reintento toque solo a quien falta.
    await admin
      .from("session_reminders")
      .update({
        recipients_count: deliveredTotal,
        status:
          recipients.length === 0
            ? "skipped"
            : outcome.failed.length === 0
              ? "sent"
              : "failed",
        error:
          outcome.failed.length > 0
            ? `${outcome.failed.length}/${missing.length} fallaron: ${outcome.failed[0].error}`
            : null,
      })
      .eq("session_id", session.id)
      .eq("kind", kind)
      .eq("channel", CHANNEL);

    // WhatsApp (stub, Fase futura): aquí se dispararía el envío por
    // WhatsApp Cloud API reutilizando scripts/send-diplomado-whatsapp.mjs,
    // registrando channel='whatsapp' en session_reminders.
  }

  return { kind, sessions: sessionsProcessed, emails: totalEmails, errors };
}

/**
 * Update condicional base para reclamar una fila de `attendance_alerts`.
 *
 * Deja la fila en 'pending' con el conteo de AHORA; quien llama agrega la
 * condición que define el caso (falló / reserva colgada / conteo superado).
 * Se extrae para que los tres reclamos no puedan divergir en lo que escriben.
 */
function buildAlertClaim(
  admin: ReturnType<typeof createAdminClient>,
  row: { studentId: string; cohortId: string; absences: number },
  nowIso: string,
) {
  return admin
    .from("attendance_alerts")
    .update({ status: "pending", absences_count: row.absences, error: null, sent_at: nowIso })
    .eq("student_id", row.studentId)
    .eq("cohort_id", row.cohortId)
    .eq("kind", ABSENCE_ALERT_KIND);
}

/**
 * Detecta alumnos con `ABSENCE_ALERT_THRESHOLD` o más inasistencias a clases
 * en vivo y les envía el correo de advertencia, reservando la fila en
 * `attendance_alerts` ANTES de enviar (mismo patrón reserva-antes-de-enviar de
 * `processWindow`, contra `session_reminders`).
 *
 * Reenvía cuando el conteo SUPERA el del último aviso (ADR-0037). Cada corrida
 * manda como máximo un correo por alumno, con el número real del momento.
 *
 * Las cuentas del equipo y de QA ya vienen filtradas desde
 * `getStudentsAtAbsenceThreshold` (ADR-0037): la cuenta `Administrador` y las
 * cuentas personales del equipo figuraban con inasistencias.
 */
async function processAbsenceAlerts(
  admin: ReturnType<typeof createAdminClient>,
  now: number,
): Promise<{ evaluated: number; sent: number; errors: string[] }> {
  const errors: string[] = [];
  const rows = await getStudentsAtAbsenceThreshold(ABSENCE_ALERT_THRESHOLD);
  if (rows.length === 0) return { evaluated: 0, sent: 0, errors };

  // Marca de agua por (alumno, cohorte): a qué conteo se avisó por última vez.
  // Se reenvía SOLO si el conteo actual la supera. 'failed' y 'pending' viejo
  // (>RETRY_STALE_MS: reserva que nunca terminó) se reintentan aunque el conteo
  // no haya cambiado, porque ese correo nunca llegó a salir.
  const staleCutoffIso = new Date(now - RETRY_STALE_MS).toISOString();
  const { data: existing } = await admin
    .from("attendance_alerts")
    .select("student_id, cohort_id, status, sent_at, absences_count")
    .eq("kind", ABSENCE_ALERT_KIND)
    .in(
      "student_id",
      rows.map((r) => r.studentId),
    );
  const previous = new Map(
    (
      (existing ?? []) as Array<{
        student_id: string;
        cohort_id: string;
        status: string;
        sent_at: string;
        absences_count: number;
      }>
    ).map((r) => [`${r.student_id}:${r.cohort_id}`, r]),
  );

  const pending = rows.filter((row) => {
    const prev = previous.get(`${row.studentId}:${row.cohortId}`);
    if (!prev) return true; // nunca se le avisó
    // Reserva de otra corrida todavía viva: no tocar.
    if (prev.status === "pending" && prev.sent_at >= staleCutoffIso) return false;
    // Envío fallido o reserva colgada: reintentar aunque el conteo no suba.
    if (prev.status === "failed") return true;
    if (prev.status === "pending") return true;
    // Ya avisado: solo si acumuló una inasistencia nueva desde entonces.
    return row.absences > prev.absences_count;
  });

  let sent = 0;
  for (const row of pending) {
    // RESERVA de la fila ANTES de enviar: el unique (student_id, cohort_id,
    // kind) bloquea cualquier corrida concurrente del cron. status='pending'
    // (no terminal) para que un crash entre la reserva y el envío quede
    // marcado como reintentable en vez de darse por enviado.
    const nowIso = new Date(now).toISOString();
    const { error: reserveErr } = await admin.from("attendance_alerts").insert({
      student_id: row.studentId,
      cohort_id: row.cohortId,
      kind: ABSENCE_ALERT_KIND,
      absences_count: row.absences,
      status: "pending",
      sent_at: nowIso,
    });
    if (reserveErr) {
      if (String(reserveErr.code).includes("23505")) {
        // 23505 = unique_violation: ya existe una fila para este slot. Puede
        // ser una corrida concurrente (dejar en paz) o un caso reclamable:
        // 'failed', 'pending' viejo (>RETRY_STALE_MS, crash a mitad de camino)
        // o 'sent' con una marca de agua MENOR que el conteo de ahora.
        //
        // Cada reclamo es un update condicional atómico y todos mueven la fila
        // a 'pending': solo una corrida puede ganarla, porque la que llega
        // segunda ya no encuentra el status que su WHERE exige. Es lo que
        // impide repetir el incidente de correos duplicados del 21-jul.
        const claim = async (
          apply: (
            q: ReturnType<typeof buildAlertClaim>,
          ) => ReturnType<typeof buildAlertClaim>,
        ) => {
          const { data } = await apply(buildAlertClaim(admin, row, nowIso))
            .select("student_id")
            .maybeSingle();
          return data;
        };

        // 1) Envío que falló: se reintenta aunque el conteo no haya subido.
        let retried = await claim((q) => q.eq("status", "failed"));
        // 2) Reserva colgada de una corrida que murió antes de enviar.
        if (!retried) {
          retried = await claim((q) => q.eq("status", "pending").lt("sent_at", staleCutoffIso));
        }
        // 3) Ya avisado, pero acumuló inasistencias nuevas desde ese aviso.
        //    El `lt` sobre absences_count es lo que hace recurrente la alerta
        //    sin permitir dos correos por el mismo conteo.
        if (!retried) {
          retried = await claim((q) =>
            q.eq("status", "sent").lt("absences_count", row.absences),
          );
        }
        if (!retried) continue; // no era reclamable: otra corrida ya tiene el slot.
      } else {
        errors.push(`reserve absence ${row.studentId}/${row.cohortId}: ${reserveErr.message}`);
        continue;
      }
    }

    const res = await sendAttendanceWarningEmail({
      email: row.email,
      fullName: row.fullName ?? "",
      programId: row.programId,
      cohortName: row.cohortName,
      absencesCount: row.absences,
      maxAbsences: MAX_ABSENCES_TOLERATED,
    });

    if (res.success) {
      sent++;
      await admin
        .from("attendance_alerts")
        .update({ status: "sent", error: null })
        .eq("student_id", row.studentId)
        .eq("cohort_id", row.cohortId)
        .eq("kind", ABSENCE_ALERT_KIND);
    } else {
      errors.push(`send absence ${row.studentId}/${row.cohortId}: ${res.error ?? "unknown"}`);
      await admin
        .from("attendance_alerts")
        .update({ status: "failed", error: res.error ?? "unknown" })
        .eq("student_id", row.studentId)
        .eq("cohort_id", row.cohortId)
        .eq("kind", ABSENCE_ALERT_KIND);
    }
  }

  return { evaluated: pending.length, sent, errors };
}

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const results = [];
  const allErrors: string[] = [];

  for (const w of REMINDER_WINDOWS) {
    const r = await processWindow(admin, w.kind, w.leadMs, now);
    results.push({ kind: r.kind, sessions: r.sessions, emails: r.emails });
    allErrors.push(...r.errors);
  }

  const absences = await processAbsenceAlerts(admin, now);
  allErrors.push(...absences.errors);

  return NextResponse.json({
    ok: allErrors.length === 0,
    ran_at: new Date(now).toISOString(),
    windows: results,
    absences: { evaluated: absences.evaluated, sent: absences.sent },
    errors: allErrors,
  });
}

// Algunos schedulers (Vercel Cron) invocan por GET; otros prefieren POST.
// Exponemos ambos apuntando a la misma lógica.
export const POST = GET;
