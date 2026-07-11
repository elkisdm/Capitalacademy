import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

const reorderSchema = z.object({
  moduleId: uuidLike,
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
  const { moduleId, orderedIds } = parsed.data;

  // El reorden corre como un RPC atómico (offset temporal) vía service_role;
  // la autorización ya la garantizó authorizeAdmin arriba.
  const admin = createAdminClient();
  const { error } = await admin.rpc("reorder_lessons", {
    p_module_id: moduleId,
    p_ordered_ids: orderedIds,
  });

  if (error) {
    console.error("reorder lessons error", error);
    return NextResponse.json({ error: "Error al reordenar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
