import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCohortSlug } from "@/lib/classroom/resolve-slugs";
import { ACTIVITY_MAX_GAP_SECONDS, chileDateKey } from "@/lib/classroom/actividad";

export const runtime = "nodejs";

/**
 * Latido de actividad del alumno (ADR-0029).
 *
 * El cuerpo NO lleva segundos a propósito: el incremento lo deriva la base como
 * `now() - last_beat_at`, recortado a ACTIVITY_MAX_GAP_SECONDS. Latir más
 * seguido no suma más tiempo, y un latido reenviado por reintento acredita ~0.
 * Lo único que el cliente aporta es en qué cohorte está parado.
 *
 * La escritura va por `record_student_activity` con el cliente admin: un solo
 * statement atómico, sin leer-modificar-escribir desde acá (dos pestañas
 * abiertas perderían escrituras) y sin pagar la cascada de RLS en caliente —
 * la lección del incidente de timeouts 57014 del 21-jul (migración 0079).
 *
 * DEGRADACIÓN: esto es telemetría. Cualquier desenlace que no sea "se registró"
 * responde sin cuerpo útil y el cliente lo ignora; la navegación del alumno
 * nunca depende de esta ruta.
 */
const beatSchema = z.object({
  // Slug o id de la cohorte donde está parado el alumno. Opcional: las
  // pantallas fuera de una cohorte (/classroom, /classroom/profile) no lo tienen.
  cohortSlug: z.string().min(1).max(160).optional(),

  // Primer latido de un tramo visible (al montar o al volver a la pestaña).
  // Acredita CERO segundos y solo reabre el reloj: no sabemos qué pasó en el
  // intervalo anterior, así que cobrar el tope sería inventar tiempo.
  resumed: z.boolean().optional(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Un cuerpo ilegible se trata como vacío en vez de 400: el latido puede salir
  // con `keepalive` durante el descargue de la página, y perder telemetría no
  // justifica un error. Un cuerpo con la forma equivocada sí se rechaza.
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = beatSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { cohortSlug, resumed } = parsed.data;
  const db = createAdminClient();

  const enrollmentId = await resolveEnrollmentForBeat(db, user.id, cohortSlug);

  if (!enrollmentId) {
    // Sin matrícula activa no hay nada que registrar. El caso típico es staff
    // recorriendo el classroom en modo vista previa: su paseo NO debe contarse
    // como actividad de alumno. 204 y el cliente sigue su camino.
    return new NextResponse(null, { status: 204 });
  }

  const { data, error } = await db.rpc("record_student_activity", {
    p_enrollment_id: enrollmentId,
    p_activity_date: chileDateKey(),
    // Tope 0 en un latido de reanudación: la base recorta el incremento a 0 y
    // el latido solo mueve `last_beat_at`.
    p_max_gap_seconds: resumed ? 0 : ACTIVITY_MAX_GAP_SECONDS,
  });

  if (error) {
    const transient = error.code === "57014";
    console.error("[actividad] record_student_activity error", {
      code: error.code,
      message: error.message,
      transient,
    });
    return NextResponse.json(
      { error: transient ? "Servicio ocupado" : "Error al registrar actividad" },
      {
        status: transient ? 503 : 500,
        headers: transient ? { "Retry-After": "60" } : undefined,
      },
    );
  }

  return NextResponse.json(data ?? {});
}

/**
 * Resuelve la matrícula a la que se le acredita el latido.
 *
 * Si viene `cohortSlug` y el alumno NO tiene matrícula activa en ESA cohorte,
 * devuelve null en vez de caer a otra matrícula suya: acreditarle a la cohorte
 * B el tiempo que pasó mirando la cohorte A ensuciaría los dos reportes. El
 * fallback a "su matrícula más reciente" solo aplica cuando no hay cohorte en
 * la ruta (dashboard /classroom, /classroom/profile).
 */
async function resolveEnrollmentForBeat(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  cohortSlug: string | undefined,
): Promise<string | null> {
  if (cohortSlug) {
    const cohortId = await resolveCohortSlug(cohortSlug);
    if (!cohortId) return null;

    const { data } = await db
      .from("enrollments")
      .select("id")
      .eq("student_id", userId)
      .eq("cohort_id", cohortId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    return data?.id ?? null;
  }

  const { data } = await db
    .from("enrollments")
    .select("id")
    .eq("student_id", userId)
    .eq("status", "active")
    .order("enrolled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}
