import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

export async function requireStaff(): Promise<AuthResult> {
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

  if (
    !profile ||
    !["ops", "admin", "teacher"].includes(profile.system_role)
  ) {
    return {
      error: NextResponse.json(
        { error: "No autorizado" },
        { status: 403 },
      ),
    };
  }

  return { user };
}

/**
 * Gate por-sesión: platform staff (ops/admin) O teacher/assistant de la
 * cohorte a la que pertenece `sessionId`. A diferencia de `requireStaff`
 * (global, solo ops/admin — la rama "teacher" es código muerto porque ese
 * `system_role` no existe), esto habilita al docente real (que vive en
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

  const { data: session } = await supabase
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
