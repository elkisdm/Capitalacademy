import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { correctTranscript } from "@/lib/classroom/correct-transcript";
import { sendCapacitacionFollowupEmail } from "@/lib/email/capacitacion-emails";
import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

/** Max age for webhook signatures (5 minutes) to prevent replay attacks */
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

// Ciclo de Capacitación Comercial CI: solo sus grabaciones disparan el
// seguimiento post-clase. Ver lib/programs/registry.ts.
const CAP_CI_PROGRAM_ID = "a0000000-0000-0000-0000-000000000004";

// DECISIÓN ABIERTA: destino del CTA "programa pago" del follow-up. Aún no hay
// una landing pública dedicada del programa pago (Diplomado/Liderazgo)
// confirmada, así que se apunta al sitio de marketing con un label neutro y el
// Diplomado como programa destino (flagship pago). Cambiar cuando se defina la
// landing/checkout concreta.
const FOLLOWUP_CTA_URL = "https://capitalacademy.cl";
const FOLLOWUP_CTA_LABEL = "Conoce nuestros programas";
const FOLLOWUP_PAID_PROGRAM_NAME = "el Diplomado de Capital Academy";

/**
 * Seguimiento post-clase del ciclo CAP-CI: cuando la grabación de una sesión
 * en vivo queda publicada (lesson recorded enlazada vía class_sessions.lesson_id),
 * envía el correo "grabación disponible" + CTA a programa pago a los inscritos
 * activos de la cohorte. Idempotente vía capacitacion_followup_log (PK session_id).
 * Nunca lanza: los errores se registran y el webhook responde 2xx igual.
 */
async function dispatchCapacitacionFollowup(
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

    // Idempotencia: reservar el envío ANTES de mandar correos. Si la fila ya
    // existe (23505), otro evento del webhook ya lo envió -> no reenviar.
    const { error: reserveErr } = await supabase
      .from("capacitacion_followup_log")
      .insert({ session_id: sessionRow.id, recipients_count: 0 });
    if (reserveErr) return;

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
    const recordingUrl = `https://capitalacademy.cl/classroom/${cohortSlug}/clase/${sessionRow.id}`;
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
      .update({ recipients_count: sent })
      .eq("session_id", sessionRow.id);
  } catch (err) {
    console.error(
      "Mux webhook: capacitación follow-up failed for lesson",
      lessonId,
      err,
    );
  }
}

type MuxWebhookEvent = {
  type: string;
  data: {
    id: string;
    upload_id?: string;
    playback_ids?: Array<{ id: string; policy: string }>;
    duration?: number;
    status?: string;
    // track.ready fields
    asset_id?: string;
    text_type?: string;
    text_source?: string;
    language_code?: string;
    name?: string;
    // errored fields
    errors?: { type?: string; messages?: string[] };
  };
};

/**
 * Verify Mux webhook signature using HMAC-SHA256.
 * Header format: t=<timestamp>,v1=<signature>
 */
function verifyMuxSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const parts = signatureHeader.split(",");
  const timestampPart = parts.find((p) => p.startsWith("t="));
  const signaturePart = parts.find((p) => p.startsWith("v1="));

  if (!timestampPart || !signaturePart) return false;

  const timestamp = timestampPart.slice(2);
  const receivedSignature = signaturePart.slice(3);

  // Replay attack prevention: reject signatures older than 5 minutes
  const timestampMs = parseInt(timestamp, 10) * 1000;
  if (isNaN(timestampMs) || Date.now() - timestampMs > SIGNATURE_MAX_AGE_MS) {
    return false;
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  // Timing-safe comparison to prevent timing attacks
  const expected = Buffer.from(expectedSignature, "hex");
  const received = Buffer.from(receivedSignature, "hex");

  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}

