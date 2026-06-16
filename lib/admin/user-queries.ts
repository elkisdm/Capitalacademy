import { createClient } from "@/lib/supabase/server";

export type AdminUserListItem = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  system_role: "user" | "ops" | "admin";
  created_at: string;
  last_sign_in_at: string | null;
  onboarding_completed_at: string | null;
  cohort_roles: Array<{
    cohort_id: string;
    cohort_name: string;
    cohort_code: string;
    role: "student" | "teacher" | "assistant";
  }>;
};

export type AdminUserProfile = AdminUserListItem & {
  avatar_url: string | null;
  updated_at: string;
  recent_activity: Array<{
    lesson_id: string;
    lesson_title: string;
    watch_percentage: number;
    completed: boolean;
    last_watched_at: string;
  }>;
};

export type CohortMember = {
  user_id: string;
  full_name: string | null;
  email: string;
  role: "student" | "teacher" | "assistant";
  granted_at: string;
  // Segmento de la matrícula del alumno en este cohorte (migración 0024).
  // null = sin segmento; 'capital_inteligente' = alumno Capital Inteligente.
  segment: "capital_inteligente" | null;
};

export type CohortPickerItem = {
  id: string;
  name: string;
  code: string;
  status: string;
  program_name: string;
};

export async function getAdminUsersList(): Promise<AdminUserListItem[]> {
  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, system_role, created_at, onboarding_completed_at")
    .order("created_at", { ascending: false });

  if (!profiles || profiles.length === 0) return [];

  const userIds = profiles.map((p) => p.id);

  const { data: roles } = await supabase
    .from("cohort_roles")
    .select("user_id, cohort_id, role, cohorts(name, code)")
    .in("user_id", userIds);

  const rolesMap = new Map<string, AdminUserListItem["cohort_roles"]>();
  for (const r of roles ?? []) {
    const cohort = r.cohorts as { name: string; code: string } | null;
    const entry = {
      cohort_id: r.cohort_id,
      cohort_name: cohort?.name ?? "",
      cohort_code: cohort?.code ?? "",
      role: r.role,
    };
    const existing = rolesMap.get(r.user_id) ?? [];
    existing.push(entry);
    rolesMap.set(r.user_id, existing);
  }

  return profiles.map((p) => ({
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    phone: p.phone,
    system_role: p.system_role,
    created_at: p.created_at,
    last_sign_in_at: null,
    onboarding_completed_at: p.onboarding_completed_at ?? null,
    cohort_roles: rolesMap.get(p.id) ?? [],
  }));
}

export async function getAdminUserProfile(
  userId: string,
): Promise<AdminUserProfile | null> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (!profile) return null;

  const { data: roles } = await supabase
    .from("cohort_roles")
    .select("cohort_id, role, cohorts(name, code)")
    .eq("user_id", userId);

  const cohortRoles = (roles ?? []).map((r) => {
    const cohort = r.cohorts as { name: string; code: string } | null;
    return {
      cohort_id: r.cohort_id,
      cohort_name: cohort?.name ?? "",
      cohort_code: cohort?.code ?? "",
      role: r.role,
    };
  });

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id")
    .eq("student_id", userId);

  let recentActivity: AdminUserProfile["recent_activity"] = [];

  const enrollmentIds = (enrollments ?? []).map((e) => e.id);
  if (enrollmentIds.length > 0) {
    const { data: progress } = await supabase
      .from("video_progress")
      .select(
        "lesson_id, watch_percentage, completed, last_watched_at, lessons(title)",
      )
      .in("enrollment_id", enrollmentIds)
      .order("last_watched_at", { ascending: false })
      .limit(10);

    recentActivity = (progress ?? []).map((p) => {
      const lesson = p.lessons as { title: string } | null;
      return {
        lesson_id: p.lesson_id,
        lesson_title: lesson?.title ?? "",
        watch_percentage: Number(p.watch_percentage),
        completed: p.completed,
        last_watched_at: p.last_watched_at,
      };
    });
  }

  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    phone: profile.phone,
    avatar_url: profile.avatar_url,
    system_role: profile.system_role,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
    last_sign_in_at: null,
    onboarding_completed_at: profile.onboarding_completed_at ?? null,
    cohort_roles: cohortRoles,
    recent_activity: recentActivity,
  };
}

export async function getCohortMembers(cohortId: string) {
  const supabase = await createClient();

  const { data: roles } = await supabase
    .from("cohort_roles")
    .select(
      "user_id, role, granted_at, profiles!cohort_roles_user_id_fkey(full_name, email)",
    )
    .eq("cohort_id", cohortId)
    .order("role", { ascending: true });

  if (!roles) return { teachers: [], assistants: [], students: [] };

  // Segmento por alumno: vive en enrollments (no en cohort_roles). Lo traemos
  // en un solo query y lo cruzamos por student_id. `segment` se agrega en la
  // migración 0024; hasta regenerar los tipos usamos cast localizado.
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("student_id, segment")
    .eq("cohort_id", cohortId);

  const segmentByStudent = new Map<string, "capital_inteligente" | null>(
    ((enrollments ?? []) as unknown as Array<{
      student_id: string;
      segment: "capital_inteligente" | null;
    }>).map((e) => [e.student_id, e.segment ?? null]),
  );

  const members: CohortMember[] = roles.map((r) => {
    const profile = r.profiles as { full_name: string | null; email: string } | null;
    return {
      user_id: r.user_id,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? "",
      role: r.role,
      granted_at: r.granted_at,
      segment: segmentByStudent.get(r.user_id) ?? null,
    };
  });

  return {
    teachers: members.filter((m) => m.role === "teacher"),
    assistants: members.filter((m) => m.role === "assistant"),
    students: members.filter((m) => m.role === "student"),
  };
}

export async function getCohortsForPicker(): Promise<CohortPickerItem[]> {
  const supabase = await createClient();

  const { data: cohorts } = await supabase
    .from("cohorts")
    .select("id, name, code, status, programs(name)")
    .in("status", ["planned", "active"])
    .order("start_date", { ascending: false });

  if (!cohorts) return [];

  return cohorts.map((c) => {
    const program = c.programs as { name: string } | null;
    return {
      id: c.id,
      name: c.name,
      code: c.code,
      status: c.status,
      program_name: program?.name ?? "",
    };
  });
}
