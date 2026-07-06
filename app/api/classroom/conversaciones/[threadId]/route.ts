import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/types";
import { getThreadWithComments } from "@/lib/conversaciones/queries";
import { getPublicAuthorsMap } from "@/lib/profiles/public-authors";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ threadId: string }> };

/**
 * Resuelve si el usuario es staff de un programa: admin/ops global
 * (`profiles.system_role`/`role`) o teacher/assistant de alguna cohorte
 * de ese programa (`cohort_roles`). Espeja `is_program_staff()` de la BD.
 */
async function isProgramStaff(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  programId: string,
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, system_role")
    .eq("id", userId)
    .single();

  const sysRole = profile?.system_role ?? profile?.role;
  if (sysRole === "admin" || sysRole === "ops") return true;

  const { data: cohortRole } = await supabase
    .from("cohort_roles")
    .select("id, cohorts!inner(program_id)")
    .eq("user_id", userId)
    .eq("cohorts.program_id", programId)
    .in("role", ["teacher", "assistant"])
    .limit(1)
    .maybeSingle();

  return Boolean(cohortRole);
}

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(1).max(10000).optional(),
    is_pinned: z.boolean().optional(),
    is_locked: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No se enviaron campos" });

// ── GET /api/classroom/conversaciones/[threadId] ────────────────────

export async function GET(_req: Request, { params }: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { threadId } = await params;

  const data = await getThreadWithComments(threadId, user.id);
  if (!data) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  return NextResponse.json(data);
}

// ── PATCH /api/classroom/conversaciones/[threadId] ──────────────────
// Autor: puede editar title/body. Staff del programa: puede fijar/cerrar
// (is_pinned/is_locked). Se enforza en API (defensa en profundidad además de RLS).

export async function PATCH(req: Request, { params }: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { threadId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { data: thread, error: fetchError } = await supabase
    .from("conversation_threads")
    .select("id, author_id, program_id")
    .eq("id", threadId)
    .maybeSingle();

  if (fetchError || !thread) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const { title, body: threadBody, is_pinned, is_locked } = parsed.data;
  const wantsModeration = is_pinned !== undefined || is_locked !== undefined;
  const wantsContentEdit = title !== undefined || threadBody !== undefined;

  if (wantsModeration) {
    const staff = await isProgramStaff(supabase, user.id, thread.program_id);
    if (!staff) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }

  if (wantsContentEdit && user.id !== thread.author_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const updates: TablesUpdate<"conversation_threads"> = {};
  if (title !== undefined) updates.title = title;
  if (threadBody !== undefined) updates.body = threadBody;
  if (is_pinned !== undefined) updates.is_pinned = is_pinned;
  if (is_locked !== undefined) updates.is_locked = is_locked;

  const { data: updated, error } = await supabase
    .from("conversation_threads")
    .update(updates)
    .eq("id", threadId)
    .select(
      "id, title, body, category, is_pinned, is_locked, comment_count, last_activity_at, created_at, author_id",
    )
    .single();

  if (error) {
    console.error("conversaciones PATCH error", error);
    return NextResponse.json(
      { error: "Error al actualizar la conversación" },
      { status: 500 },
    );
  }

  // Autor resuelto por service-role (la policy de profiles está cerrada, 0045).
  const authorsMap = await getPublicAuthorsMap([updated.author_id]);
  const author = authorsMap.get(updated.author_id) ?? {
    id: updated.author_id,
    full_name: "Usuario",
    avatar_url: null,
  };

  return NextResponse.json({ thread: { ...updated, author } });
}

// ── DELETE /api/classroom/conversaciones/[threadId] ──────────────────
// RLS permite autor o staff.

export async function DELETE(_req: Request, { params }: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { threadId } = await params;

  const { error } = await supabase
    .from("conversation_threads")
    .delete()
    .eq("id", threadId);

  if (error) {
    console.error("conversaciones DELETE error", error);
    return NextResponse.json(
      { error: "Error al eliminar la conversación" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
