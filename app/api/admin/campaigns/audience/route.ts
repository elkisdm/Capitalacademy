import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { resolveAudience } from "@/lib/campaigns/audience";

export const runtime = "nodejs";

/**
 * GET /api/admin/campaigns/audience?programId=&cohortId=&status=active,invited&segment=
 *
 * Cuántas personas recibirían el envío con estos filtros. Existe para que el
 * panel muestre el número ANTES de enviar: "vas a escribirle a 239 personas" es
 * la última barrera antes de un envío masivo irreversible.
 *
 * Devuelve el conteo y una muestra corta de nombres (no la lista completa: es
 * un contador, no un exportador de PII).
 */
export async function GET(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");
  const cohortId = searchParams.get("cohortId");
  const segment = searchParams.get("segment");
  const statusParam = searchParams.get("status");

  const parsedProgramId = uuidLike.safeParse(programId ?? "");
  if (!parsedProgramId.success) {
    return NextResponse.json({ error: "programId debe ser un UUID válido" }, { status: 422 });
  }
  if (cohortId && !uuidLike.safeParse(cohortId).success) {
    return NextResponse.json({ error: "cohortId debe ser un UUID válido" }, { status: 422 });
  }

  const statuses = statusParam
    ? statusParam.split(",").map((s) => s.trim()).filter(Boolean)
    : ["active"];

  try {
    const recipients = await resolveAudience(createAdminClient(), {
      programId: parsedProgramId.data,
      cohortId: cohortId || null,
      statuses,
      segment: segment || null,
    });

    return NextResponse.json({
      count: recipients.length,
      sample: recipients.slice(0, 5).map((r) => r.fullName || r.email),
    });
  } catch (err) {
    console.error("Error resolving audience:", err);
    return NextResponse.json({ error: "Error al calcular la audiencia" }, { status: 500 });
  }
}
