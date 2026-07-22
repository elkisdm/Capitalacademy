import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isValidRut } from "@/lib/utils/rut";
import { normalizeUrl } from "@/lib/utils/url";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * Campo de texto opcional tolerante: acepta `undefined`, `null` y "" (los tres
 * se tratan como "no enviado"). Antes usábamos `.optional().or(z.literal(""))`,
 * que rechazaba `null` con "Invalid input" y rebotaba todo el form.
 */
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (v == null || v === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

/**
 * LinkedIn opcional: normaliza la URL (agrega https:// si falta) ANTES de
 * validar, para que "linkedin.com/in/foo" no rebote con "Invalid URL".
 */
const optionalUrl = z.preprocess(
  (v) => (v == null || v === "" ? undefined : normalizeUrl(String(v))),
  z.string().url().max(300).optional(),
);

const completeProfileSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40),
  rut: z.string().trim().refine(isValidRut, "RUT inválido"),
  company: optionalText(160),
  job_title: optionalText(120),
  linkedin_url: optionalUrl,
  bio: optionalText(3000),
  address: optionalText(300),
  emergency_contact_name: optionalText(120),
  emergency_contact_phone: optionalText(40),
  birthday: z.preprocess(
    (v) => (v == null || v === "" ? undefined : v),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha inválida").optional(),
  ),
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

  const updateData: Database["public"]["Tables"]["profiles"]["Update"] = {
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
    .update(updateData)
    .eq("id", user.id)
    .select("id, full_name, phone, avatar_url, onboarding_completed_at")
    .single();

  if (error) {
    console.error("complete-profile update error:", error);
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Este RUT ya está registrado en otra cuenta. Contacta a soporte." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Error al actualizar perfil" },
      { status: 500 },
    );
  }

  return NextResponse.json(profile);
}
