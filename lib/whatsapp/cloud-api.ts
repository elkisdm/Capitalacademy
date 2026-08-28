/**
 * Contrato mínimo con WhatsApp Cloud API (Meta Graph) para enviar plantillas.
 *
 * El número emisor es el propio de la Academia (+56 9 4383 7186, ADR-0040),
 * que cuelga del WABA compartido de la empresa. Atlas NO participa en el envío:
 * solo recibe el webhook de entrada del WABA.
 *
 * Solo plantillas: fuera de la ventana de 24 horas Meta rechaza texto libre, y
 * un lead recién inscrito nunca nos ha escrito.
 */

export class WhatsAppCloudError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "WhatsAppCloudError";
  }
}

function config(): { version: string; phoneNumberId: string; token: string } {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) {
    throw new WhatsAppCloudError(
      "Falta configurar WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_ACCESS_TOKEN",
      null,
    );
  }
  return { version: process.env.WHATSAPP_CLOUD_API_VERSION ?? "v21.0", phoneNumberId, token };
}

export type PlantillaEnviada = { messageId: string | null };

/**
 * Envía una plantilla aprobada. `to` va en dígitos E.164 sin `+` (así lo
 * exige Cloud API); `bodyParams` rellena los `{{n}}` del cuerpo en orden.
 */
export async function enviarPlantilla(input: {
  to: string;
  template: string;
  language?: string;
  bodyParams: string[];
}): Promise<PlantillaEnviada> {
  const { version, phoneNumberId, token } = config();
  const body = {
    messaging_product: "whatsapp",
    to: input.to.replace(/^\+/, ""),
    type: "template",
    template: {
      name: input.template,
      language: { code: input.language ?? "es" },
      components: [
        {
          type: "body",
          parameters: input.bodyParams.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };

  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new WhatsAppCloudError(
      `No se pudo contactar a Meta: ${err instanceof Error ? err.message : String(err)}`,
      null,
    );
  }

  const json = (await res.json().catch(() => null)) as
    | { error?: { code?: number; message?: string }; messages?: Array<{ id?: string }> }
    | null;
  if (!res.ok || json?.error) {
    throw new WhatsAppCloudError(
      `Meta respondió ${json?.error?.code ?? res.status}: ${json?.error?.message ?? "HTTP " + res.status}`,
      res.status,
    );
  }
  return { messageId: json?.messages?.[0]?.id ?? null };
}
