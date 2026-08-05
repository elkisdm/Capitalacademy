import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * Marca el tour guiado como visto para el usuario autenticado (ADR-0030).
 *
 * Se escribe con el cliente del USUARIO, no con service_role, a propósito: la
 * policy `profiles_update_own` ya deja que cada persona actualice su propia
 * fila, así que no hace falta salirse de la RLS para esto. `.eq("id", user.id)`
 * cierra el caso: nadie puede marcar el tour de otro.
 *
 * El trigger `prevent_role_self_escalation` (0052) no interfiere: solo salta
 * cuando cambia `system_role` o `role`, y acá no se tocan.
 *
 * Un re-lanzamiento reescribe ambas columnas. Es deliberado: la lectura es "la
 * última vez que lo vio y cómo lo cerró esa vez", de modo que alguien que lo
 * saltó y después volvió a verlo completo cuente como adoptado.
 */

const tourSchema = z.object({
  outcome: z.enum(["completed", "skipped"]),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = tourSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  // `tour_completed_at` y `tour_outcome` los agrega la migración 0088, posterior
  // a la última generación de `lib/supabase/types.ts`. El cast explícito es el
  // mismo patrón que usa `app/api/classroom/profile/route.ts`; se puede sacar
  // cuando se regeneren los tipos.
  const update: Record<string, unknown> = {
    tour_completed_at: new Date().toISOString(),
    tour_outcome: parsed.data.outcome,
  };

  const { error } = await supabase
    .from("profiles")
    .update(update as Database["public"]["Tables"]["profiles"]["Update"])
    .eq("id", user.id);

  if (error) {
    console.error("classroom tour update error:", error);
    return NextResponse.json(
      { error: "No se pudo guardar el estado del tour" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
