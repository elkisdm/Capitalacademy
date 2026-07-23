import { createAdminClient } from "@/lib/supabase/admin";

// 1 hora para páginas (el usuario recarga y obtiene una URL fresca)
export const CERT_URL_EXPIRY_DISPLAY = 3_600;
// 5 años para el correo de emisión (el alumno hace clic semanas o meses después)
export const CERT_URL_EXPIRY_EMAIL = 157_680_000;

export async function getCertificateSignedUrl(
  storagePath: string | null | undefined,
  expiresIn = CERT_URL_EXPIRY_DISPLAY,
): Promise<string | null> {
  if (!storagePath) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from("certificates")
    .createSignedUrl(storagePath, expiresIn);
  if (error) console.error("[getCertificateSignedUrl] firma fallida", storagePath, error);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
