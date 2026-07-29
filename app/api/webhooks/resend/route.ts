import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

/**
 * Webhook de Resend: cierra el ciclo de vida de los correos de ACCESO.
 *
 * `access_email_log` sabe que el correo SALIÓ, pero no si llegó. Esa diferencia
 * es justo la que necesita soporte cuando alguien dice "no me llega nada": sin
 * estos eventos, un rebote silencioso es indistinguible de un correo entregado
 * que la persona no vio. Ver docs/specs/acceso-autoservicio-trazabilidad.md.
 *
 * La cuenta de Resend es compartida entre proyectos de Capital Inteligente, así
 * que llegan eventos de correos que no son nuestros. El filtro no es por
 * dominio sino por coincidencia: solo se actualiza una fila si ese
 * `provider_message_id` está en la bitácora. Lo demás se ignora con 200 — un
 * error haría que Resend reintente eventos ajenos para siempre.
 */

/** Ventana de tolerancia del timestamp firmado, contra ataques de repetición. */
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

type ResendEvent = {
  type?: string;
  data?: {
    email_id?: string;
  };
};

/**
 * Resend firma con Svix. El contenido firmado es `<id>.<timestamp>.<body>` y la
 * firma va en base64 dentro de un header que puede traer varias versiones
 * (`v1,<firma> v1,<otra>`) durante una rotación de secreto: basta que UNA
 * coincida.
 *
 * Se verifica a mano con node:crypto en vez de sumar la dependencia `svix`:
 * es el mismo esquema HMAC-SHA256 que ya se verifica para Mux.
 */
function verifySvixSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const timestampMs = parseInt(timestamp, 10) * 1000;
  if (Number.isNaN(timestampMs)) return false;
  if (Math.abs(Date.now() - timestampMs) > SIGNATURE_MAX_AGE_MS) return false;

  // El secreto viaja como `whsec_<base64>`; se firma con los bytes decodificados.
  const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(rawSecret, "base64");

  const expected = createHmac("sha256", secretBytes)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);

  return signature.split(" ").some((part) => {
    const value = part.includes(",") ? part.split(",")[1] : part;
    const received = Buffer.from(value);
    if (received.length !== expectedBuf.length) return false;
    return timingSafeEqual(received, expectedBuf);
  });
}

/** Eventos de Resend que cambian el estado de entrega. El resto no interesa. */
const DELIVERY_STATUS: Record<string, "delivered" | "bounced" | "complained"> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("RESEND_WEBHOOK_SECRET no está configurado");
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 500 });
  }

  const rawBody = await req.text();

  const ok = verifySvixSignature(
    rawBody,
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    secret,
  );

  if (!ok) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const deliveryStatus = DELIVERY_STATUS[event.type ?? ""];
  const emailId = event.data?.email_id;

  // Evento que no habla de entrega, o sin id: nada que registrar.
  if (!deliveryStatus || !emailId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("access_email_log")
    .update({
      delivery_status: deliveryStatus,
      delivered_at: deliveryStatus === "delivered" ? new Date().toISOString() : null,
    })
    .eq("provider_message_id", emailId)
    .select("id");

  if (error) {
    console.error("access_email_log update failed:", error.message);
    return NextResponse.json({ error: "No se pudo registrar" }, { status: 500 });
  }

  // Sin coincidencia = correo de otro proyecto de la cuenta compartida.
  return NextResponse.json({ ok: true, updated: data?.length ?? 0 });
}
