import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { fetchRemoteResults } from "@/lib/surveys/remote";
import { SurveysNotConfiguredError } from "@/lib/surveys/config";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ campaignId: string }> };

/**
 * GET /api/admin/surveys/[campaignId]/results
 *
 * Lee los resultados del motor remoto. Las respuestas nunca se copian a la base
 * de Capital Academy: viven en el sistema de encuestas y aquí solo se leen al
 * vuelo. Duplicarlas crearía dos versiones de la verdad y, en las anónimas,
 * un segundo lugar desde el cual re-identificar a alguien.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { campaignId } = await ctx.params;
  if (!uuidLike.safeParse(campaignId).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("survey_campaigns")
    .select("id, title, mode, external_survey_id, external_survey_url")
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaign) {
    return NextResponse.json({ error: "Encuesta no encontrada" }, { status: 404 });
  }
  if (!campaign.external_survey_id) {
    return NextResponse.json(
      { error: "Esta encuesta no tiene identificador en el sistema de encuestas" },
      { status: 409 },
    );
  }

  try {
    const results = await fetchRemoteResults(campaign.external_survey_id);

    const submissions = results.submissions ?? [];
    // En una encuesta anónima no se devuelven las respuestas fila por fila: el
    // cruce de respuestas abiertas con la lista de invitados puede
    // re-identificar a alguien. Solo el conteo.
    if (campaign.mode === "anonymous") {
      return NextResponse.json({
        survey: { title: campaign.title, mode: campaign.mode, url: campaign.external_survey_url },
        questions: results.questions ?? [],
        responseCount: submissions.length,
        submissions: null,
      });
    }

    return NextResponse.json({
      survey: { title: campaign.title, mode: campaign.mode, url: campaign.external_survey_url },
      questions: results.questions ?? [],
      responseCount: submissions.length,
      submissions,
    });
  } catch (err) {
    if (err instanceof SurveysNotConfiguredError) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: 503 });
    }
    console.error("Error fetching survey results:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al leer los resultados" },
      { status: 502 },
    );
  }
}
