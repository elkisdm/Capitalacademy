/**
 * Lectura del panel de leads (`/admin/leads`).
 *
 * `leads` tiene RLS sin policy de SELECT (solo escribe la API pública con
 * service_role), así que la lectura va con `createAdminClient`. El caller
 * (la página) valida sesión y el gating de rol lo hace
 * `app/(admin)/layout.tsx`, mismo patrón que `student-panel-queries.ts`.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  toLeadStage,
  tareasPorAvisar,
  type LeadStage,
  type LeadActivityKind,
  type LeadCallOutcome,
} from "@/lib/admin/leads-pipeline";

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
  stage: LeadStage;
};

/** Todos los leads, los más recientes primero. El volumen es de decenas por
    mes: filtrar y buscar se resuelve en el cliente, como en `/admin/alumnos`. */
export async function getAllLeads(): Promise<LeadRow[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, created_at, full_name, email, phone, role, company, program_interest, message, source, utm_source, utm_medium, utm_campaign, utm_content, lidera_equipo, personas_a_cargo, desafios, stage",
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  // La etapa pasa por `toLeadStage` para que el resto de la aplicación la
  // reciba ya tipada: la columna es `text` con CHECK, no un enum de Postgres.
  return (data ?? []).map((row) => ({
    ...row,
    stage: toLeadStage((row as { stage?: unknown }).stage),
  })) as LeadRow[];
}

/**
 * Tamaño de página al recorrer una tabla completa.
 *
 * PostgREST corta la respuesta en `db-max-rows` (1000 en Supabase) SIN AVISAR:
 * pedir "todo" y recibir 1000 filas es indistinguible de que hubiera
 * exactamente 1000. En `leads` no importa (una fila por persona), pero
 * `lead_activity` crece por interacción y pasa ese techo en un par de campañas.
 * Cuando eso ocurra, la bitácora vieja desaparecería de la pantalla y el XLSX
 * diría "Sin contactar" de gente a la que sí se llamó.
 */
const PAGINA = 1000;

/**
 * Techo duro de filas por consulta.
 *
 * Existe para que esto no se convierta en una carga sin fondo el día que la
 * bitácora sea enorme. Si se alcanza, se avisa por consola en vez de truncar en
 * silencio: el objetivo es que la próxima persona vea el problema, no que la
 * pantalla mienta.
 */
const TECHO = 20_000;

/**
 * Recorre una tabla por páginas hasta agotarla o llegar al techo.
 *
 * `fetchPage` recibe el rango y devuelve la página. Se detiene en cuanto una
 * página viene incompleta, así que en el volumen actual es UNA sola consulta.
 */
async function traerTodo<T>(
  etiqueta: string,
  fetchPage: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const acumulado: T[] = [];

  while (acumulado.length < TECHO) {
    const desde = acumulado.length;
    const { data, error } = await fetchPage(desde, desde + PAGINA - 1);
    if (error) throw error;

    const pagina = data ?? [];
    acumulado.push(...pagina);
    if (pagina.length < PAGINA) return acumulado;
  }

  console.error(
    `[leads] ${etiqueta} alcanzó el techo de ${TECHO} filas; la vista está incompleta.`,
  );
  return acumulado;
}

export type LeadActivityRow = {
  id: string;
  lead_id: string;
  kind: LeadActivityKind;
  outcome: LeadCallOutcome | null;
  body: string | null;
  created_at: string;
  created_by: string | null;
  author_name: string | null;
};

export type LeadTaskRow = {
  id: string;
  lead_id: string;
  title: string;
  due_at: string;
  done_at: string | null;
  created_at: string;
  created_by: string | null;
};

type AuthorJoin = { full_name: string | null } | { full_name: string | null }[] | null;

/** El join de PostgREST llega como objeto o como arreglo según la cardinalidad
    que infiera; se normaliza acá para no repetir el desarme en cada caller. */
function authorName(profiles: AuthorJoin): string | null {
  if (!profiles) return null;
  const one = Array.isArray(profiles) ? profiles[0] : profiles;
  return one?.full_name ?? null;
}

