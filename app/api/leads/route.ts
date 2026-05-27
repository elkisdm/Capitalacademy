import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.email().max(160),
  phone: z.string().trim().min(6).max(40),
  role: z.string().trim().max(120).optional().or(z.literal("")),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  program_interest: z.enum(["diplomado", "liderazgo", "ruta", "indeciso"]),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  source: z.string().trim().max(80).optional().or(z.literal("")),
  utm_source: z.string().trim().max(120).optional().or(z.literal("")),
  utm_medium: z.string().trim().max(120).optional().or(z.literal("")),
  utm_campaign: z.string().trim().max(160).optional().or(z.literal("")),
  utm_content: z.string().trim().max(160).optional().or(z.literal("")),
  utm_term: z.string().trim().max(160).optional().or(z.literal("")),
  // Honeypot anti-bot
  website: z.string().max(0).optional(),
});

function emptyToNull<T extends string | undefined>(v: T) {
  return v && v.length > 0 ? v : null;
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  if (parsed.data.website && parsed.data.website.length > 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const ua = req.headers.get("user-agent") ?? null;

  const payload = {
    full_name: parsed.data.full_name,
    email: parsed.data.email.toLowerCase(),
    phone: parsed.data.phone,
    role: emptyToNull(parsed.data.role),
    company: emptyToNull(parsed.data.company),
    program_interest: parsed.data.program_interest,
    message: emptyToNull(parsed.data.message),
    source: emptyToNull(parsed.data.source) ?? "landing",
    utm_source: emptyToNull(parsed.data.utm_source),
    utm_medium: emptyToNull(parsed.data.utm_medium),
    utm_campaign: emptyToNull(parsed.data.utm_campaign),
    utm_content: emptyToNull(parsed.data.utm_content),
    utm_term: emptyToNull(parsed.data.utm_term),
    user_agent: ua,
  };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("leads")
    .insert(payload);

  if (error) {
    console.error("[leads] insert failed", error);
    return NextResponse.json(
      { error: "No pudimos guardar tu mensaje. Intenta nuevamente." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
