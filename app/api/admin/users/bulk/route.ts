import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInvitationEmail } from "@/lib/email/invitation";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";

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
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;
  const user = auth.user;

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

  // --- Pre-validate rows -----------------------------------------------------
  const validRows: Array<{ index: number; row: BulkRow }> = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.email || !row.full_name) {
      errors.push({
        row: i + 1,
        email: row.email ?? "",
        reason: "email y full_name son requeridos",
      });
    } else {
      validRows.push({ index: i, row });
    }
  }

  // --- Batch lookup: fetch ALL existing profiles by email in ONE query --------
  const allEmails = validRows.map((v) => v.row.email);
  const { data: existingProfiles } = await admin
    .from("profiles")
    .select("id, email")
    .in("email", allEmails);

  const profileByEmail = new Map(
    (existingProfiles ?? []).map((p) => [p.email, p.id]),
  );

  // --- Process each row (auth API calls can't be batched) --------------------
  // Collect successful enrollments and roles for batch upsert after the loop
  const enrollmentsToUpsert: Array<{
    student_id: string;
    cohort_id: string;
    status: "active";
  }> = [];
  const rolesToUpsert: Array<{
    user_id: string;
    cohort_id: string;
    role: "student";
    granted_by: string;
  }> = [];
  const profilesToUpsert: Array<{
    id: string;
    email: string;
    full_name: string;
    phone: string | null;
    system_role: "user";
  }> = [];

  // Track which rows succeeded through the auth phase
  const succeededUserIds: Array<{ rowIndex: number; userId: string }> = [];

  for (const { index, row } of validRows) {
    const rowNum = index + 1;

    try {
      const existingId = profileByEmail.get(row.email);

      if (existingId) {
        succeededUserIds.push({ rowIndex: index, userId: existingId });
      } else {
        // Auth API call — cannot be batched
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

        const targetUserId = linkData.user.id;

        profilesToUpsert.push({
          id: targetUserId,
          email: row.email,
          full_name: row.full_name,
          phone: row.phone ?? null,
          system_role: "user",
        });

        created++;
        succeededUserIds.push({ rowIndex: index, userId: targetUserId });

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
    } catch (err) {
      errors.push({
        row: rowNum,
        email: row.email,
        reason: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  // --- Batch upsert: profiles ------------------------------------------------
  if (profilesToUpsert.length > 0) {
    const { error: profileError } = await admin
      .from("profiles")
      .upsert(profilesToUpsert);

    if (profileError) {
      // If batch profile upsert fails, all new users are affected
      for (const p of profilesToUpsert) {
        errors.push({
          row:
            validRows.find((v) => v.row.email === p.email)!.index + 1,
          email: p.email,
          reason: `Perfil: ${profileError.message}`,
        });
      }
      // Remove failed users from succeededUserIds
      const failedEmails = new Set(profilesToUpsert.map((p) => p.email));
      const filteredSucceeded = succeededUserIds.filter(
        ({ rowIndex }) => !failedEmails.has(rows[rowIndex].email),
      );
      succeededUserIds.length = 0;
      succeededUserIds.push(...filteredSucceeded);
      created = 0;
    }
  }

  // --- Batch upsert: enrollments and roles -----------------------------------
  for (const { userId } of succeededUserIds) {
    enrollmentsToUpsert.push({
      student_id: userId,
      cohort_id,
      status: "active",
    });
    rolesToUpsert.push({
      user_id: userId,
      cohort_id,
      role: "student" as const,
      granted_by: user.id,
    });
  }

  if (enrollmentsToUpsert.length > 0) {
    const { error: enrollmentError } = await admin
      .from("enrollments")
      .upsert(enrollmentsToUpsert, { onConflict: "student_id,cohort_id" });

    if (enrollmentError) {
      for (const { rowIndex } of succeededUserIds) {
        errors.push({
          row: rowIndex + 1,
          email: rows[rowIndex].email,
          reason: `Enrollment: ${enrollmentError.message}`,
        });
      }
      return NextResponse.json({ created, assigned: 0, errors });
    }
  }

  if (rolesToUpsert.length > 0) {
    const { error: roleError } = await admin
      .from("cohort_roles")
      .upsert(rolesToUpsert, { onConflict: "user_id,cohort_id,role" });

    if (roleError) {
      for (const { rowIndex } of succeededUserIds) {
        errors.push({
          row: rowIndex + 1,
          email: rows[rowIndex].email,
          reason: `Rol: ${roleError.message}`,
        });
      }
      return NextResponse.json({ created, assigned: 0, errors });
    }
  }

  assigned = succeededUserIds.length;

  return NextResponse.json({ created, assigned, errors });
}
