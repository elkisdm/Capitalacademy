import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { notifyDeliverableOpen } from "@/lib/deliverables/notify";
import { FILE_CATEGORIES } from "@/lib/deliverables/file-types";

export const runtime = "nodejs";

const MAX_SIZE = 50 * 1024 * 1024;
const categoryEnum = z.enum(FILE_CATEGORIES as [string, ...string[]]);

// ---------------------------------------------------------------------------
// GET  /api/admin/deliverables?programId=xxx
//   Lista los entregables del programa con el conteo de entregas recibidas.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");
  if (!programId) {
    return NextResponse.json({ error: "programId es requerido" }, { status: 422 });
  }

  const parsedProgramId = uuidLike.safeParse(programId);
  if (!parsedProgramId.success) {
    return NextResponse.json({ error: "programId debe ser un UUID válido" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("deliverables")
    .select("*, deliverable_submissions(count)")
    .eq("program_id", parsedProgramId.data)
    .order("opens_at", { ascending: true });

  if (error) {
    console.error("Error fetching deliverables:", error);
    return NextResponse.json({ error: "Error al obtener entregables" }, { status: 500 });
  }

  const deliverables = (data ?? []).map((d) => {
    const { deliverable_submissions, ...rest } = d;
    return { ...rest, submissionCount: deliverable_submissions?.[0]?.count ?? 0 };
  });

  return NextResponse.json({ deliverables });
}

// ---------------------------------------------------------------------------
// POST  /api/admin/deliverables
//   Crea un entregable. Si la ventana ya está abierta, notifica de inmediato.
// ---------------------------------------------------------------------------

const createSchema = z
  .object({
    programId: uuidLike,
    title: z.string().trim().min(1, "El título es requerido").max(200),
    description: z.string().trim().max(2000).optional(),
    opensAt: z.string().trim().min(1, "opensAt es requerido"),
    dueAt: z.string().trim().min(1, "dueAt es requerido"),
    allowedFileTypes: z.array(categoryEnum).min(1, "Selecciona al menos un tipo de archivo"),
    maxFileSizeBytes: z.number().int().positive().max(MAX_SIZE).optional(),
    allowMultiple: z.boolean().optional(),
  })
  .refine((v) => new Date(v.dueAt) > new Date(v.opensAt), {
    message: "dueAt debe ser posterior a opensAt",
    path: ["dueAt"],
  });

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const v = parsed.data;
  const admin = createAdminClient();

  const { data: created, error } = await admin
    .from("deliverables")
    .insert({
      program_id: v.programId,
      title: v.title,
      description: v.description ?? null,
      opens_at: v.opensAt,
      due_at: v.dueAt,
      allowed_file_types: v.allowedFileTypes,
      max_file_size_bytes: v.maxFileSizeBytes ?? MAX_SIZE,
      allow_multiple: v.allowMultiple ?? false,
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating deliverable:", error);
    return NextResponse.json({ error: "Error al crear el entregable" }, { status: 500 });
  }

  // Ventana ya abierta (caso "Guión de venta" con deadline hoy): notifica ya.
  // Futuras aperturas las toma el cron /api/cron/deliverable-openings.
  if (new Date(v.opensAt) <= new Date()) {
    await notifyDeliverableOpen(created.id);
  }

  return NextResponse.json({ deliverable: created }, { status: 201 });
}
