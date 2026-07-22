import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isValidRut } from "@/lib/utils/rut";
import { normalizeUrl } from "@/lib/utils/url";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * Actualización PARCIAL del perfil desde /classroom/profile (editor inline
 * campo por campo). A diferencia de /api/onboarding/complete-profile, aquí
 * full_name/phone/rut son OPCIONALES: un staff/ops sin onboardear tiene esos
 * campos en NULL y debe poder editar cualquier otro campo sin que el backend
 * exija identidad completa.
 */

/** Etiquetas legibles por campo para traducir errores de validación al español. */
const FIELD_LABELS: Record<string, string> = {
  full_name: "Nombre",
  phone: "Teléfono",
  rut: "RUT",
  company: "Empresa",
  job_title: "Cargo",
  linkedin_url: "LinkedIn",
  bio: "Bio",
  address: "Dirección",
  emergency_contact_name: "Contacto de emergencia",
  emergency_contact_phone: "Teléfono de emergencia",
  birthday: "Cumpleaños",
};

/** Traduce un issue de Zod a un mensaje en español, basado en `issue.code` (no en `issue.message`, que viene en inglés). */
function translateIssue(issue: z.core.$ZodIssue): string {
  const field = issue.path.join(".");
  const label = FIELD_LABELS[field] ?? field;

  switch (issue.code) {
    case "too_big": {
      const max = "maximum" in issue ? issue.maximum : undefined;
      return max !== undefined
        ? `${label}: máximo ${max} caracteres`
        : `${label}: valor inválido`;
    }
    case "too_small": {
      const min = "minimum" in issue ? issue.minimum : undefined;
      return min !== undefined
        ? `${label}: mínimo ${min} caracteres`
        : `${label}: valor inválido`;
    }
    case "invalid_format":
      return `${label}: debe ser un enlace válido`;
    case "custom":
      return `${label}: ${issue.message}`;
    default:
      return `${label}: valor inválido`;
  }
}

/** Identidad (full_name/phone/rut): "" o null → "no enviado" (no nulea). */
const identityText = (min: number, max: number) =>
  z.preprocess(
    (v) => (v == null || v === "" ? undefined : v),
    z.string().trim().min(min).max(max).optional(),
  );

/** Texto opcional: "" o null → null (permite limpiar el campo). */
const nullableText = (max: number) =>
  z.preprocess(
    (v) => (v == null || v === "" ? null : v),
    z.string().trim().max(max).nullable(),
  );

const profileUpdateSchema = z.object({
  full_name: identityText(2, 120),
  phone: identityText(6, 40),
  rut: z.preprocess(
    (v) => (v == null || v === "" ? undefined : v),
    z.string().trim().refine(isValidRut, "RUT inválido").optional(),
  ),
  company: nullableText(160),
  job_title: nullableText(120),
  linkedin_url: z.preprocess(
    (v) => (v == null || v === "" ? null : normalizeUrl(String(v))),
    z.string().url().max(300).nullable(),
  ),
  bio: nullableText(3000),
  address: nullableText(300),
  emergency_contact_name: nullableText(120),
  emergency_contact_phone: nullableText(40),
  birthday: z.preprocess(
    (v) => (v == null || v === "" ? null : v),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha inválida").nullable(),
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

  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const message = firstIssue ? translateIssue(firstIssue) : "Validación fallida";
    return NextResponse.json(
      { error: message, issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const rawKeys = new Set(
    Object.keys(body as Record<string, unknown>),
  );
  const parsedData = parsed.data as Record<string, unknown>;

  const updateData: Record<string, unknown> = {};
  for (const col of Object.keys(profileUpdateSchema.shape)) {
    if (rawKeys.has(col) && parsedData[col] !== undefined) {
      updateData[col] = parsedData[col];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "No hay campos para actualizar" },
      { status: 422 },
    );
  }

  const { error } = await supabase
    .from("profiles")
    // updateData se arma dinámicamente (bracket notation por columna) desde el
    // schema, por lo que TS no puede verificar la forma estáticamente.
    .update(updateData as Database["public"]["Tables"]["profiles"]["Update"])
    .eq("id", user.id);

  if (error) {
    console.error("classroom profile update error:", error);
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

  return NextResponse.json({ ok: true });
}
