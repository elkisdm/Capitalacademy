import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

const DIPLOMADO_PROGRAM_CODE = "DIP-VENTAS";

/** Fecha de hoy (YYYY-MM-DD) en America/Santiago. */
function todaySantiagoISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Formatea una fecha ISO (YYYY-MM-DD) en español, ej: "Sábado 20 de junio". */
function formatCohortStart(startDate: string): string {
  const d = new Date(`${startDate}T12:00:00-04:00`);
  const formatted = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Santiago",
  }).format(d);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/**
 * Fecha de inicio de la PRÓXIMA cohorte (futura) del Diplomado, formateada en
 * español (ej: "Sábado 20 de junio"), leída en vivo desde `cohorts`.
 *
 * Devuelve null si no hay ninguna cohorte con fecha futura registrada — la
 * UI debe usar un fallback genérico ("Próxima cohorte abierta") en ese caso.
 * Al filtrar por `start_date > hoy` en cada consulta, esta fecha NUNCA puede
 * quedar vencida: si la cohorte ya inició, deja de calificar automáticamente.
 */
async function fetchDiplomadoNextCohortDate(): Promise<string | null> {
  try {
    const supabase = createAdminClient();

    const { data: program } = await supabase
      .from("programs")
      .select("id")
      .eq("code", DIPLOMADO_PROGRAM_CODE)
      .maybeSingle();
    if (!program) return null;

    const { data: cohort } = await supabase
      .from("cohorts")
      .select("start_date")
      .eq("program_id", program.id)
      .gt("start_date", todaySantiagoISO())
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!cohort) return null;

    return formatCohortStart(cohort.start_date);
  } catch {
    // Si Supabase falla (env vars, red, etc.), degrada al fallback genérico
    // en vez de romper el render de la landing.
    return null;
  }
}

/** Cacheado 1h: evita pegarle a la base de datos en cada request de la landing. */
export const getDiplomadoNextCohortDate = unstable_cache(
  fetchDiplomadoNextCohortDate,
  ["landing-diplomado-next-cohort"],
  { revalidate: 3600 },
);
