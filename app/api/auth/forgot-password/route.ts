import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendAccessLinkEmail,
  logAccessEmail,
  notifyAccessEmailFailure,
} from "@/lib/email/access-link";
import { createRateLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { getPublicBaseUrl } from "@/lib/api/base-url";
import { getBrandBySlug, onboardingSetPasswordPath } from "@/lib/programs/registry";
import { safeNextPath } from "@/lib/auth/redirects";

export const runtime = "nodejs";

/**
 * El límite por CUENTA es lo que frena el abuso real (spamear a una persona con
 * correos de recuperación). El límite por IP es mucho más holgado a propósito:
 * buena parte de los alumnos entra desde la misma oficina —10 de las 24
 * matriculadas de la G4 usan @capitalinteligente.cl— y salen por una sola IP
 * NAT. Con 3 por IP cada 5 minutos, bastaba que tres compañeros pidieran su
 * enlace durante una clase para que el cuarto viera "Demasiadas solicitudes"
 * sin haber pedido nada antes.
 */
const perEmailLimiter = createRateLimiter({ limit: 3, windowSeconds: 300 });
const perIpLimiter = createRateLimiter({ limit: 30, windowSeconds: 300 });

export async function POST(req: Request) {
  const rl = perIpLimiter.check(getClientIp(req));
  if (!rl.ok) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { email, next, brand: brandSlug } = body as {
    email?: string;
    next?: string;
    brand?: string;
  };

  if (!email || typeof email !== "string") {
    return NextResponse.json(
      { error: "Email es requerido" },
      { status: 422 },
    );
  }

  const rlEmail = perEmailLimiter.check(`fp:${email.trim().toLowerCase()}`);
  if (!rlEmail.ok) return rateLimitResponse(rlEmail);

  const admin = createAdminClient();
  const baseUrl = getPublicBaseUrl();

  /*
    El destino original del alumno (p. ej. `/asistencia/<id>`) viaja dentro del
    enlace de recuperación: set-password lo lee y lo usa al terminar. Sin esto,
    quien llegaba desde un QR de asistencia y tenía que resetear su contraseña
    aterrizaba en `/classroom` y creía que el registro no había funcionado.
  */
  const brand = getBrandBySlug(brandSlug);
  const dest = safeNextPath(next, "");
  const setPassword = onboardingSetPasswordPath(brand);
  const afterConfirm = dest
    ? `${setPassword}?next=${encodeURIComponent(dest)}`
    : setPassword;

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${baseUrl}${setPassword}`,
      },
    });

  /*
    La respuesta al cliente es siempre `ok: true` —responder distinto delataría
    qué correos tienen cuenta— pero hacia adentro los desenlaces se distinguen.
    Sin esta bitácora, "no me llega nada" era indistinguible de "escribí mal mi
    correo": ver docs/specs/acceso-autoservicio-trazabilidad.md.
  */
  if (linkError) {
    const notFound = /not found|no user|user_not_found/i.test(linkError.message);
    if (notFound) {
      await logAccessEmail({ email, status: "no_account" });
    } else {
      await logAccessEmail({ email, status: "failed", error: linkError.message });
      await notifyAccessEmailFailure(email, `generateLink: ${linkError.message}`);
    }
    return NextResponse.json({ ok: true });
  }

  const hashedToken = linkData.properties.hashed_token;
  const resetUrl = `${baseUrl}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=recovery&brand=${brand.slug}&next=${encodeURIComponent(afterConfirm)}`;

  await sendAccessLinkEmail({
    email,
    url: resetUrl,
    userId: linkData.user?.id ?? null,
  });

  return NextResponse.json({ ok: true });
}
