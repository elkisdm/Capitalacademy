import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSessionReminderEmail } from "@/lib/email/session-reminder";
import { sendCapacitacionReminderEmail } from "@/lib/email/capacitacion-emails";

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
// (ahora + 24h) y (ahora + 24h + slack); análogo para '1h'.
const REMINDER_WINDOWS: Array<{ kind: "24h" | "1h"; leadMs: number }> = [
  { kind: "24h", leadMs: 24 * 60 * 60 * 1000 },
  { kind: "1h", leadMs: 60 * 60 * 1000 },
];
// Ancho de cada ventana. Debe ser >= al período del cron para no perder envíos.
const WINDOW_SLACK_MS = 35 * 60 * 1000; // 35 min

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
  audience: string;
};

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sin secret configurado, denegar por defecto.
  const auth = req.headers.get("authorization");
  if (auth && auth === `Bearer ${secret}`) return true;
  // Soporte para schedulers que no permiten headers (query param).
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

async function processWindow(
  admin: ReturnType<typeof createAdminClient>,
  kind: "24h" | "1h",
  leadMs: number,
  now: number,
): Promise<{ kind: string; sessions: number; emails: number; errors: string[] }> {
  const errors: string[] = [];
  const from = new Date(now + leadMs).toISOString();
  const to = new Date(now + leadMs + WINDOW_SLACK_MS).toISOString();

  const { data: sessionsData, error: sessErr } = await admin
    .from("class_sessions")
    .select(
      "id, cohort_id, title, starts_at, ends_at, modality, meeting_url, status, teacher_id, audience",
    )
    .eq("status", "scheduled")
    // Las grabadas no son eventos en vivo: no se recuerdan.
    .neq("modality", "recorded")
    .gte("starts_at", from)
    .lt("starts_at", to);

  if (sessErr) {
    errors.push(`query sessions (${kind}): ${sessErr.message}`);
    return { kind, sessions: 0, emails: 0, errors };
  }

  const sessions = (sessionsData ?? []) as unknown as SessionRow[];
  if (sessions.length === 0) return { kind, sessions: 0, emails: 0, errors };

  // Idempotencia: descartar sesiones que YA tienen recordatorio de esta ventana.
  const sessionIds = sessions.map((s) => s.id);
  const { data: existing } = await admin
    .from("session_reminders")
    .select("session_id")
    .eq("kind", kind)
    .eq("channel", CHANNEL)
    .in("session_id", sessionIds);
  const alreadySent = new Set(
    ((existing ?? []) as Array<{ session_id: string }>).map((r) => r.session_id),
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
    // bloquea cualquier ejecución concurrente del cron. Si el insert choca con
    // el unique, otra invocación ya tomó esta sesión -> saltar.
    const { error: reserveErr } = await admin.from("session_reminders").insert({
      session_id: session.id,
      kind,
      channel: CHANNEL,
      status: "sent",
      recipients_count: 0,
    });
    if (reserveErr) {
      // 23505 = unique_violation: ya reservado por otra corrida. No es error real.
      if (!String(reserveErr.code).includes("23505")) {
        errors.push(`reserve ${session.id} (${kind}): ${reserveErr.message}`);
      }
      continue;
    }

    // Alumnos con matrícula activa del cohorte. Si la sesión es exclusiva de
    // Capital Inteligente (audience='capital_inteligente'), solo se recuerda a
    // los alumnos marcados con ese segmento — el cron usa service_role y bypassa
    // la RLS de audiencia (0024), así que el filtro debe ser explícito aquí.
    let enrollQuery = admin
      .from("enrollments")
      .select("student_id, profiles(email, full_name)")
      .eq("cohort_id", session.cohort_id)
      .eq("status", "active");
    if (session.audience === "capital_inteligente") {
      enrollQuery = enrollQuery.eq("segment", "capital_inteligente");
    }
    const { data: enrollments } = await enrollQuery;

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

    const title = session.title ?? "Tu próxima clase";
    const teacherName = session.teacher_id
      ? (teacherMap.get(session.teacher_id) ?? null)
      : null;
    const isCapacitacion =
      programByCohort.get(session.cohort_id) === CAP_CI_PROGRAM_ID;

    let sent = 0;
    let lastError: string | undefined;
    for (const r of recipients) {
      const res = isCapacitacion
        ? await sendCapacitacionReminderEmail({
            email: r.email,
            fullName: r.full_name ?? "",
            sessionTitle: title,
            startsAtIso: session.starts_at,
            endsAtIso: session.ends_at,
            modality: session.modality,
            meetingUrl: session.meeting_url,
            kind,
          })
        : await sendSessionReminderEmail({
            email: r.email,
            fullName: r.full_name ?? "",
            sessionTitle: title,
            startsAtIso: session.starts_at,
            endsAtIso: session.ends_at,
            modality: session.modality,
            meetingUrl: session.meeting_url,
            teacherName,
            kind,
          });
      if (res.success) sent++;
      else lastError = res.error;
    }

    totalEmails += sent;
    sessionsProcessed++;

    // Actualizar la bitácora con el resultado real del envío.
    await admin
      .from("session_reminders")
      .update({
        recipients_count: sent,
        status: sent > 0 ? "sent" : recipients.length === 0 ? "skipped" : "failed",
        error: lastError ?? null,
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

export async function GET(req: Request) {
  if (!authorize(req)) {
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

  return NextResponse.json({
    ok: allErrors.length === 0,
    ran_at: new Date(now).toISOString(),
    windows: results,
    errors: allErrors,
  });
}

// Algunos schedulers (Vercel Cron) invocan por GET; otros prefieren POST.
// Exponemos ambos apuntando a la misma lógica.
export const POST = GET;
