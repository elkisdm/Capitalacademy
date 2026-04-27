import { NextResponse } from "next/server";
import {
  verifyFintocSignature,
  type FintocWebhookEvent,
} from "@/lib/fintoc/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.FINTOC_WEBHOOK_SECRET;
  if (!secret) {
    console.error("FINTOC_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "config" }, { status: 500 });
  }

  const tolerance = Number(
    process.env.FINTOC_WEBHOOK_TOLERANCE_SECONDS ?? "300",
  );
  const rawBody = await req.text();
  const signatureHeader =
    req.headers.get("fintoc-signature") ??
    req.headers.get("x-fintoc-signature");

  const verification = verifyFintocSignature({
    rawBody,
    signatureHeader,
    secret,
    toleranceSeconds: Number.isFinite(tolerance) ? tolerance : 300,
  });
  if (!verification.ok) {
    console.warn("fintoc webhook rejected", verification.reason);
    return NextResponse.json(
      { error: verification.reason },
      { status: 401 },
    );
  }

  let event: FintocWebhookEvent;
  try {
    event = JSON.parse(rawBody) as FintocWebhookEvent;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const obj = event.data?.object;
  const sessionId = obj?.checkout_session?.id;
  const paymentExternalId = obj?.id;
  const fintocStatus = obj?.status;

  if (!sessionId) {
    return NextResponse.json({ ok: true, ignored: "no-session-id" });
  }

  const status = mapFintocStatus(event.type, fintocStatus);
  const supabase = createAdminClient();

  const update: Record<string, unknown> = {
    status,
    raw_webhook: event as unknown as Record<string, unknown>,
    fintoc_payment_id: paymentExternalId ?? null,
  };
  if (status === "succeeded") update.paid_at = new Date().toISOString();

  // Casts provisionales mientras `lib/supabase/types.ts` siga vacío.
  // Quitar `as never` cuando los tipos se regeneren contra el proyecto real.
  const { error } = await supabase
    .from("payments" as never)
    .update(update as never)
    .eq("fintoc_session_id", sessionId);

  if (error) {
    console.error("payments update error", error);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function mapFintocStatus(
  eventType: string | undefined,
  objStatus: string | undefined,
):
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "refunded" {
  if (eventType?.includes("succeeded") || objStatus === "succeeded") {
    return "succeeded";
  }
  if (eventType?.includes("failed") || objStatus === "failed") {
    return "failed";
  }
  if (eventType?.includes("refunded") || objStatus === "refunded") {
    return "refunded";
  }
  if (objStatus === "processing" || objStatus === "pending") {
    return "processing";
  }
  return "pending";
}
