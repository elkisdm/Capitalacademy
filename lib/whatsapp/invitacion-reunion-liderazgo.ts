/**
 * Invitación automática por WhatsApp a la reunión de 15 minutos con la
 * directora académica, para cada lead que se inscribe en /liderazgo (ADR-0040).
 *
 * El resultado —enviado o fallido— se anota en `lead_activity` para que el
 * equipo lo vea en la bitácora de /admin/leads y sepa si tiene que escribir a
 * mano. Nunca lanza: la inscripción ya está guardada y un WhatsApp caído no
 * puede convertirla en un error para el lead.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneDigits } from "@/lib/admin/leads-format";
import { enviarPlantilla } from "@/lib/whatsapp/cloud-api";

export const PLANTILLA_INVITACION_LIDERAZGO = "liderazgo_reunion_directora";

/** Solo la landing de Liderazgo dispara la invitación. */
export function debeInvitar(lead: { program_interest: string; source: string | null }): boolean {
  return lead.program_interest === "liderazgo" && lead.source === "landing-liderazgo";
}

/** El nombre de pila para el `{{1}}`; el nombre completo suena a formulario. */
export function nombreDePila(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export type ResultadoInvitacion = { ok: true; messageId: string | null } | { ok: false; error: string };

export async function enviarInvitacionReunion(
  // Tipado laxo a propósito: solo se usa `.from('lead_activity').insert`.
  supabase: Pick<SupabaseClient, "from">,
  lead: { id: string; full_name: string; phone: string },
): Promise<ResultadoInvitacion> {
  let resultado: ResultadoInvitacion;
  try {
    const { messageId } = await enviarPlantilla({
      to: phoneDigits(lead.phone),
      template: PLANTILLA_INVITACION_LIDERAZGO,
      bodyParams: [nombreDePila(lead.full_name)],
    });
    resultado = { ok: true, messageId };
  } catch (err) {
    resultado = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const body = resultado.ok
    ? `Invitación automática por WhatsApp a la reunión de 15 min con la directora académica (enviada${resultado.messageId ? `, id ${resultado.messageId}` : ""}).`
    : `Invitación automática por WhatsApp NO enviada: ${resultado.error}. Conviene escribirle a mano.`;

  const { error } = await supabase
    .from("lead_activity")
    .insert({ lead_id: lead.id, kind: "whatsapp", body, created_by: null });
  if (error) console.error("[leads] no se pudo registrar la invitación por WhatsApp", error);
  if (!resultado.ok) console.error("[leads] invitación por WhatsApp fallida", resultado.error);

  return resultado;
}