/**
 * Toda la bitácora de contacto, de todos los leads.
 *
 * Se trae completa y se agrupa en el cliente por la misma razón que los leads:
 * el volumen es de decenas de leads con un puñado de registros cada uno, y así
 * el detalle del panel abre sin ir al servidor al seleccionar una fila.
 */
export async function getAllLeadActivity(): Promise<LeadActivityRow[]> {
  const supabase = createAdminClient();

  const data = await traerTodo("lead_activity", (desde, hasta) =>
    supabase
      .from("lead_activity")
      .select("id, lead_id, kind, outcome, body, created_at, created_by, profiles(full_name)")
      .order("created_at", { ascending: false })
      .range(desde, hasta),
  );

  return data.map((row) => {
    const { profiles, ...rest } = row as typeof row & { profiles: AuthorJoin };
    return { ...rest, author_name: authorName(profiles) } as LeadActivityRow;
  });
}

/** Todas las tareas, de todos los leads, la más próxima a vencer primero. */
export async function getAllLeadTasks(): Promise<LeadTaskRow[]> {
  const supabase = createAdminClient();

  const data = await traerTodo("lead_tasks", (desde, hasta) =>
    supabase
      .from("lead_tasks")
      .select("id, lead_id, title, due_at, done_at, created_at, created_by")
      .order("due_at", { ascending: true })
      .range(desde, hasta),
  );

  return data as LeadTaskRow[];
}

export type DigestTask = {
  id: string;
  title: string;
  due_at: string;
  lead_id: string;
  lead_name: string;
  urgency: "vencida" | "hoy";
};

/** Una persona con tareas que avisarle y sus tareas ya ordenadas. */
export type DigestRecipient = {
  email: string;
  full_name: string | null;
  tasks: DigestTask[];
};

/**
 * Las tareas del digest diario, agrupadas por la persona que las creó.
 *
 * Filtra en la base solo lo grueso (pendientes que ya vencieron o vencen dentro
 * de las próximas 24 h) y deja el corte fino de "vencida u hoy" a
 * `tareasPorAvisar`, que razona en días calendario de Chile. La base no sabe de
 * la zona horaria de quien gestiona; el módulo puro sí, y es el mismo que usa
 * la franja del panel — así el correo y la pantalla nunca se contradicen.
 *
 * Una tarea sin `created_by` (su autor borró la cuenta) no tiene a quién
 * avisarle y queda fuera: sigue visible en el panel, que es donde alguien la
 * puede retomar.
 */
export async function getTasksForDigest(
  ahora: Date = new Date(),
): Promise<DigestRecipient[]> {
  const supabase = createAdminClient();

  const horizonte = new Date(ahora.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("lead_tasks")
    .select("id, title, due_at, done_at, lead_id, created_by, leads(full_name), profiles(email, full_name)")
    .is("done_at", null)
    .lte("due_at", horizonte)
    .order("due_at", { ascending: true });

  if (error) throw error;

  type Joined = {
    id: string;
    title: string;
    due_at: string;
    done_at: string | null;
    lead_id: string;
    created_by: string | null;
    leads: { full_name: string | null } | { full_name: string | null }[] | null;
    profiles: { email: string; full_name: string | null } | { email: string; full_name: string | null }[] | null;
  };

  const porAvisar = tareasPorAvisar((data ?? []) as Joined[], ahora);

  const porPersona = new Map<string, DigestRecipient>();

  for (const task of porAvisar) {
    const perfil = Array.isArray(task.profiles) ? task.profiles[0] : task.profiles;
    if (!perfil?.email) continue;

    const lead = Array.isArray(task.leads) ? task.leads[0] : task.leads;

    const actual = porPersona.get(perfil.email) ?? {
      email: perfil.email,
      full_name: perfil.full_name ?? null,
      tasks: [],
    };

    actual.tasks.push({
      id: task.id,
      title: task.title,
      due_at: task.due_at,
      lead_id: task.lead_id,
      lead_name: lead?.full_name ?? "Lead sin nombre",
      urgency: task.urgency,
    });

    porPersona.set(perfil.email, actual);
  }

  return [...porPersona.values()];
}
