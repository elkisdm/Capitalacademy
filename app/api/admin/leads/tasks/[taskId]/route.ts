import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

/**
 * Completar, reabrir o borrar una tarea.
 *
 * Va colgada de la tarea y no del lead porque la franja de pendientes del panel
 * cruza tareas de leads distintos: desde ahí se marca hecha sin tener que saber
 * a qué lead pertenece.
 *
 * Cualquier miembro del staff puede cerrar la tarea de otro. Es deliberado: si
 * alguien está de vacaciones, su seguimiento lo toma quien esté. `created_by`
 * queda como el destinatario del recordatorio, no como un dueño exclusivo.
 */
const patchSchema = z.object({
  done: z.boolean(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { taskId } = await params;
  if (!uuidLike.safeParse(taskId).success) {
    return NextResponse.json({ error: "Tarea inválida" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 422 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("lead_tasks")
    .update({ done_at: parsed.data.done ? new Date().toISOString() : null })
    .eq("id", taskId)
    .select("id, lead_id, title, due_at, done_at, created_at, created_by")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "No se pudo actualizar la tarea" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { taskId } = await params;
  if (!uuidLike.safeParse(taskId).success) {
    return NextResponse.json({ error: "Tarea inválida" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // `select` tras el delete distingue "no existía" de "se borró": sin eso, un
  // id inventado devolvería 200 y el panel creería que borró algo.
  const { data, error } = await supabase
    .from("lead_tasks")
    .delete()
    .eq("id", taskId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "No se pudo borrar la tarea" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