export async function POST(req: Request) {
  // Read raw body FIRST for signature verification, then parse as JSON
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const webhookSecret = process.env.MUX_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = req.headers.get("mux-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
    if (!verifyMuxSignature(rawBody, signature, webhookSecret)) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 },
      );
    }
  } else {
    console.warn(
      "MUX_WEBHOOK_SECRET is not set — skipping signature verification (development only)",
    );
  }

  let event: MuxWebhookEvent;
  try {
    event = JSON.parse(rawBody) as MuxWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (event.type === "video.asset.ready") {
    const { id: assetId, upload_id, playback_ids, duration } = event.data;

    if (!upload_id) {
      return NextResponse.json({ received: true });
    }

    const playbackId = playback_ids?.[0]?.id ?? null;
    const durationSeconds = duration ? Math.round(duration) : null;
    const thumbnailUrl = playbackId
      ? `https://image.mux.com/${playbackId}/thumbnail.webp`
      : null;

    const supabase = createAdminClient();

    const { data: updatedLessons, error } = await supabase
      .from("lessons")
      .update({
        mux_asset_id: assetId,
        mux_playback_id: playbackId,
        video_duration_seconds: durationSeconds,
        thumbnail_url: thumbnailUrl,
        // El asset quedó listo: limpia cualquier error de procesamiento previo.
        mux_error: null,
      } as never)
      .eq("mux_upload_id", upload_id)
      .select("id");

    if (error) {
      console.error("Mux webhook: failed to update lesson", error);
      return NextResponse.json(
        { error: "DB update failed" },
        { status: 500 },
      );
    }

    // Si esta lección es la grabación de una sesión del ciclo CAP-CI, dispara el
    // seguimiento post-clase a los inscritos. Idempotente y tolerante a fallos.
    const lessonId = (updatedLessons as Array<{ id: string }> | null)?.[0]?.id;
    if (lessonId) {
      await dispatchCapacitacionFollowup(supabase, lessonId);
    }
  }

  // Mux falló al subir o procesar el video: registra el motivo en la lección
  // para que la UI lo muestre (en vez de quedar esperando un asset que no vendrá).
  if (
    event.type === "video.upload.errored" ||
    event.type === "video.asset.errored"
  ) {
    const supabase = createAdminClient();
    const reason =
      event.data.errors?.messages?.join(" · ") ??
      (event.type === "video.upload.errored"
        ? "La subida del video falló en Mux."
        : "Mux no pudo procesar el video.");

    // upload.errored: data.id ES el upload id. asset.errored: trae upload_id
    // (y, si no, el asset id ya persistido como mux_asset_id).
    const uploadId =
      event.type === "video.upload.errored"
        ? event.data.id
        : event.data.upload_id;

    if (uploadId) {
      await supabase
        .from("lessons")
        .update({ mux_error: reason } as never)
        .eq("mux_upload_id", uploadId);
    } else {
      await supabase
        .from("lessons")
        .update({ mux_error: reason } as never)
        .eq("mux_asset_id", event.data.id);
    }
  }

  if (event.type === "video.asset.deleted") {
    const supabase = createAdminClient();

    await supabase
      .from("lessons")
      .update({
        mux_asset_id: null,
        mux_playback_id: null,
        mux_upload_id: null,
        video_duration_seconds: null,
        thumbnail_url: null,
      })
      .eq("mux_asset_id", event.data.id);
  }

  if (event.type === "video.asset.track.ready") {
    const {
      asset_id: assetId,
      id: trackId,
      text_type,
      language_code,
    } = event.data;

    if (text_type === "subtitles" && assetId) {
      const supabase = createAdminClient();

      // Look up lesson by mux_asset_id
      const { data: lesson } = await supabase
        .from("lessons")
        .select("id, mux_playback_id")
        .eq("mux_asset_id", assetId)
        .single();

      if (lesson) {
        // Store the track ID on the lesson
        await supabase
          .from("lessons")
          .update({ mux_track_id: trackId })
          .eq("id", lesson.id);

        // Fetch transcript text and VTT from Mux
        let contentText: string | null = null;
        let contentVtt: string | null = null;

        if (lesson.mux_playback_id) {
          const baseUrl = `https://stream.mux.com/${lesson.mux_playback_id}/text/${trackId}`;

          const [txtRes, vttRes] = await Promise.all([
            fetch(`${baseUrl}.txt`),
            fetch(`${baseUrl}.vtt`),
          ]);

          if (txtRes.ok) contentText = await txtRes.text();
          if (vttRes.ok) contentVtt = await vttRes.text();
        }

        // Upsert into lesson_transcripts
        await supabase.from("lesson_transcripts").upsert(
          {
            lesson_id: lesson.id,
            status: "ready",
            language: language_code ?? "es",
            generated_at: new Date().toISOString(),
            content_text: contentText,
            content_vtt: contentVtt,
          },
          { onConflict: "lesson_id,language" },
        );

        // Auto-trigger transcript correction (fire-and-forget)
        if (contentVtt) {
          correctTranscript(lesson.id).catch((err) =>
            console.error(
              "Mux webhook: auto-correction failed for lesson",
              lesson.id,
              err,
            ),
          );
        }
      } else {
        console.error(
          "Mux webhook: no lesson found for asset_id",
          assetId,
        );
      }
    }
  }

  return NextResponse.json({ received: true });
}
