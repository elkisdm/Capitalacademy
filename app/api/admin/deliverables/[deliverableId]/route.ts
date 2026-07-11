import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { DELIVERABLES_BUCKET } from "@/lib/deliverables/storage";
import { FILE_CATEGORIES } from "@/lib/deliverables/file-types";
import type { Database } from "@/lib/supabase/types";

type DeliverableUpdate = Database["public"]["Tables"]["deliverables"]["Update"];

export const runtime = "nodejs";

type Ctx = { params: Promise<{ deliverableId: string }> };

const MAX_SIZE = 50 * 1024 * 1024;
const categoryEnum = z.enum(FILE_CATEGORIES as [string, ...string[]]);

// ---------------------------------------------------------------------------
// PATCH  /api/admin/deliverables/[deliverableId]
//   Edita metadatos del entregable.
// ---------------------------------------------------------------------------

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    opensAt: z
      .string()
      .trim()
      .min(1)
      .refine((v) => !Number.isNaN(Date.parse(v)), "fecha inválida")
      .optional(),
    dueAt: z
      .string()
      .trim()
      .min(1)
      .refine((v) => !Number.isNaN(Date.parse(v)), "fecha inválida")
      .optional(),
    allowedFileTypes: z.array(categoryEnum).min(1).optional(),
    maxFileSizeBytes: z.number().int().positive().max(MAX_SIZE).optional(),
    allowMultiple: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No se enviaron campos" });

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { deliverableId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const v = parsed.data;
  const admin = createAdminClient();

  // Re-valida due_at > opens_at si alguno de los dos se está editando.
  if (v.opensAt !== undefined || v.dueAt !== undefined) {
    const { data: current } = await admin
      .from("deliverables")
      .select("opens_at, due_at")
      .eq("id", deliverableId)
      .single();
    if (!current) {
      return NextResponse.json({ error: "Entregable no encontrado" }, { status: 404 });
    }
    const nextOpensAt = v.opensAt ?? current.opens_at;
    const nextDueAt = v.dueAt ?? current.due_at;
    if (new Date(nextDueAt) <= new Date(nextOpensAt)) {
      return NextResponse.json(
        { error: "dueAt debe ser posterior a opensAt" },
        { status: 422 },
      );
    }
  }

  const updates: DeliverableUpdate = {};
  if (v.title !== undefined) updates.title = v.title;
  if (v.description !== undefined) updates.description = v.description;
  if (v.opensAt !== undefined) updates.opens_at = v.opensAt;
  if (v.dueAt !== undefined) updates.due_at = v.dueAt;
  if (v.allowedFileTypes !== undefined) updates.allowed_file_types = v.allowedFileTypes;
  if (v.maxFileSizeBytes !== undefined) updates.max_file_size_bytes = v.maxFileSizeBytes;
  if (v.allowMultiple !== undefined) updates.allow_multiple = v.allowMultiple;

  const { data: updated, error } = await admin
    .from("deliverables")
    .update(updates)
    .eq("id", deliverableId)
    .select()
    .single();

  if (error) {
    console.error("Error updating deliverable:", error);
    return NextResponse.json({ error: "Error al actualizar el entregable" }, { status: 500 });
  }

  return NextResponse.json({ deliverable: updated });
}

// ---------------------------------------------------------------------------
// DELETE  /api/admin/deliverables/[deliverableId]
//   Borra el entregable y sus archivos en Storage (las entregas caen por cascade).
// ---------------------------------------------------------------------------

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { deliverableId } = await params;
  const admin = createAdminClient();

  const { data: submissions } = await admin
    .from("deliverable_submissions")
    .select("storage_path")
    .eq("deliverable_id", deliverableId);

  const paths = (submissions ?? []).map((s) => s.storage_path).filter(Boolean) as string[];
  if (paths.length > 0) {
    const { error: removeError } = await admin.storage.from(DELIVERABLES_BUCKET).remove(paths);
    if (removeError) {
      console.error("deliverable storage remove error", removeError);
    }
  }

  const { error } = await admin.from("deliverables").delete().eq("id", deliverableId);
  if (error) {
    console.error("Error deleting deliverable:", error);
    return NextResponse.json({ error: "Error al eliminar el entregable" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
