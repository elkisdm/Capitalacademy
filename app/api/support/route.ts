import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRateLimiter, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import {
  sendSupportRequest,
  type SupportAttachment,
  type SupportKind,
} from "@/lib/email/support-request";

export const runtime = "nodejs";

const MAX_FILES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB por imagen
const MAX_MESSAGE = 4000;

// 5 solicitudes por usuario cada 10 minutos.
const limiter = createRateLimiter({ limit: 5, windowSeconds: 600 });

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = limiter.check(`support:${user.id}:${getClientIp(req)}`);
  if (!rl.ok) return rateLimitResponse(rl);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const kindRaw = String(form.get("kind") ?? "");
  const kind: SupportKind | null =
    kindRaw === "problem" || kindRaw === "feature" ? kindRaw : null;
  if (!kind) {
    return NextResponse.json({ error: "Tipo de solicitud inválido" }, { status: 400 });
  }

  const message = String(form.get("message") ?? "").trim();
  if (message.length < 5) {
    return NextResponse.json(
      { error: "Cuéntanos un poco más (mínimo 5 caracteres)." },
      { status: 400 },
    );
  }
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json(
      { error: `El mensaje no puede superar ${MAX_MESSAGE} caracteres.` },
      { status: 400 },
    );
  }

  const pageUrl = String(form.get("pageUrl") ?? "").slice(0, 300) || undefined;

  // Capturas: solo imágenes, máximo MAX_FILES, ≤ MAX_FILE_SIZE cada una.
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Máximo ${MAX_FILES} capturas por solicitud.` },
      { status: 400 },
    );
  }

  const attachments: SupportAttachment[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Solo se permiten imágenes como capturas." },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Cada captura debe pesar 5 MB o menos." },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    attachments.push({
      filename: safeName(file.name || "captura.png"),
      content: buffer.toString("base64"),
    });
  }

  // Nombre/correo se toman del servidor, nunca del cliente.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  const fromName = (profile?.full_name ?? "").trim() || user.email || "Usuario";
  const fromEmail = user.email ?? "";

  const result = await sendSupportRequest({
    kind,
    message,
    fromName,
    fromEmail,
    pageUrl,
    attachments,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: "No pudimos enviar tu mensaje. Intenta de nuevo en un momento." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

function safeName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
  return cleaned || "captura.png";
}
