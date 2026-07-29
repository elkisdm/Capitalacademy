import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { sendSurveyCampaign } from "@/lib/surveys/send";
import { SurveysNotConfiguredError } from "@/lib/surveys/config";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ campaignId: string }> };

/**
 * POST /api/admin/surveys/[campaignId]/send
 *
 * Idempotente: `sendSurveyCampaign` reclama la fila y consulta la bitácora por
 * destinatario, así que un doble clic o un reintento no duplica invitaciones.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { campaignId } = await ctx.params;
  if (!uuidLike.safeParse(campaignId).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  try {
    const result = await sendSurveyCampaign(campaignId);
    if (result.status === "skipped") {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    return NextResponse.json({ result });
  } catch (err) {
    if (err instanceof SurveysNotConfiguredError) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: 503 });
    }
    console.error("Error sending survey:", err);
    return NextResponse.json({ error: "Error al enviar la encuesta" }, { status: 500 });
  }
}
