import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isValidRut } from "@/lib/utils/rut";

export const runtime = "nodejs";

const completeProfileSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40),
  rut: z.string().trim().refine(isValidRut, "RUT inválido"),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  job_title: z.string().trim().max(120).optional().or(z.literal("")),
  linkedin_url: z.string().url().max(300).optional().or(z.literal("")),
  bio: z.string().trim().max(1000).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  emergency_contact_name: z.string().trim().max(120).optional().or(z.literal("")),
  emergency_contact_phone: z.string().trim().max(40).optional().or(z.literal("")),
  birthday: z.string().optional().or(z.literal("")),
});

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

  const parsed = completeProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
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
    birthday,
  } = parsed.data;

  const emptyToNull = (v: string | undefined) => (v && v.length > 0 ? v : null);

  const updateData: Record<string, unknown> = {
    full_name,
    phone,
    rut,
    company: emptyToNull(company),
    job_title: emptyToNull(job_title),
    linkedin_url: emptyToNull(linkedin_url),
    bio: emptyToNull(bio),
    address: emptyToNull(address),
    emergency_contact_name: emptyToNull(emergency_contact_name),
    emergency_contact_phone: emptyToNull(emergency_contact_phone),
    onboarding_completed_at: new Date().toISOString(),
  };
  if (birthday !== undefined) updateData.birthday = emptyToNull(birthday);

  const { data: profile, error } = await supabase
    .from("profiles")
    .update(updateData as never)
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
