import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Cliente con privilegios de service_role.
 * Usar SOLO en server actions / route handlers / jobs.
 * NUNCA exponer al navegador.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin client requires SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
