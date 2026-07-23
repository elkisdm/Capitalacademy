import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInvitationEmail } from "@/lib/email/invitation";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { getPublicBaseUrl } from "@/lib/api/base-url";

export const runtime = "nodejs";

type SendInvitationBody = {
  userId?: string;
};

function buildAppConfirmUrl(
  hashedToken: string,
  emailType: string,
  baseUrl: string,
): string {
  return `${baseUrl}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=${emailType}&next=${encodeURIComponent("/onboarding/set-password")}`;
}

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;
  const user = auth.user;

  const supabase = await createClient();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { userId } = body as SendInvitationBody;

  if (!userId) {
    return NextResponse.json(
      { error: "userId es requerido" },
      { status: 422 },
    );
  }

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .single();

  if (!targetProfile) {
    return NextResponse.json(
      { error: "Usuario no encontrado" },
      { status: 404 },
    );
  }

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("cohort_id, cohorts(name, programs(name))")
    .eq("student_id", userId)
    .eq("status", "active")
    .order("enrolled_at", { ascending: false })
    .limit(1)
    .single();

  const cohortName =
    (enrollment?.cohorts as { name: string } | null)?.name ?? "Sin cohorte";
  const programName =
    (
      (enrollment?.cohorts as { programs: { name: string } | null } | null)
        ?.programs as { name: string } | null
    )?.name ?? "Capital Academy";

  const admin = createAdminClient();
  const baseUrl = getPublicBaseUrl();

  let linkData;

  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.generateLink({
      type: "invite",
      email: targetProfile.email,
      options: {
        redirectTo: `${baseUrl}/onboarding/set-password`,
      },
    });

  if (inviteError) {
    if (inviteError.message.includes("already been registered")) {
      const { data: recoveryData, error: recoveryError } =
        await admin.auth.admin.generateLink({
          type: "recovery",
          email: targetProfile.email,
          options: {
            redirectTo: `${baseUrl}/onboarding/set-password`,
          },
        });

      if (recoveryError) {
        return NextResponse.json(
          { error: `Error al generar enlace: ${recoveryError.message}` },
          { status: 500 },
        );
      }
      linkData = recoveryData;
    } else {
      return NextResponse.json(
        { error: `Error al generar enlace de invitación: ${inviteError.message}` },
        { status: 500 },
      );
    }
  } else {
    linkData = inviteData;
  }

  const hashedToken = linkData.properties.hashed_token;
  const emailType = linkData.properties.verification_type ?? "invite";
  const inviteUrl = buildAppConfirmUrl(hashedToken, emailType, baseUrl);

  const emailResult = await sendInvitationEmail({
    email: targetProfile.email,
    fullName: targetProfile.full_name ?? targetProfile.email,
    inviteUrl,
    programName,
    cohortName,
  });

  if (!emailResult.success) {
    return NextResponse.json(
      { error: `Error al enviar email: ${emailResult.error}` },
      { status: 500 },
    );
  }

  await admin
    .from("invitation_log")
    .insert({
      user_id: userId,
      sent_by: user.id,
      sent_at: new Date().toISOString(),
      email: targetProfile.email,
    })
    .then(({ error }) => {
      if (error) console.error("invitation_log insert failed:", error);
    });

  return NextResponse.json({ success: true });
}
