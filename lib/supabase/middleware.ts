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

  // El invitado SIN cuenta pidiendo el token de la sala (ADR-0035). Su
  // autorización no puede salir de `auth` —no tiene sesión, ese es el punto—,
  // así que la resuelve la propia ruta: cookie httpOnly + fila aprobada en
  // `room_guests` + interruptor de la clase + ventana horaria + modalidad en
  // vivo (`decideGuestAccess`). El middleware la bloqueaba ANTES de llegar ahí,
  // lo que dejaba toda esa rama como código inalcanzable: el invitado se
  // quedaba en "no pudimos conectarte" con un 401 genérico.
  //
  // Solo este endpoint, y solo cuando no hay sesión: con sesión sigue el camino
  // de siempre. No afloja nada — mueve la decisión a quien de verdad puede
  // tomarla.
  const esTokenDeSala = /^\/api\/classroom\/clase\/[^/]+\/token$/.test(pathname);

  if (!user && esTokenDeSala) {
    supabaseResponse.headers.set("x-pathname", pathname);
    return supabaseResponse;
  }

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
    /*
      El destino incluye el querystring (p. ej. `?t=120` de un enlace profundo a
      una lección), y el login se arma LIMPIO: antes se clonaba la URL original
      con sus parámetros intactos, así que un `/classroom/x?error=algo` terminaba
      en `/login?error=algo&next=…` y pintaba un aviso de error falso.
    */
    const destination = pathname + url.search;
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", destination);
    return NextResponse.redirect(url);
  }

  supabaseResponse.headers.set("x-pathname", pathname);
  return supabaseResponse;
}
