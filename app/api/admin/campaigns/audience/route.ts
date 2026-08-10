import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { resolveAudience } from "@/lib/campaigns/audience";

export const runtime = "nodejs";

/**
 * GET /api/admin/campaigns/audience?programId=&cohortId=&status=active,invited&segment=&detail=full
 *
 * Cuántas personas recibirían el envío con estos filtros. Existe para que el
 * panel muestre el número ANTES de enviar: "vas a escribirle a 239 personas" es
 * la última barrera antes de un envío masivo irreversible.
 *
 * Por defecto devuelve el conteo y una muestra corta de nombres. Con
 * `detail=full` devuelve además la lista completa, que es lo que necesita la
 * pantalla para dejar marcar destinatarios uno por uno (0092).
 *
 * Esa lista NO es una apertura de PII: la ruta ya exige `authorizeAdmin()`
 * (`ops` o `admin`), y ese mismo rol ve el roster completo con correos en
 * `/admin/alumnos`. Lo que antes faltaba era el dato en esta pantalla, no el
 * permiso para verlo.
 */
export async function GET(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  // Con `campaignId` se responde por la audiencia EFECTIVA de una campaña ya
  // guardada: sus filtros más su selección manual, resueltos igual que en el
  // envío. Lo usa la confirmación previa a enviar, que antes mostraba el largo
  // crudo de la selección y prometía más gente de la que iba a recibir el
  // correo (quien se retiró entremedio ya no cuenta).
  if (campaignId) {
    if (!uuidLike.safeParse(campaignId).success) {
      return NextResponse.json({ error: "campaignId debe ser un UUID válido" }, { status: 422 });
    }
    const admin = createAdminClient();
    const { data: campaign } = await admin
      .from("email_campaigns")
      .select("program_id, cohort_id, audience_status, audience_segment, audience_student_ids")
      .eq("id", campaignId)
      .maybeSingle();

    if (!campaign) {
      return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
    }

    try {
      const recipients = await resolveAudience(admin, {
        programId: campaign.program_id,
        cohortId: campaign.cohort_id,
        statuses: campaign.audience_status ?? ["active"],
        segment: campaign.audience_segment,
        studentIds: campaign.audience_student_ids,
      });
      return NextResponse.json({ count: recipients.length });
    } catch (err) {
      console.error("Error resolving campaign audience:", err);
      return NextResponse.json({ error: "Error al calcular la audiencia" }, { status: 500 });
    }
  }

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
      ...(searchParams.get("detail") === "full"
        ? {
            recipients: recipients.map((r) => ({
              studentId: r.studentId,
              email: r.email,
              fullName: r.fullName,
            })),
          }
        : {}),
    });
  } catch (err) {
    console.error("Error resolving audience:", err);
    return NextResponse.json({ error: "Error al calcular la audiencia" }, { status: 500 });
  }
}
