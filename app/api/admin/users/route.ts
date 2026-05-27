import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type CreateUserBody = {
  email?: string;
  password?: string;
  full_name?: string;
  phone?: string;
  system_role?: "user" | "ops" | "admin";
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

  const { email, password, full_name, phone, system_role } =
    body as CreateUserBody;

  if (!email || !password) {
    return NextResponse.json(
      { error: "email y password son requeridos" },
      { status: 422 },
    );
  }

  const targetRole = system_role ?? "user";

  if (
    callerProfile.system_role === "ops" &&
    ["ops", "admin"].includes(targetRole)
  ) {
    return NextResponse.json(
      { error: "Solo un admin puede crear usuarios ops o admin" },
      { status: 403 },
    );
  }

  const admin = createAdminClient();

  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    return NextResponse.json(
      { error: authError.message },
      { status: 400 },
    );
  }

  const newUser = authData.user;

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

  return NextResponse.json(profile, { status: 201 });
}
