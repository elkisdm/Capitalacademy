import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

/**
 * Reordena los módulos de un programa (migración 0100).
 *
 * Espejo de `/api/admin/lessons/reorder`: el orden viaja como la lista COMPLETA
 * de ids, no como "mover este uno arriba". Con una lista parcial el RPC dejaría
 * los módulos ausentes en el offset temporal, así que la función SQL rechaza ese
 * caso y acá se devuelve 422 en vez de un 500 opaco.
 */
const reorderSchema = z.object({
  programId: uuidLike,
  orderedIds: z.array(uuidLike).min(1, "orderedIds no puede estar vacío"),
});

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const { programId, orderedIds } = parsed.data;

  // Un id repetido dejaría módulos sin posición asignada y el RPC abortaría a
  // medias; se atrapa antes de tocar la base.
  if (new Set(orderedIds).size !== orderedIds.length) {
    return NextResponse.json(
      { error: "orderedIds no puede repetir módulos" },
      { status: 422 },
    );
  }

  // El reorden corre como un RPC atómico (offset temporal) vía service_role; la
  // autorización ya la garantizó authorizeAdmin arriba.
  const admin = createAdminClient();
  const { error } = await admin.rpc("reorder_modules", {
    p_program_id: programId,
    p_ordered_ids: orderedIds,
  });

  if (error) {
    console.error("reorder modules error", error);
    // La función levanta esta excepción cuando la lista llega incompleta: es un
    // error del llamador, no del servidor.
    if (error.message?.includes("todos los módulos")) {
      return NextResponse.json(
        { error: "Faltan módulos en el orden enviado" },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: "Error al reordenar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
