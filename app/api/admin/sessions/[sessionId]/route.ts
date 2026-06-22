import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { moduleInProgramError } from "@/lib/admin/session-module";

export const runtime = "nodejs";

const modalitySchema = z.enum(["live_in_person", "live_online", "recorded"]);
const audienceSchema = z.enum(["all", "capital_inteligente"]);
const statusSchema = z.enum([
  "scheduled",
  "in_progress",
  "finished",
  "cancelled",
]);

const updateSessionSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
    modality: modalitySchema,
    teacher_id: uuidLike.nullable(),
    module_id: uuidLike.nullable(),
    meeting_url: z.string().trim().url().max(500).nullable(),
    audience: audienceSchema,
    status: statusSchema,
  })
  .partial();

type SessionRow = {
  id: string;
  cohort_id: string;
  starts_at: string;
  ends_at: string;
};

/**
 * PATCH /api/admin/sessions/:sessionId
 * Edita campos parciales de una sesión. Si cambian las fechas, registra la
 * reprogramación seteando `rescheduled_from` al id de la sesión actual.
 */
export async function PATCH(
  req: Request,
  props: { params: Promise<{ sessionId: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { sessionId } = await props.params;
  const parsedId = uuidLike.safeParse(sessionId);
  if (!parsedId.success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = updateSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const fields = parsed.data;
  if (Object.keys(fields).length === 0) {
    return NextResponse.json(
      { error: "No hay campos para actualizar" },
      { status: 422 },
    );
  }

  const admin = createAdminClient();

  const { data: current } = await admin
    .from("class_sessions")
    .select("id, cohort_id, starts_at, ends_at")
    .eq("id", parsedId.data)
    .single<SessionRow>();

  if (!current) {
    return NextResponse.json(
      { error: "Sesión no encontrada" },
      { status: 404 },
    );
  }

  // Si se reasigna el módulo, debe pertenecer al programa de la cohorte de la
  // sesión (la cohorte no cambia en un PATCH).
  if (fields.module_id) {
    const { data: cohort } = await admin
      .from("cohorts")
      .select("program_id")
      .eq("id", current.cohort_id)
      .single();
    const moduleError = await moduleInProgramError(
      admin,
      cohort?.program_id ?? "",
      fields.module_id,
    );
    if (moduleError) {
      return NextResponse.json({ error: moduleError }, { status: 422 });
    }
  }

  const nextStartsAt = fields.starts_at ?? current.starts_at;
  const nextEndsAt = fields.ends_at ?? current.ends_at;

  if (new Date(nextEndsAt).getTime() <= new Date(nextStartsAt).getTime()) {
    return NextResponse.json(
      { error: "La hora de término debe ser posterior al inicio" },
      { status: 422 },
    );
  }

  const datesChanged =
    (fields.starts_at !== undefined &&
      fields.starts_at !== current.starts_at) ||
    (fields.ends_at !== undefined && fields.ends_at !== current.ends_at);

  const update: Record<string, unknown> = { ...fields };
  if (datesChanged) {
    // Marca esta sesión como reprogramación de su propio estado anterior.
    update.rescheduled_from = current.id;
  }

  const { data, error } = await admin
    .from("class_sessions")
    // Los tipos generados no incluyen aún title/teacher_id/audience.
    .update(update as never)
    .eq("id", parsedId.data)
    .select("*")
    .single();

  if (error) {
    console.error("session update error", error);
    return NextResponse.json(
      { error: "Error al actualizar la sesión" },
      { status: 500 },
    );
  }

  return NextResponse.json({ session: data });
}

/**
 * DELETE /api/admin/sessions/:sessionId
 * Elimina una sesión de clase.
 */
export async function DELETE(
  _req: Request,
  props: { params: Promise<{ sessionId: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { sessionId } = await props.params;
  const parsedId = uuidLike.safeParse(sessionId);
  if (!parsedId.success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("class_sessions")
    .delete()
    .eq("id", parsedId.data);

  if (error) {
    console.error("session delete error", error);
    return NextResponse.json(
      { error: "Error al eliminar la sesión" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
