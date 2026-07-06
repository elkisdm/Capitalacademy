import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/auth/") ||
    // set-password (genérico y branded por entorno: /onboarding/<slug>/set-password)
    // es público: el invitado canjea el código de invitación antes de tener sesión.
    (pathname.startsWith("/onboarding/") && pathname.endsWith("/set-password")) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/api/leads") ||
    pathname.startsWith("/pago") ||
    pathname.startsWith("/api/pago") ||
    pathname.startsWith("/api/fintoc") ||
    pathname.startsWith("/api/flow") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/verify") ||
    pathname.startsWith("/verificar") ||
    // check-in de asistencia por QR: página pública; el alumno inicia sesión
    // dentro del flujo (redirect a login branded con ?next=/asistencia/...).
    pathname === "/asistencia" ||
    pathname.startsWith("/asistencia/") ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt";

  // En rutas públicas no gastamos el round-trip de getUser() al Auth de Supabase:
  // el visitante no necesita validación de sesión para verlas.
  if (isPublic) {
    supabaseResponse.headers.set("x-pathname", pathname);
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Para requests a /api/*, responder 401 JSON en vez de redirect HTML
    // (que rompía clientes esperando JSON, ej. fetch desde formularios públicos
    // que cayeran fuera del whitelist).
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  supabaseResponse.headers.set("x-pathname", pathname);
  return supabaseResponse;
}
