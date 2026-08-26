import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { LEAD_CALL_OUTCOMES } from "@/lib/admin/leads-pipeline";

export const runtime = "nodejs";

/**
 * Registrar un contacto sobre un lead: nota, llamada, correo o WhatsApp.
 *
 * `stage_change` NO se acepta acá: esas filas las escribe la función
 * `mover_etapa_lead` junto con el cambio de etapa. Dejar que el cliente las
 * inserte permitiría una bitácora que dice que el lead se movió sin que se
 * haya movido.
 *
 * Los CHECK de la 0107 ya rechazan un `outcome` fuera de una llamada y una nota
 * vacía; acá se valida lo mismo para devolver un 422 con mensaje en vez de un
 * 500 con el error de Postgres.
 */
const postSchema = z
  .object({
    kind: z.enum(["note", "call", "email", "whatsapp"]),
    outcome: z.enum(LEAD_CALL_OUTCOMES).nullable().optional(),
    body: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => v.kind === "call" || !v.outcome, {
    message: "El resultado solo aplica a una llamada",
  })
  .refine((v) => v.kind !== "note" || (v.body && v.body.length > 0), {
    message: "La nota no puede ir vacía",
  });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { leadId } = await params;
  if (!uuidLike.safeParse(leadId).success) {
    return NextResponse.json({ error: "Lead inválido" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 422 },
    );
  }

  const supabase = createAdminClient();

  // La FK devolvería 23503 sobre un lead inexistente, pero eso llega como 500;
  // el chequeo previo permite responder 404, que es lo que el panel necesita
  // para saber que la fila que tiene en pantalla ya no existe.
  const { data: lead, error: readError } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .maybeSingle();

  // El error se distingue del lead ausente a propósito: tragarlo convertiría un
  // fallo pasajero de la base en un 404, que le dice a quien está trabajando
  // que el lead se borró cuando sigue ahí.
  if (readError) {
    return NextResponse.json({ error: "No se pudo leer el lead" }, { status: 500 });
  }
  if (!lead) {
    return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
  }

  const { kind, outcome, body } = parsed.data;

  const { data, error } = await supabase
    .from("lead_activity")
    .insert({
      lead_id: leadId,
      kind,
      outcome: outcome ?? null,
      body: body || null,
      created_by: auth.user.id,
    })
    .select("id, lead_id, kind, outcome, body, created_at, created_by")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "No se pudo registrar el contacto" },
      { status: 500 },
    );
  }

  return NextResponse.json(data, { status: 201 });
}
