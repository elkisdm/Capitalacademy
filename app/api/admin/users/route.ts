import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { sendInvitationEmail } from "@/lib/email/invitation";

export const runtime = "nodejs";

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  full_name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  system_role: z.enum(["user", "ops", "admin"]).default("user"),
  cohort_id: z.string().uuid().optional(),
  send_invite: z.boolean().default(false),
});

function getBaseUrl(req: Request): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  const host = req.headers.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();

  // Need caller's specific system_role for admin-only guard
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", auth.user.id)
    .single();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { email, full_name, phone, system_role, cohort_id, send_invite } =
    parsed.data;

  const targetRole = system_role;

  if (
    callerProfile?.system_role === "ops" &&
    ["ops", "admin"].includes(targetRole)
  ) {
    return NextResponse.json(
      { error: "Solo un admin puede crear usuarios ops o admin" },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const baseUrl = getBaseUrl(req);

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo: `${baseUrl}/onboarding/set-password`,
      },
    });

  if (linkError) {
    return NextResponse.json(
      { error: linkError.message },
      { status: 400 },
    );
  }

  const newUser = linkData.user;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .upsert({
      id: newUser.id,
      email,
      full_name: full_name ?? null,
      phone: phone ?? null,
      system_role: targetRole,
    })
    .select()
    .single();

  if (profileError) {
    console.error("profile upsert error", profileError);
    return NextResponse.json(
      { error: "Usuario creado en auth pero falló el perfil" },
      { status: 500 },
    );
  }

  if (cohort_id) {
    await admin
      .from("cohort_roles")
      .upsert(
        { user_id: newUser.id, cohort_id, role: "student", granted_by: auth.user.id },
        { onConflict: "user_id,cohort_id,role" },
      );

    await admin
      .from("enrollments")
      .upsert(
        { student_id: newUser.id, cohort_id, status: "active" },
        { onConflict: "student_id,cohort_id" },
      );
  }

  if (send_invite) {
    const hashedToken = linkData.properties.hashed_token;
    const emailType = linkData.properties.verification_type ?? "invite";
    const inviteUrl = `${baseUrl}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=${emailType}&next=${encodeURIComponent("/onboarding/set-password")}`;

    let programName = "Capital Academy";
    let cohortName = "Sin cohorte";

    if (cohort_id) {
      const { data: cohort } = await admin
        .from("cohorts")
        .select("name, programs(name)")
        .eq("id", cohort_id)
        .single();
      if (cohort) {
        cohortName = cohort.name;
        programName = (cohort.programs as { name: string } | null)?.name ?? programName;
      }
    }

    await sendInvitationEmail({
      email,
      fullName: full_name ?? email,
      inviteUrl,
      programName,
      cohortName,
    });

    await admin
      .from("invitation_log")
      .insert({
        user_id: newUser.id,
        sent_by: auth.user.id,
        sent_at: new Date().toISOString(),
        email,
      })
      .then(({ error: logErr }) => {
        if (logErr) console.error("invitation_log insert failed:", logErr);
      });
  }

  return NextResponse.json(profile, { status: 201 });
}
