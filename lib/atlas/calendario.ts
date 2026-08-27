/**
 * Contrato contra el endpoint de calendario de Atlas (ADR-0039).
 *
 * Atlas es quien habla con Google: tiene la Service Account con delegación sobre
 * el dominio y la firma de la aserción. Acá NUNCA entra esa llave privada — una
 * copia más de una credencial con ese alcance es riesgo puro y cero beneficio.
 *
 * Todo lo que vuelve está tipado de forma defensiva: es un contrato de otro repo
 * que puede cambiar sin avisarnos.
 */

/** El buzón cuyo calendario recibe la reunión. Atlas además lo valida contra su
    propia lista blanca; acá se declara para no mandarlo desde la UI. */
export const BUZON_REUNIONES = "pvicuna@capitalinteligente.cl";

export type EventoCreado = {
  eventId: string;
  meetUrl: string | null;
  htmlLink: string | null;
  /** true si el evento ya existía: un reintento no duplicó nada. */
  yaExistia: boolean;
};

/** Falla del contrato con Atlas, con el motivo ya legible para la UI. */
export class AtlasCalendarError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "AtlasCalendarError";
  }
}

function config(): { url: string; key: string } {
  const url = process.env.ATLAS_API_URL;
  const key = process.env.ATLAS_API_KEY;
  if (!url || !key) {
    throw new AtlasCalendarError(
      "Falta configurar ATLAS_API_URL o ATLAS_API_KEY",
      null,
    );
  }
  return { url: url.replace(/\/$/, ""), key };
}

/**
 * El id del evento en Google a partir del id de la tarea.
 *
 * Google exige base32hex: solo `a-v` y `0-9`. Un UUID en hex sin guiones usa
 * `0-9a-f`, que es subconjunto — así que sirve tal cual y además hace la
 * creación idempotente: reintentar con la misma tarea apunta al mismo evento y
 * Google responde 409 en vez de crear un duplicado.
 */
export function eventIdParaTarea(taskId: string): string {
  return taskId.replace(/-/g, "").toLowerCase();
}

/** Fin de la reunión, a partir del inicio y la duración. */
export function finDeReunion(startIso: string, durationMinutes: number): string {
  return new Date(new Date(startIso).getTime() + durationMinutes * 60_000).toISOString();
}

async function pedir(path: string, init: RequestInit): Promise<unknown> {
  const { url, key } = config();
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "X-API-Key": key, ...init.headers },
    });
  } catch (err) {
    // Atlas inalcanzable. Se distingue del rechazo a propósito: el llamador
    // guarda igual la tarea y la marca como no agendada.
    throw new AtlasCalendarError(
      `No se pudo contactar a Atlas: ${err instanceof Error ? err.message : String(err)}`,
      null,
    );
  }

  const cuerpo = (await res.json().catch(() => null)) as { detail?: string } | null;
  if (!res.ok) {
    throw new AtlasCalendarError(
      cuerpo?.detail ?? `Atlas respondió ${res.status}`,
      res.status,
    );
  }
  return cuerpo;
}

/** Crea la reunión en el calendario de la profesora e invita al lead. */
export async function crearReunion(input: {
  taskId: string;
  titulo: string;
  inicioIso: string;
  duracionMinutos: number;
  correoInvitado: string;
  descripcion?: string | null;
}): Promise<EventoCreado> {
  const data = (await pedir("/calendar/events", {
    method: "POST",
    body: JSON.stringify({
      mailbox: BUZON_REUNIONES,
      event_id: eventIdParaTarea(input.taskId),
      summary: input.titulo,
      start_iso: input.inicioIso,
      end_iso: finDeReunion(input.inicioIso, input.duracionMinutos),
      attendee_email: input.correoInvitado,
      description: input.descripcion ?? null,
    }),
  })) as Record<string, unknown> | null;

  return {
    eventId: String(data?.event_id ?? eventIdParaTarea(input.taskId)),
    meetUrl: typeof data?.meet_url === "string" ? data.meet_url : null,
    htmlLink: typeof data?.html_link === "string" ? data.html_link : null,
    yaExistia: data?.already_existed === true,
  };
}

/**
 * Cancela la reunión y avisa al invitado.
 *
 * Devuelve `false` si el evento ya no estaba en Google, que para el llamador es
 * éxito: el objetivo era que no ocupara la agenda, y no la ocupa.
 */
export async function cancelarReunion(eventId: string): Promise<boolean> {
  const data = (await pedir(
    `/calendar/events/${encodeURIComponent(eventId)}?mailbox=${encodeURIComponent(BUZON_REUNIONES)}`,
    { method: "DELETE" },
  )) as Record<string, unknown> | null;
  return data?.deleted === true;
}
