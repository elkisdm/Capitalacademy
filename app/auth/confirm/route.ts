import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getBrandBySlug, loginPath } from "@/lib/programs/registry";
import { safeNextPath } from "@/lib/auth/next-path";

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

/**
 * Traduce el error de `verifyOtp` a un CÓDIGO estable que el login sabe
 * explicar. Antes se propagaba el mensaje crudo de Supabase por la URL y la
 * pantalla lo colapsaba todo a "Ocurrió un error. Intenta de nuevo.", que no
 * le decía al alumno qué hacer.
 */
function errorCode(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("expired") || m.includes("invalid") || m.includes("not found")) {
    return "link_expired";
  }
  return "confirm_failed";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const base = canonicalOrigin(origin);
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "invite") as EmailOtpType;
  const next = safeNextPath(searchParams.get("next"));
  const brand = getBrandBySlug(searchParams.get("brand"));

  /**
   * Vuelta al login conservando el destino y la marca del entorno. Sin esto el
   * alumno que abría `/asistencia/<id>` y caía en un enlace vencido terminaba
   * en el login genérico y, tras entrar, en `/classroom` en vez de la clase.
   */
  const backToLogin = (code: string) =>
    NextResponse.redirect(
      `${base}${loginPath(brand)}?next=${encodeURIComponent(next)}&error=${code}`,
    );

  if (!tokenHash) return backToLogin("missing_token");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    /**
     * Los enlaces de Supabase son de UN SOLO USO. En la práctica se consumen
     * dos veces seguidas: el escáner de enlaces del correo (o un segundo clic
     * / recarga) dispara este GET otra vez segundos después. El segundo intento
     * falla con 403 "Email link is invalid or has expired" aunque la sesión SÍ
     * quedó abierta en el primero. Si ya hay sesión válida, el enlace cumplió
     * su función: seguimos a `next` en vez de mostrar un error falso.
     */
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return NextResponse.redirect(`${base}${next}`);

    return backToLogin(errorCode(error.message));
  }

  return NextResponse.redirect(`${base}${next}`);
}
