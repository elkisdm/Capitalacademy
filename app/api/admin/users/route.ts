import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";

export const runtime = "nodejs";

type CreateUserBody = {
  email?: string;
  full_name?: string;
  phone?: string;
  system_role?: "user" | "ops" | "admin";
};

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
  "https://capitalacademy.cl";

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

  const { email, full_name, phone, system_role } = body as CreateUserBody;

  if (!email) {
    return NextResponse.json(
      { error: "email es requerido" },
      { status: 422 },
    );
  }

  const targetRole = system_role ?? "user";

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

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo: `${BASE_URL}/onboarding/set-password`,
      },
    });

  if (linkError) {
    return NextResponse.json(
      { error: linkError.message },
      { status: 400 },
    );
  }

  const newUser = linkData.user;
  const inviteUrl = linkData.properties.action_link;

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

  return NextResponse.json({ ...profile, invite_url: inviteUrl }, { status: 201 });
}
