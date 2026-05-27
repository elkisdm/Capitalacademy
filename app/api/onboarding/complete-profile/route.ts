import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidRut } from "@/lib/utils/rut";

export const runtime = "nodejs";

type CompleteProfileBody = {
  full_name?: string;
  phone?: string;
  rut?: string;
  company?: string;
  job_title?: string;
  linkedin_url?: string;
  bio?: string;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
};

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const {
    full_name,
    phone,
    rut,
    company,
    job_title,
    linkedin_url,
    bio,
    address,
    emergency_contact_name,
    emergency_contact_phone,
  } = body as CompleteProfileBody;

  if (!full_name || !phone || !rut) {
    return NextResponse.json(
      { error: "full_name, phone y rut son requeridos" },
      { status: 422 },
    );
  }

  if (!isValidRut(rut)) {
    return NextResponse.json(
      { error: "RUT inválido" },
      { status: 422 },
    );
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .update({
      full_name,
      phone,
      rut,
      company: company ?? null,
      job_title: job_title ?? null,
      linkedin_url: linkedin_url ?? null,
      bio: bio ?? null,
      address: address ?? null,
      emergency_contact_name: emergency_contact_name ?? null,
      emergency_contact_phone: emergency_contact_phone ?? null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    console.error("complete-profile update error:", error);
    return NextResponse.json(
      { error: "Error al actualizar perfil" },
      { status: 500 },
    );
  }

  return NextResponse.json(profile);
}
