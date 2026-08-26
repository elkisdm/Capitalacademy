import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import {
  LEAD_STAGES,
  describeStageChange,
  toLeadStage,
} from "@/lib/admin/leads-pipeline";

export const runtime = "nodejs";

/**
 * Mover un lead de etapa (ADR-0038).
 *
 * La escritura va con service_role porque `leads` es deny-all (0074): no hay
 * policy de escritura para nadie, el único camino es este y `authorizeAdmin()`
 * es la puerta.
 *
 * El cambio y su registro en la bitácora los hace `mover_etapa_lead` en una
 * sola transacción; acá no se escriben las dos cosas por separado justamente
 * para que no puedan quedar desfasadas.
 */
const patchSchema = z.object({
  stage: z.enum(LEAD_STAGES),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { leadId } = await params;
  if (!uuidLike.safeParse(leadId).success) {
    return NextResponse.json({ error: "Lead inválido" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Etapa inválida" }, { status: 422 });
  }

  const { stage } = parsed.data;

  // El detalle se arma acá y no en la base para que la bitácora quede en el
  // mismo idioma que la pantalla ("Nuevo → Contactado", no "nuevo → contactado").
  const supabase = createAdminClient();
  const { data: lead, error: readError } = await supabase
    .from("leads")
    .select("stage")
    .eq("id", leadId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "No se pudo leer el lead" }, { status: 500 });
  }
  if (!lead) {
    return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
  }

  const anterior = toLeadStage(lead.stage);

  const { data, error } = await supabase.rpc("mover_etapa_lead", {
    p_lead_id: leadId,
    p_stage: stage,
    p_actor: auth.user.id,
    p_detalle: describeStageChange(anterior, stage),
  });

  if (error) {
    return NextResponse.json({ error: "No se pudo mover la etapa" }, { status: 500 });
  }

  // La función devuelve null solo si el lead desapareció entre la lectura de
  // arriba y el update; es carrera, no error del cliente, pero 404 sigue siendo
  // la respuesta honesta.
  if (data === null) {
    return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ stage, previous_stage: anterior });
}
