import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { sendEmailCampaign } from "@/lib/campaigns/send";

export const runtime = "nodejs";
// Un lote de 100 correos tarda segundos, pero varios cientos de destinatarios
// más la lectura de bitácora necesitan holgura. Mismo techo que los crons.
export const maxDuration = 60;

type Ctx = { params: Promise<{ campaignId: string }> };

/**
 * POST /api/admin/campaigns/[campaignId]/send
 *
 * Dispara el envío real. Es idempotente por diseño: `sendEmailCampaign` reclama
 * la fila y consulta la bitácora, así que un doble clic o un reintento tras un
 * fallo parcial nunca duplica correos.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { campaignId } = await ctx.params;
  if (!uuidLike.safeParse(campaignId).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  try {
    const result = await sendEmailCampaign(campaignId);

    if (result.status === "skipped") {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }

    return NextResponse.json({ result });
  } catch (err) {
    console.error("Error sending campaign:", err);
    return NextResponse.json({ error: "Error al enviar la campaña" }, { status: 500 });
  }
}
