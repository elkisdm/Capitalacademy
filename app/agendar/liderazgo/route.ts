import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Destino del botón "Agendar mi reunión" de la plantilla de WhatsApp (ADR-0040).
 *
 * Es un redirect y no la URL de la página de citas de Google directamente
 * porque la URL del botón queda fija en la plantilla aprobada por Meta:
 * cambiarla ahí obliga a una nueva aprobación. Acá se cambia con una variable.
 * Sin la variable, el lead cae en la landing en vez de en un 404.
 */
export function GET(req: Request) {
  const destino = process.env.LIDERAZGO_AGENDA_URL?.trim();
  const fallback = new URL("/liderazgo", req.url);
  return NextResponse.redirect(destino && /^https?:\/\//.test(destino) ? destino : fallback, 302);
}
