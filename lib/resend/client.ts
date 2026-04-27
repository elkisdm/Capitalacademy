import { Resend } from "resend";

let client: Resend | null = null;

export function getResendClient() {
  if (client) return client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  client = new Resend(apiKey);
  return client;
}

export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "Capital Academy <no-reply@example.com>";
