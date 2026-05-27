import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInvitationEmail } from "@/lib/email/invitation";

export const runtime = "nodejs";
export const maxDuration = 60;

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
  "https://capitalacademy.cl";

type BulkRow = {
  email: string;
  full_name: string;
  phone?: string;
  rut?: string;
};

type BulkRequest = {
  rows: BulkRow[];
  cohort_id: string;
  send_invitations: boolean;
};

type RowError = { row: number; email: string; reason: string };

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", user.id)
    .single();

  if (!callerProfile || !["ops", "admin"].includes(callerProfile.system_role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { rows, cohort_id, send_invitations } = body as BulkRequest;

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json(
      { error: "rows es requerido y no puede estar vacío" },
      { status: 422 },
    );
  }

  if (rows.length > 50) {
    return NextResponse.json(
      { error: "Máximo 50 filas por solicitud" },
      { status: 422 },
    );
  }

  if (!cohort_id) {
    return NextResponse.json(
      { error: "cohort_id es requerido" },
      { status: 422 },
    );
  }

  const admin = createAdminClient();

  const { data: cohort } = await admin
    .from("cohorts")
    .select("name, programs(name)")
    .eq("id", cohort_id)
    .single();

  if (!cohort) {
    return NextResponse.json(
      { error: "Cohorte no encontrada" },
      { status: 404 },
    );
  }

  const cohortName = cohort.name;
  const programName =
    (cohort.programs as { name: string } | null)?.name ?? "Capital Academy";

  let created = 0;
  let assigned = 0;
  const errors: RowError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    if (!row.email || !row.full_name) {
      errors.push({
        row: rowNum,
        email: row.email ?? "",
        reason: "email y full_name son requeridos",
      });
      continue;
    }

    try {
      const { data: existingByEmail } = await admin
        .from("profiles")
        .select("id")
        .eq("email", row.email)
        .maybeSingle();

      let targetUserId: string;

      if (existingByEmail) {
        targetUserId = existingByEmail.id;
      } else {
        const { data: linkData, error: linkError } =
          await admin.auth.admin.generateLink({
            type: "invite",
            email: row.email,
            options: {
              redirectTo: `${BASE_URL}/onboarding/set-password`,
            },
          });

        if (linkError) {
          errors.push({ row: rowNum, email: row.email, reason: linkError.message });
          continue;
        }

        targetUserId = linkData.user.id;

        const { error: profileError } = await admin.from("profiles").upsert({
          id: targetUserId,
          email: row.email,
          full_name: row.full_name,
          phone: row.phone ?? null,
          system_role: "user",
        });

        if (profileError) {
          errors.push({
            row: rowNum,
            email: row.email,
            reason: `Perfil: ${profileError.message}`,
          });
          continue;
        }

        created++;

        if (send_invitations) {
          await sendInvitationEmail({
            email: row.email,
            fullName: row.full_name,
            inviteUrl: linkData.properties.action_link,
            programName,
            cohortName,
          });
        }
      }

      const { error: enrollmentError } = await admin.from("enrollments").upsert(
        {
          student_id: targetUserId,
          cohort_id,
          status: "active",
        },
        { onConflict: "student_id,cohort_id" },
      );

      if (enrollmentError) {
        errors.push({
          row: rowNum,
          email: row.email,
          reason: `Enrollment: ${enrollmentError.message}`,
        });
        continue;
      }

      const { error: roleError } = await admin.from("cohort_roles").upsert(
        {
          user_id: targetUserId,
          cohort_id,
          role: "student" as const,
          granted_by: user.id,
        },
        { onConflict: "user_id,cohort_id" },
      );

      if (roleError) {
        errors.push({
          row: rowNum,
          email: row.email,
          reason: `Rol: ${roleError.message}`,
        });
        continue;
      }

      assigned++;
    } catch (err) {
      errors.push({
        row: rowNum,
        email: row.email,
        reason: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  return NextResponse.json({ created, assigned, errors });
}
