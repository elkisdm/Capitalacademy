import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInvitationEmail } from "@/lib/email/invitation";

export const runtime = "nodejs";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
  "https://capitalacademy.cl";

type SendInvitationBody = {
  userId?: string;
};

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

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "invite",
      email: targetProfile.email,
      options: {
        redirectTo: `${BASE_URL}/onboarding/set-password`,
      },
    });

  if (linkError) {
    return NextResponse.json(
      { error: `Error al generar enlace de invitación: ${linkError.message}` },
      { status: 500 },
    );
  }

  const inviteUrl = linkData.properties.action_link;

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
