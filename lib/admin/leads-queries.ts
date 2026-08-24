/**
 * Lectura del panel de leads (`/admin/leads`).
 *
 * `leads` tiene RLS sin policy de SELECT (solo escribe la API pública con
 * service_role), así que la lectura va con `createAdminClient`. El caller
 * (la página) valida sesión y el gating de rol lo hace
 * `app/(admin)/layout.tsx`, mismo patrón que `student-panel-queries.ts`.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type LeadRow = {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  phone: string;
  role: string | null;
  company: string | null;
  program_interest: string;
  message: string | null;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  lidera_equipo: string | null;
  personas_a_cargo: string | null;
  desafios: string[] | null;
};

/** Todos los leads, los más recientes primero. El volumen es de decenas por
    mes: filtrar y buscar se resuelve en el cliente, como en `/admin/alumnos`. */
export async function getAllLeads(): Promise<LeadRow[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, created_at, full_name, email, phone, role, company, program_interest, message, source, utm_source, utm_medium, utm_campaign, utm_content, lidera_equipo, personas_a_cargo, desafios",
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as LeadRow[];
}
