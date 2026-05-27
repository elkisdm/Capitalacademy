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
