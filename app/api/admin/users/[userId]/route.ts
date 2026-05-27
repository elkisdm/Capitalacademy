import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/types";

export const runtime = "nodejs";

type UpdateUserBody = {
  full_name?: string;
  phone?: string;
  system_role?: "user" | "ops" | "admin";
};

export async function PATCH(
  req: Request,
  props: { params: Promise<{ userId: string }> },
) {
  const { userId } = await props.params;

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

  const { full_name, phone, system_role } = body as UpdateUserBody;

  if (system_role !== undefined && callerProfile.system_role !== "admin") {
    return NextResponse.json(
      { error: "Solo un admin puede cambiar el system_role" },
      { status: 403 },
    );
  }

  const update: TablesUpdate<"profiles"> = {};
  if (full_name !== undefined) update.full_name = full_name;
  if (phone !== undefined) update.phone = phone;
  if (system_role !== undefined) update.system_role = system_role;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No hay campos para actualizar" },
      { status: 422 },
    );
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    console.error("profile update error", error);
    return NextResponse.json(
      { error: "Error al actualizar perfil" },
      { status: 500 },
    );
  }

  if (!profile) {
    return NextResponse.json(
      { error: "Usuario no encontrado" },
      { status: 404 },
    );
  }

  return NextResponse.json(profile);
}
