import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";

export const runtime = "nodejs";

// Valores permitidos para enrollments.segment. `null` desmarca el segmento.
// 'capital_inteligente' = alumno de Capital Inteligente (clases extra martes AM).
const ALLOWED_SEGMENTS = ["capital_inteligente"] as const;
type Segment = (typeof ALLOWED_SEGMENTS)[number] | null;

type PatchRequest = {
  cohort_id?: string;
  student_id?: string;
  segment?: string | null;
};

export async function PATCH(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { cohort_id, student_id, segment } = body as PatchRequest;

  if (!cohort_id || !student_id) {
    return NextResponse.json(
      { error: "cohort_id y student_id son requeridos" },
      { status: 422 },
    );
  }

  // Normaliza: '', undefined o 'all' -> null (sin segmento); cualquier otro
  // valor debe estar en la lista blanca.
  let normalized: Segment;
  if (segment == null || segment === "" || segment === "all") {
    normalized = null;
  } else if ((ALLOWED_SEGMENTS as readonly string[]).includes(segment)) {
    normalized = segment as Segment;
  } else {
    return NextResponse.json(
      {
        error: `segment inválido. Permitidos: ${ALLOWED_SEGMENTS.join(", ")} o null`,
      },
      { status: 422 },
    );
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("enrollments")
    .update({ segment: normalized })
    .eq("cohort_id", cohort_id)
    .eq("student_id", student_id)
    .select("id, student_id, cohort_id, status")
    .maybeSingle();

  if (error) {
    console.error("enrollment-segment update error", error);
    return NextResponse.json(
      { error: "No se pudo actualizar el segmento" },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "No existe una matrícula para ese alumno en esta cohorte" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, segment: normalized });
}
