import type { SupabaseClient } from "@supabase/supabase-js";
import {
  startRoomComposite,
  stopEgress,
  getEgressStorageConfig,
  isEgressEnabled,
  EgressNotConfiguredError,
  EgressRequestError,
  type EgressStorageConfig,
} from "@/lib/livekit/egress";
import {
  getLiveKitConfig,
  LiveKitNotConfiguredError,
  type LiveKitConfig,
} from "@/lib/livekit/config";
import { estadoDesdeEgress, filePathFor } from "@/lib/livekit/egress-estado";

/**
 * Arranque de la grabación de una clase, compartido por sus DOS disparadores
 * (ADR-0034 y su enmienda): el botón del docente y el webhook de LiveKit, que
 * la enciende cuando entra el primer participante.
 *
 * Vive acá y no en la ruta porque la parte delicada no es empezar a grabar sino
 * la coreografía de la reserva: entre que se pide StartEgress y responde pasan
 * uno a tres segundos en los que el docente puede haber pulsado "Detener" o el
 * webhook `egress_started` puede haber adelantado la fila. Duplicar eso en dos
 * llamadores es garantizar que diverjan, y que diverjan justo donde el síntoma
 * es una clase sin grabar o dos Chrome grabando la misma sala.
 */
export const COLUMNAS_FILA =
  "id, status, egress_id, started_at, ended_at, duration_seconds, error";

export type FilaGrabacion = {
  id: string;
  status: string;
  egress_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  error: string | null;
};

/**
 * Estados que significan "esta clase YA tiene su grabación": o se completó, o
 * alguien la detuvo a mano (el DELETE deja la fila en `uploaded`). `failed`
 * queda fuera a propósito: un fallo transitorio sí se puede reintentar.
 */
const ESTADOS_YA_GRABADA = ["uploaded", "ingesting", "ready"] as const;

/**
 * Espera mínima entre reintentos automáticos tras un fallo.
 *
 * `failed` queda fuera de ESTADOS_YA_GRABADA a propósito: un fallo transitorio
 * merece otro intento. Pero el disparador ahora es CADA participante que entra,
 * así que con una causa persistente —credenciales de S3 malas, egress caído— una
 * clase de 30 alumnos abriría 30 filas y 30 StartEgress. Un minuto de espera
 * conserva el reintento y corta la avalancha.
 */
const ESPERA_TRAS_FALLO_MS = 60_000;

export type ResultadoInicio =
  | { ok: true; fila: FilaGrabacion; egressId: string | null; yaEstaba?: true }
  | { ok: false; motivo: "deshabilitado" }
  | { ok: false; motivo: "sin_configuracion"; missing: string[] }
  | { ok: false; motivo: "cancelada"; fila: FilaGrabacion | null }
  | { ok: false; motivo: "sala_vacia" }
  | { ok: false; motivo: "ya_grabada" }
  | { ok: false; motivo: "fallo_reciente" }
  | { ok: false; motivo: "error"; detalle: string };

export function configuracionGrabacion():
  | { ok: true; config: LiveKitConfig; storage: EgressStorageConfig }
  | { ok: false; missing: string[] } {
  const missing: string[] = [];
  let config: LiveKitConfig | null = null;
  let storage: EgressStorageConfig | null = null;

  try {
    config = getLiveKitConfig();
  } catch (e) {
    if (!(e instanceof LiveKitNotConfiguredError)) throw e;
    missing.push(...e.missing);
  }
  try {
    storage = getEgressStorageConfig();
  } catch (e) {
    if (!(e instanceof EgressNotConfiguredError)) throw e;
    missing.push(...e.missing);
  }

  if (!config || !storage) return { ok: false, missing };
  return { ok: true, config, storage };
}

async function filaViva(
  admin: SupabaseClient,
  sessionId: string,
): Promise<FilaGrabacion | null> {
  const { data, error } = await admin
    .from("session_recordings")
    .select(COLUMNAS_FILA)
    .eq("session_id", sessionId)
    .in("status", ["starting", "active"])
    .maybeSingle();
  // Un fallo de lectura NO es "no hay grabación viva": leerlo así manda derecho
  // al insert. Sobrevive por el 23505, pero en silencio — y así se ve.
  if (error) console.error("[grabacion] filaViva falló", error.message);
  return (data as FilaGrabacion | null) ?? null;
}

async function ultimaFila(
  admin: SupabaseClient,
  sessionId: string,
): Promise<FilaGrabacion | null> {
  const { data, error } = await admin
    .from("session_recordings")
    .select(COLUMNAS_FILA)
    .eq("session_id", sessionId)
    // `started_at`, no `created_at`: esta tabla no tiene esa columna y
    // PostgREST responde 42703, que acá se tragaría como "no hay filas".
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error("[grabacion] ultimaFila falló", error.message);
  return (data as FilaGrabacion | null) ?? null;
}

/**
 * Enciende la grabación de una sesión. Idempotente: si ya hay una viva la
 * devuelve sin tocar nada, que es lo que quiere tanto el segundo clic del
 * docente como el segundo `participant_joined` de la sala.
 *
 * `startedBy` es null cuando la enciende el sistema (webhook): la fila queda
 * igual de válida, y la diferencia sirve para saber después si la clase se
 * grabó sola o la prendió alguien.
 */
