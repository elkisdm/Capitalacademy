import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type AuthResult =
  | { user: { id: string; email?: string }; error?: never }
  | { error: NextResponse; user?: never };

export async function authorizeAdmin(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json(
        { error: "No autenticado" },
        { status: 401 },
      ),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", user.id)
    .single();

  if (!profile || !["ops", "admin"].includes(profile.system_role)) {
    return {
      error: NextResponse.json(
        { error: "No autorizado" },
        { status: 403 },
      ),
    };
  }

  return { user };
}

export const requireStaff = authorizeAdmin;

/**
 * Gate por-sesión: platform staff (ops/admin) O teacher/assistant de la
 * cohorte a la que pertenece `sessionId`. A diferencia de `requireStaff`
 * (global, solo ops/admin), esto habilita al docente real (que vive en
 * `cohort_roles`) a operar SOLO sobre las sesiones de sus propias cohortes.
 */
export async function requireSessionStaff(
  sessionId: string,
): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json(
        { error: "No autenticado" },
        { status: 401 },
      ),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", user.id)
    .single();

  if (profile && ["ops", "admin"].includes(profile.system_role)) {
    return { user };
  }

  // La policy class_sessions_select (0045) solo permite leer a platform staff
  // o a alumnos matriculados; un docente puro (sin matrícula) no puede ver la
  // sesión bajo RLS. Se resuelve con service-role para no depender de eso.
  const { data: session } = await createAdminClient()
    .from("class_sessions")
    .select("cohort_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (session) {
    const { data: cohortRole } = await supabase
      .from("cohort_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("cohort_id", session.cohort_id)
      .in("role", ["teacher", "assistant"])
      .limit(1)
      .maybeSingle();

    if (cohortRole) {
      return { user };
    }
  }

  return {
    error: NextResponse.json(
      { error: "No autorizado" },
      { status: 403 },
    ),
  };
}

/**
 * Gate por-evaluación (fix §0.7 del brief de evaluaciones/notas 1-7):
 * `authorizeAdmin` exige `system_role in ('ops','admin')`, pero la profe real
 * vive en `cohort_roles` (rol `teacher`/`assistant`) y necesita calificar SIN
 * ser ops/admin. Espeja `requireSessionStaff` pero scoped a evaluación/cohorte
 * en vez de sesión.
 *
 * - Sin `cohortId` (ej. CRUD de criterios, a nivel de evaluación): basta con
 *   ser staff en ALGUNA cohorte del programa de la evaluación.
 * - Con `cohortId` (ej. roster de notas, acotado a una cohorte): además de
 *   ser staff de ESA cohorte, valida que la cohorte pertenezca al mismo
 *   programa de la evaluación (chequeo de tenant — R6 del brief).
 */
export async function requireEvaluationStaff(
  evaluationId: string,
  cohortId?: string,
): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", user.id)
    .single();

  if (profile && ["ops", "admin"].includes(profile.system_role)) {
    return { user };
  }

  const admin = createAdminClient();
  const { data: evaluation } = await admin
    .from("evaluations")
    .select("id, program_id")
    .eq("id", evaluationId)
    .maybeSingle();

  if (!evaluation) {
    return {
      error: NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 }),
    };
  }

  if (cohortId) {
    const { data: cohort } = await admin
      .from("cohorts")
      .select("id, program_id")
      .eq("id", cohortId)
      .maybeSingle();
    if (!cohort || cohort.program_id !== evaluation.program_id) {
      return {
        error: NextResponse.json(
          { error: "La cohorte no pertenece al programa de esta evaluación" },
          { status: 422 },
        ),
      };
    }

    const { data: cohortRole } = await supabase
      .from("cohort_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("cohort_id", cohortId)
      .in("role", ["teacher", "assistant"])
      .limit(1)
      .maybeSingle();

    if (cohortRole) return { user };
    return {
      error: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
    };
  }

  // Sin cohorte específica: basta con ser staff en ALGUNA cohorte del
  // programa de la evaluación (ej. CRUD de criterios, no acotado a cohorte).
  const { data: cohortsOfProgram } = await admin
    .from("cohorts")
    .select("id")
    .eq("program_id", evaluation.program_id);
  const cohortIds = (cohortsOfProgram ?? []).map((c) => c.id);

  if (cohortIds.length > 0) {
    const { data: anyRole } = await supabase
      .from("cohort_roles")
      .select("id")
      .eq("user_id", user.id)
      .in("cohort_id", cohortIds)
      .in("role", ["teacher", "assistant"])
      .limit(1)
      .maybeSingle();
    if (anyRole) return { user };
  }

  return {
    error: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
  };
}
