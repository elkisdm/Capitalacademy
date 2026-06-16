import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Origen canónico para los redirects post-confirmación.
 *
 * En Netlify, `new URL(request.url).origin` puede resolver al permalink del
 * deploy (p. ej. `6a31…--capitalacademy.netlify.app`) en vez del dominio real.
 * Si redirigimos ahí, la cookie de sesión (seteada en capitalacademy.cl) no
 * aplica en ese host → el usuario rebota a /login aunque la confirmación haya
 * sido exitosa. Esto rompe la activación de las invitaciones.
 *
 * Por eso forzamos el dominio canónico en producción (env o literal, mismo
 * patrón que robots.ts/sitemap.ts/certificates), y solo respetamos el origin
 * del request en desarrollo local.
 */
function canonicalOrigin(requestOrigin: string): string {
  if (
    requestOrigin.includes("localhost") ||
    requestOrigin.includes("127.0.0.1")
  ) {
    return requestOrigin;
  }
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://capitalacademy.cl"
  );
}

/** Evita open-redirects vía `next` (solo rutas internas, no `//host` ni absolutas). */
function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/classroom";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const base = canonicalOrigin(origin);
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "invite") as EmailOtpType;
  const next = safeNext(searchParams.get("next") ?? "/classroom");

  if (!tokenHash) {
    return NextResponse.redirect(`${base}/login?error=missing_token`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    return NextResponse.redirect(
      `${base}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${base}${next}`);
}
