import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRateLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 5, windowSeconds: 60 });

const bodySchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.email().max(160),
  phone: z.string().trim().min(6).max(40),
  role: z.string().trim().max(120).optional().or(z.literal("")),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  program_interest: z.enum(["diplomado", "liderazgo", "ruta", "indeciso"]),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  // Calificación del formulario de Liderazgo (0103). Opcionales: las otras
  // landings comparten este endpoint y no preguntan nada de esto.
  lidera_equipo: z.string().trim().max(120).optional().or(z.literal("")),
  personas_a_cargo: z.string().trim().max(60).optional().or(z.literal("")),
  // El tope corta un envío manipulado sin estorbar: son 8 opciones y un texto.
  desafios: z.array(z.string().trim().max(160)).max(12).optional(),
  source: z.string().trim().max(80).optional().or(z.literal("")),
  utm_source: z.string().trim().max(120).optional().or(z.literal("")),
  utm_medium: z.string().trim().max(120).optional().or(z.literal("")),
  utm_campaign: z.string().trim().max(160).optional().or(z.literal("")),
  utm_content: z.string().trim().max(160).optional().or(z.literal("")),
  utm_term: z.string().trim().max(160).optional().or(z.literal("")),
  // Honeypot anti-bot
  website: z.string().optional(),
});

function emptyToNull<T extends string | undefined>(v: T) {
  return v && v.length > 0 ? v : null;
}

const FIELD_LABELS: Record<string, string> = {
  full_name: "nombre",
  email: "correo electrónico",
  phone: "teléfono",
  program_interest: "programa de interés",
};

export async function POST(req: Request) {
  const rl = limiter.check(getClientIp(req));
  if (!rl.ok) return rateLimitResponse(rl);

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    const label = FIELD_LABELS[field];
    const error = label ? `Revisa el campo: ${label}` : "Validación fallida";
    return NextResponse.json(
      { error, issues: parsed.error.issues },
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
    lidera_equipo: emptyToNull(parsed.data.lidera_equipo),
    personas_a_cargo: emptyToNull(parsed.data.personas_a_cargo),
    // Un arreglo vacío se guarda como null y no como `{}`: "no respondió" y
    // "respondió nada" son lo mismo acá, y null filtra mejor en la tabla.
    desafios: parsed.data.desafios?.length ? parsed.data.desafios : null,
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
