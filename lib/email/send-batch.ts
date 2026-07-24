import { createHash } from "node:crypto";
import { getResendClient, FROM_EMAIL } from "@/lib/resend/client";

/** Contenido de un correo ya armado, sin destinatario. */
export type EmailContent = { subject: string; html: string; text: string };
/**
 * Antelación de un recordatorio de clase. Debe coincidir con el CHECK de
 * `session_reminders.kind` / `session_reminder_recipients.kind` (migración 0081).
 */
export type ReminderKind = "72h" | "24h" | "1h";
export type BatchMessage = EmailContent & { to: string };
export type BatchOutcome = {
  sent: string[];
  failed: Array<{ to: string; error: string }>;
};

// Resend admite hasta 100 correos por llamada de batch.
export const BATCH_CHUNK_SIZE = 100;
// Margen ante el rate limit. Los 429 guardados en session_reminders dicen
// "You can only make 10 requests per second": con chunks de 100, 239
// destinatarios son 3 llamadas, así que el delay es defensa, no cuello de
// botella. El loop secuencial anterior hacía 239 requests y por eso lo cruzaba.
const CHUNK_DELAY_MS = 150;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Parte una lista en trozos de `size`. Exportada para test. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Clave de idempotencia derivada del CONTENIDO del trozo. Cierra la única
 * ventana que la bitácora por destinatario no cubre: si la corrida muere
 * DESPUÉS de que Resend aceptó el lote pero ANTES de escribir la bitácora, el
 * reintento arma exactamente el mismo trozo → misma clave → Resend no reenvía.
 * Si la composición cambia (alguien ya recibió y sale de la lista), la clave
 * cambia y no hay dedup falso.
 */
export function idempotencyKeyFor(prefix: string, messages: BatchMessage[]): string {
  const digest = createHash("sha256")
    .update(messages.map((m) => m.to).join(","))
    .digest("hex")
    .slice(0, 32);
  return `${prefix}:${digest}`;
}

async function sendChunk(group: BatchMessage[], key: string): Promise<BatchOutcome> {
  const resend = getResendClient();
  const payload = group.map((m) => ({
    from: FROM_EMAIL,
    to: m.to,
    subject: m.subject,
    html: m.html,
    text: m.text,
  }));

  for (let attempt = 0; ; attempt++) {
    let errorMsg: string;
    try {
      const res = await resend.batch.send(payload, {
        batchValidation: "permissive",
        idempotencyKey: key,
      });
      if (!res.error) {
        // Con batchValidation 'permissive', `errors[]` trae el índice de cada
        // correo rechazado; el resto del lote sí se envió.
        const perIndex = new Map<number, string>();
        const errs =
          (res.data as { errors?: Array<{ index: number; message: string }> } | null)
            ?.errors ?? [];
        for (const e of errs) perIndex.set(e.index, e.message);

        const out: BatchOutcome = { sent: [], failed: [] };
        group.forEach((m, i) => {
          const err = perIndex.get(i);
          if (err) out.failed.push({ to: m.to, error: err });
          else out.sent.push(m.to);
        });
        return out;
      }
      errorMsg = res.error.message ?? "unknown";
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : "unknown";
    }

    if (attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    // Se agotó el backoff: el lote entero queda fallido y reintentable en la
    // próxima corrida del cron (la bitácora dirá a quién le falta).
    return { sent: [], failed: group.map((m) => ({ to: m.to, error: errorMsg })) };
  }
}

/**
 * Envía `messages` por lotes. `idempotencyPrefix` identifica la operación
 * lógica (ej. `sr:<sessionId>:<kind>`).
 */
export async function sendEmailBatch(
  messages: BatchMessage[],
  idempotencyPrefix: string,
): Promise<BatchOutcome> {
  const outcome: BatchOutcome = { sent: [], failed: [] };
  if (messages.length === 0) return outcome;

  const groups = chunk(messages, BATCH_CHUNK_SIZE);
  for (let g = 0; g < groups.length; g++) {
    const res = await sendChunk(groups[g], idempotencyKeyFor(idempotencyPrefix, groups[g]));
    outcome.sent.push(...res.sent);
    outcome.failed.push(...res.failed);
    if (g < groups.length - 1) await sleep(CHUNK_DELAY_MS);
  }
  return outcome;
}
