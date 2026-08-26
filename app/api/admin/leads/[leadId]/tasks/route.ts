import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

/**
 * Agendar el próximo paso sobre un lead ("llamar mañana 11:00").
 *
 * `due_at` llega como ISO en UTC: el panel lo convierte desde el
 * `datetime-local` con `chileWallTimeToIso`, para que la hora que se escribe
 * sea la hora de Chile y no la del reloj del navegador de quien agenda.
 *
 * Se permite agendar en el pasado a propósito: sirve para registrar un
 * pendiente que se arrastra desde ayer y que hay que ver hoy. Nace directamente
 * como vencida, que es exactamente lo que es.
 */
const postSchema = z.object({
  title: z.string().trim().min(1, "La tarea necesita un título").max(200),
  due_at: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "La fecha no es válida"),
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

  const { data, error } = await supabase
    .from("lead_tasks")
    .insert({
      lead_id: leadId,
      title: parsed.data.title,
      due_at: new Date(parsed.data.due_at).toISOString(),
      created_by: auth.user.id,
    })
    .select("id, lead_id, title, due_at, done_at, created_at, created_by")
    .single();

  if (error) {
    return NextResponse.json({ error: "No se pudo agendar la tarea" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
