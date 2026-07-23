import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBrandBySlug, loginPath } from "@/lib/programs/registry";
import { safeNextPath, canonicalOrigin } from "@/lib/auth/redirects";

/**
 * Canje de código PKCE. Gemelo de `/auth/confirm` (que canjea `token_hash`), y
 * arrastraba los mismos tres defectos que allá ya estaban resueltos: usaba el
 * origen del request (permalink de Netlify → la cookie de sesión no aplica en
 * ese host), caía por defecto a `/dashboard` —ruta que no existe en esta app,
 * o sea un 404— y al fallar perdía el destino y la marca del entorno.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const base = canonicalOrigin(origin);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const brand = getBrandBySlug(searchParams.get("brand"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${base}${next}`);

    // Código de un solo uso ya consumido (escáner de correo, recarga, segundo
    // clic): si la sesión quedó abierta en el primer intento, el enlace hizo
    // su trabajo. Mismo criterio que `/auth/confirm`.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return NextResponse.redirect(`${base}${next}`);
  }

  return NextResponse.redirect(
    `${base}${loginPath(brand)}?next=${encodeURIComponent(next)}&error=link_expired`,
  );
}