export async function iniciarGrabacionDeSesion(
  admin: SupabaseClient,
  input: {
    sessionId: string;
    room: string;
    startedBy: string | null;
    /**
     * Arranque del sistema (webhook). Respeta una decisión humana previa: si la
     * clase ya se grabó —o el docente detuvo a mano para una conversación
     * privada— el siguiente que entre NO la vuelve a encender. Con el botón es
     * al revés: volver a grabar es justamente lo que se está pidiendo.
     */
    automatico?: boolean;
  },
): Promise<ResultadoInicio> {
  if (!isEgressEnabled()) return { ok: false, motivo: "deshabilitado" };

  const conf = configuracionGrabacion();
  if (!conf.ok) return { ok: false, motivo: "sin_configuracion", missing: conf.missing };

  const yaViva = await filaViva(admin, input.sessionId);
  if (yaViva) {
    return { ok: true, fila: yaViva, egressId: yaViva.egress_id, yaEstaba: true };
  }

  if (input.automatico) {
    const { data: previa } = await admin
      .from("session_recordings")
      .select("id")
      .eq("session_id", input.sessionId)
      .in("status", ESTADOS_YA_GRABADA as unknown as string[])
      .limit(1)
      .maybeSingle();
    if (previa) return { ok: false, motivo: "ya_grabada" };

    const { data: falloReciente } = await admin
      .from("session_recordings")
      .select("id, started_at")
      .eq("session_id", input.sessionId)
      .eq("status", "failed")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const cuando = (falloReciente as { started_at: string | null } | null)?.started_at;
    if (cuando && Date.now() - new Date(cuando).getTime() < ESPERA_TRAS_FALLO_MS) {
      return { ok: false, motivo: "fallo_reciente" };
    }
  }

  // La fila se crea ANTES de llamar a Egress: es la reserva que hace valer el
  // índice único parcial. Si dos disparadores llegan a la vez —el botón y el
  // webhook— uno solo inserta y el otro rebota acá, no en LiveKit con dos
  // Chrome levantados grabando la misma sala.
  const { data: fila, error: insertError } = await admin
    .from("session_recordings")
    .insert({ session_id: input.sessionId, status: "starting", started_by: input.startedBy })
    .select(COLUMNAS_FILA)
    .single();

  if (insertError || !fila) {
    if ((insertError as { code?: string } | null)?.code === "23505") {
      const otra = await filaViva(admin, input.sessionId);
      if (otra) return { ok: true, fila: otra, egressId: otra.egress_id, yaEstaba: true };
    }
    console.error("[grabacion] no se pudo crear la fila", insertError);
    return { ok: false, motivo: "error", detalle: "No se pudo iniciar la grabación." };
  }

  const registro = fila as FilaGrabacion;
  const filepath = filePathFor(input.sessionId, registro.id);

  try {
    const info = await startRoomComposite({
      config: conf.config,
      storage: conf.storage,
      room: input.room,
      filepath,
      sessionId: input.sessionId,
      recordingId: registro.id,
    });

    const estado = estadoDesdeEgress(info.status) ?? "starting";

    // Adjuntar egress_id/archivo mientras la fila siga VIVA, sin tocar el
    // status: vale tanto en `starting` como en `active` (el webhook
    // `egress_started` puede haberla adelantado).
    const { data: viva2 } = await admin
      .from("session_recordings")
      .update({ egress_id: info.egressId ?? null, storage_path: filepath })
      .eq("id", registro.id)
      .in("status", ["starting", "active"])
      .select(COLUMNAS_FILA)
      .maybeSingle();

    if (!viva2) {
      // La fila ya no está viva: alguien pulsó "Detener" en el intertanto y el
      // trabajo recién arrancado sobra.
      if (info.egressId) {
        try {
          await stopEgress({ config: conf.config, room: input.room, egressId: info.egressId });
        } catch (stopError) {
          console.error("[grabacion] StopEgress compensatorio falló", stopError);
        }
      }
      return { ok: false, motivo: "cancelada", fila: await ultimaFila(admin, input.sessionId) };
    }

    // El status solo avanza (`starting` → `active`): si el webhook ya lo movió,
    // esta escritura no matchea y no lo regresa.
    if (estado === "active" && (viva2 as FilaGrabacion).status === "starting") {
      await admin
        .from("session_recordings")
        .update({ status: "active" })
        .eq("id", registro.id)
        .eq("status", "starting");
    }

    const filaFinal: FilaGrabacion = {
      ...(viva2 as FilaGrabacion),
      status: estado === "active" ? "active" : (viva2 as FilaGrabacion).status,
    };
    return { ok: true, fila: filaFinal, egressId: info.egressId ?? null };
  } catch (e) {
    // Grabar una sala donde no hay nadie no produce un video: produce un
    // archivo vacío y una fila que parece exitosa. Egress lo rechaza y ese
    // rechazo se distingue del resto, porque su arreglo es "entra a la sala".
    const salaInexistente = e instanceof EgressRequestError && e.salaInexistente;
    const detalle = salaInexistente
      ? "Nadie estaba conectado a la sala al pedir la grabación."
      : `No se pudo iniciar la grabación en Egress: ${e instanceof Error ? e.message : "error desconocido"}`;

    // La fila queda `failed` con el motivo —y fuera del índice único parcial,
    // así que reintentar es posible—. Solo desde `starting`: si el fetch falló
    // por red pero LiveKit SÍ arrancó y su webhook ya movió la fila, pisarla
    // dejaría el MP4 sin ingestar.
    await admin
      .from("session_recordings")
      .update({ status: "failed", ended_at: new Date().toISOString(), error: detalle.slice(0, 500) })
      .eq("id", registro.id)
      .eq("status", "starting");

    console.error("[grabacion] StartEgress falló", detalle);
    if (salaInexistente) return { ok: false, motivo: "sala_vacia" };
    return { ok: false, motivo: "error", detalle };
  }
}
