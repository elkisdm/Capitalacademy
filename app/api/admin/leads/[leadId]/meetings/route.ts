import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { crearReunion, AtlasCalendarError } from "@/lib/atlas/calendario";

export const runtime = "nodejs";

/**
 * Agendar una reunión real con un lead (ADR-0039).
 *
 * Se guarda PRIMERO y se agenda después, en ese orden a propósito: si Atlas o
 * Google fallan, lo que la persona escribió no se pierde y la reunión queda en
 * la lista marcada como no agendada. Al revés —agendar primero— un fallo al
 * guardar dejaría un evento huérfano en el calendario de la profesora que nadie
 * sabría borrar.
 *
 * La regla que no se negocia: si el evento no llegó a Google, `sync_error` queda
 * poblado y el panel lo muestra. Nunca se reporta como agendado algo que no lo
 * está.
 */
const postSchema = z.object({
  title: z.string().trim().min(1, "La reunión necesita un título").max(200),
  due_at: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "La fecha no es válida"),
  duration_minutes: z.number().int().min(5).max(480),
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
    .select("id, full_name, email")
    .eq("id", leadId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "No se pudo leer el lead" }, { status: 500 });
  }
  if (!lead) {
    return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
  }
  // Sin correo no hay a quién invitar; la reunión perdería su sentido.
  if (!lead.email) {
    return NextResponse.json(
      { error: "El lead no tiene correo: no se le puede enviar la invitación" },
      { status: 422 },
    );
  }

  const { title, due_at, duration_minutes } = parsed.data;
  const inicioIso = new Date(due_at).toISOString();

  const { data: tarea, error: insertError } = await supabase
    .from("lead_tasks")
    .insert({
      lead_id: leadId,
      title,
      due_at: inicioIso,
      kind: "meeting",
      duration_minutes,
      created_by: auth.user.id,
    })
    .select("id, lead_id, title, due_at, done_at, created_at, created_by, kind, duration_minutes")
    .single();

  if (insertError || !tarea) {
    return NextResponse.json({ error: "No se pudo agendar la reunión" }, { status: 500 });
  }

  try {
    const evento = await crearReunion({
      taskId: tarea.id,
      titulo: title,
      inicioIso,
      duracionMinutos: duration_minutes,
      correoInvitado: lead.email,
      descripcion: `Reunión coordinada desde Capital Academy con ${lead.full_name}.`,
    });

    const { data: actualizada } = await supabase
      .from("lead_tasks")
      .update({
        google_event_id: evento.eventId,
        meet_url: evento.meetUrl,
        sync_error: null,
      })
      .eq("id", tarea.id)
      .select("id, lead_id, title, due_at, done_at, created_at, created_by, kind, duration_minutes, google_event_id, meet_url, sync_error")
      .maybeSingle();

    return NextResponse.json(actualizada ?? tarea, { status: 201 });
  } catch (err) {
    const motivo =
      err instanceof AtlasCalendarError ? err.message : "Error inesperado al agendar";
    console.error("[leads] la reunión no llegó al calendario:", motivo);

    // La tarea SOBREVIVE, marcada. Es la diferencia entre "perdí lo que escribí"
    // y "quedó anotado pero hay que reintentarlo".
    const { data: marcada } = await supabase
      .from("lead_tasks")
      .update({ sync_error: motivo.slice(0, 500) })
      .eq("id", tarea.id)
      .select("id, lead_id, title, due_at, done_at, created_at, created_by, kind, duration_minutes, google_event_id, meet_url, sync_error")
      .maybeSingle();

    return NextResponse.json(
      {
        ...(marcada ?? tarea),
        warning: "La reunión quedó anotada pero no llegó al calendario.",
      },
      { status: 201 },
    );
  }
}
