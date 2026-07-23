import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/redirects";

/**
 * Solo POST a propósito: un signout por GET lo dispararía el prefetch del
 * navegador o un escáner de enlaces, cerrando la sesión sin que nadie lo pida.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const next = safeNextPath(form?.get("next")?.toString(), "");

  const supabase = await createClient();
  await supabase.auth.signOut();

  // Al salir para volver a entrar con otra cuenta (p. ej. desde el check-in de
  // asistencia), el destino se conserva para no perder la clase de vista.
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}
