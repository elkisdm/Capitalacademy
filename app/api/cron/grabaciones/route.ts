import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCron } from "@/lib/api/cron-auth";
import { getMuxClient } from "@/lib/mux/client";
import {
  getLiveKitConfig,
  LiveKitNotConfiguredError,
  type LiveKitConfig,
} from "@/lib/livekit/config";
import { roomNameForSession } from "@/lib/livekit/access";
import { GRABACIONES_BUCKET, listEgress, stopEgress } from "@/lib/livekit/egress";
import { egressTerminado, estadoDesdeEgress } from "@/lib/livekit/egress-estado";
import { ingestRecording } from "@/lib/classroom/ingest-recording";
import {
  dispatchCapacitacionFollowup,
  dispatchRecordingAvailableNotification,
} from "@/lib/classroom/recording-notifications";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Reconciliación y limpieza de las grabaciones nativas (ADR-0034).
 *
 * El camino feliz lo mueven los webhooks. Esto existe para los días en que un
 * webhook no llega: sin este cron, un archivo grabado se queda en el bucket sin
 * que nadie lo ingeste, un Chrome de Egress sigue facturando de noche, y el MP4
 * con caras y voces de alumnos se queda ahí para siempre.
 *
 * Cada 15 minutos, techo de 10 filas por trabajo (mismo criterio que
 * flow-reconcile, ADR-0021).
 */

const MAX_PER_RUN = 10;

/** Cuánto se espera tras el fin de la clase antes de dar por perdido el webhook. */
const CIERRE_PERDIDO_MIN = 30;
/** Cuánto se le da a Egress para confirmar que arrancó. */
const ARRANQUE_PERDIDO_MIN = 5;
/** Cuánto se espera a que Mux termine antes de ir a preguntarle. */
const INGESTA_PERDIDA_MIN = 10;
/** Retención del archivo cuando la ingesta falló, para poder rescatarlo a mano. */
const RETENCION_FALLIDA_DIAS = 14;

const MINUTO_MS = 60_000;

type FilaPendiente = {
  id: string;
  session_id: string;
  status: string;
  egress_id: string | null;
  storage_path: string | null;
  mux_asset_id: string | null;
};

const COLUMNAS = "id, session_id, status, egress_id, storage_path, mux_asset_id";

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const ahora = Date.now();
  const resumen = {
    cerradas: 0,
    detenidas: 0,
    fallidas: 0,
    ingestadas: 0,
    listas: 0,
    borradas: 0,
  };

  // Sin credenciales de LiveKit no se puede reconciliar contra ListEgress, pero
  // la limpieza del bucket y el cierre contra Mux sí corren: son justo los
  // trabajos que protegen datos y facturación.
  let config: LiveKitConfig | null = null;
  try {
    config = getLiveKitConfig();
  } catch (e) {
    if (!(e instanceof LiveKitNotConfiguredError)) throw e;
    console.warn("[cron/grabaciones] sin credenciales de LiveKit:", e.missing.join(", "));
  }

  // -------------------------------------------------------------------------
  // 1. Se perdió el `egress_ended`: la clase terminó hace rato y la fila sigue
  //    abierta. Se le pregunta a LiveKit qué pasó de verdad.
  // -------------------------------------------------------------------------
  if (config) {
    const corte = new Date(ahora - CIERRE_PERDIDO_MIN * MINUTO_MS).toISOString();
    const { data: abiertas } = await admin
      .from("session_recordings")
      .select(`${COLUMNAS}, class_sessions!inner(ends_at)`)
      .in("status", ["active", "uploaded"])
      .is("ended_at", null)
      .lt("class_sessions.ends_at", corte)
      .limit(MAX_PER_RUN);

    for (const fila of (abiertas ?? []) as FilaPendiente[]) {
      const room = roomNameForSession(fila.session_id);
      let trabajos;
      try {
        trabajos = await listEgress({ config, room });
      } catch (e) {
        console.error("[cron/grabaciones] ListEgress falló", room, e);
        continue;
      }

      const trabajo =
        trabajos.find((t) => t.egressId && t.egressId === fila.egress_id) ?? trabajos[0];

      if (!trabajo) {
        // LiveKit ya no sabe nada de esa sala y nunca llegó el archivo.
        await admin
          .from("session_recordings")
          .update({
            status: "failed",
            ended_at: new Date().toISOString(),
            error: "La grabación terminó sin dejar archivo. Sube la repetición a mano.",
          })
          .eq("id", fila.id)
          .in("status", ["active", "uploaded"]);
        resumen.fallidas++;
        continue;
      }

      if (!egressTerminado(trabajo.status)) {
        // Sigue vivo con la clase terminada hace media hora: es un Chrome
        // facturando de noche. Se corta acá y el `egress_ended` hará el resto.
        try {
          await stopEgress({ config, room, egressId: trabajo.egressId ?? fila.egress_id ?? "" });
          resumen.detenidas++;
        } catch (e) {
          console.error("[cron/grabaciones] StopEgress falló", room, e);
        }
        continue;
      }

      const archivo = trabajo.fileResults?.[0];
      const termino = estadoDesdeEgress(trabajo.status);

      if (termino === "failed") {
        await admin
          .from("session_recordings")
          .update({
            status: "failed",
            ended_at: new Date().toISOString(),
            error: trabajo.error?.slice(0, 500) || "Egress terminó sin poder grabar la clase.",
          })
          .eq("id", fila.id)
          .in("status", ["active", "uploaded"]);
        resumen.fallidas++;
        continue;
      }

      const { data: cerrada } = await admin
        .from("session_recordings")
        .update({
          status: "uploaded",
          ended_at: new Date().toISOString(),
          egress_id: trabajo.egressId ?? fila.egress_id,
          storage_path: archivo?.filename || fila.storage_path,
          file_size_bytes: archivo?.size ?? null,
        })
        .eq("id", fila.id)
        .in("status", ["active", "uploaded"])
        .select("id")
        .maybeSingle();

      if (!cerrada) continue;
      resumen.cerradas++;

      const ingesta = await ingestRecording(admin, fila.id);
      if (ingesta.ok) resumen.ingestadas++;
    }
  }

  // -------------------------------------------------------------------------
  // 1b. Filas `uploaded` YA cerradas (`ended_at` puesto) que nadie ingesta: es
  //     lo que deja el "Detener" del docente cuando el `egress_ended` se pierde,
  //     y ninguna otra rama las mira — el trabajo 1 exige `ended_at` null y el 3
  //     solo ve `ingesting`. Sin esto, el MP4 con caras y voces de alumnos se
  //     queda en el bucket para siempre y la clase sin repetición, sin un error.
  // -------------------------------------------------------------------------
  {
    const corte = new Date(ahora - INGESTA_PERDIDA_MIN * MINUTO_MS).toISOString();
    const { data: cerradasSinIngesta } = await admin
      .from("session_recordings")
      .select(COLUMNAS)
      .eq("status", "uploaded")
      .not("ended_at", "is", null)
      .is("mux_asset_id", null)
      .lt("ended_at", corte)
      .limit(MAX_PER_RUN);

    for (const fila of (cerradasSinIngesta ?? []) as FilaPendiente[]) {
      // Con archivo conocido, la ingesta puede partir ya.
      if (fila.storage_path) {
        const ingesta = await ingestRecording(admin, fila.id);
        if (ingesta.ok) resumen.ingestadas++;
        continue;
      }

      // Sin archivo hay que preguntarle a LiveKit qué dejó el trabajo.
      if (!config) continue;
      const room = roomNameForSession(fila.session_id);
      let trabajos;
      try {
        trabajos = await listEgress({ config, room });
      } catch (e) {
        console.error("[cron/grabaciones] ListEgress falló", room, e);
        continue;
      }
      const trabajo =
        trabajos.find((t) => t.egressId && t.egressId === fila.egress_id) ?? trabajos[0];

      if (trabajo && !egressTerminado(trabajo.status)) {
        // El docente pidió detener y el trabajo sigue vivo: se corta acá y la
        // próxima corrida (o el webhook, si vuelve) recoge el archivo.
        try {
          await stopEgress({ config, room, egressId: trabajo.egressId ?? fila.egress_id ?? "" });
          resumen.detenidas++;
        } catch (e) {
          console.error("[cron/grabaciones] StopEgress falló", room, e);
        }
        continue;
      }

      const archivo = trabajo?.fileResults?.[0];
      if (archivo?.filename) {
        await admin
          .from("session_recordings")
          .update({
            storage_path: archivo.filename,
            file_size_bytes: archivo.size ?? null,
            egress_id: trabajo?.egressId ?? fila.egress_id,
          })
          .eq("id", fila.id)
          .eq("status", "uploaded");
        const ingesta = await ingestRecording(admin, fila.id);
        if (ingesta.ok) resumen.ingestadas++;
        continue;
      }

      await admin
        .from("session_recordings")
        .update({
          status: "failed",
          error: "La grabación se detuvo pero Egress no dejó ningún archivo. Sube la repetición a mano.",
        })
        .eq("id", fila.id)
        .eq("status", "uploaded");
      resumen.fallidas++;
    }
  }

  // -------------------------------------------------------------------------
  // 2. Filas que quedaron en `starting`: o Egress arrancó y no nos enteramos, o
  //    nunca arrancó. Mientras siga `starting` bloquea el índice único parcial y
  //    el docente no puede reintentar.
  // -------------------------------------------------------------------------
  if (config) {
    const corte = new Date(ahora - ARRANQUE_PERDIDO_MIN * MINUTO_MS).toISOString();
    const { data: arrancando } = await admin
      .from("session_recordings")
      .select(COLUMNAS)
      .eq("status", "starting")
      .lt("started_at", corte)
      .limit(MAX_PER_RUN);

    for (const fila of (arrancando ?? []) as FilaPendiente[]) {
      const room = roomNameForSession(fila.session_id);
      let trabajos;
      try {
        trabajos = await listEgress({ config, room, activos: true });
      } catch (e) {
        console.error("[cron/grabaciones] ListEgress falló", room, e);
        continue;
      }

      // Si la fila nunca guardó su `egress_id`, cualquier trabajo vivo de ESA
      // sala es el suyo: solo puede haber uno (índice único parcial).
      const trabajo = trabajos.find((t) => t.egressId === fila.egress_id) ?? trabajos[0];
      if (trabajo) {
        await admin
          .from("session_recordings")
          .update({ status: "active", egress_id: trabajo.egressId ?? fila.egress_id })
          .eq("id", fila.id)
          .eq("status", "starting");
        continue;
      }

      await admin
        .from("session_recordings")
        .update({
          status: "failed",
          ended_at: new Date().toISOString(),
          error: "Egress nunca confirmó que la grabación arrancara.",
        })
        .eq("id", fila.id)
        .eq("status", "starting");
      resumen.fallidas++;
    }
  }

  // -------------------------------------------------------------------------
  // 3. Filas `ingesting`: es también el camino normal por el que una grabación
  //    llega a `ready`. El webhook de Mux enlaza la lección pero no sabe nada de
  //    esta tabla, así que la confirmación —y con ella el borrado del archivo
  //    con PII— entra por acá.
  // -------------------------------------------------------------------------
  {
    const corte = new Date(ahora - INGESTA_PERDIDA_MIN * MINUTO_MS).toISOString();
    // El reloj es `ingested_at` (estampado al RESERVAR la ingesta), no
    // `started_at`: ese es el inicio de la grabación, horas antes, y medir con
    // él dejaba la gracia en cero — el cron preemptaba ingestas en vuelo y
    // creaba dos assets del mismo MP4. El `is null` cubre filas reservadas por
    // código anterior a este reloj.
    const { data: ingestando } = await admin
      .from("session_recordings")
      .select(COLUMNAS)
      .eq("status", "ingesting")
      .or(`ingested_at.is.null,ingested_at.lt.${corte}`)
      .limit(MAX_PER_RUN);

    for (const fila of (ingestando ?? []) as FilaPendiente[]) {
      // Se reservó la fila y se cayó antes de crear el asset: la ingesta se
      // devuelve a `uploaded` para que pueda volver a intentarse.
      if (!fila.mux_asset_id) {
        await admin
          .from("session_recordings")
          .update({ status: "uploaded" })
          .eq("id", fila.id)
          .eq("status", "ingesting");
        const reintento = await ingestRecording(admin, fila.id);
        if (reintento.ok) resumen.ingestadas++;
        continue;
      }

      let asset;
      try {
        asset = await getMuxClient().video.assets.retrieve(fila.mux_asset_id);
      } catch (e) {
        console.error("[cron/grabaciones] no se pudo consultar el asset", fila.mux_asset_id, e);
        continue;
      }

      if (asset.status === "errored") {
        await admin
          .from("session_recordings")
          .update({
            status: "failed",
            error: "Mux no pudo procesar la grabación. El archivo se conserva para reintentar.",
          })
          .eq("id", fila.id)
          .eq("status", "ingesting");
        resumen.fallidas++;
        continue;
      }

      if (asset.status !== "ready") continue;

      // Red de seguridad de la carrera de D4: si `video.asset.ready` llegó antes
      // de que escribiéramos el `mux_asset_id`, la lección quedó sin playback.
      const { data: sesion } = await admin
        .from("class_sessions")
        .select("lesson_id")
        .eq("id", fila.session_id)
        .maybeSingle<{ lesson_id: string | null }>();

      const playbackId = asset.playback_ids?.[0]?.id ?? null;
      if (sesion?.lesson_id && playbackId) {
        const { data: reparada } = await admin
          .from("lessons")
          .update({
            mux_asset_id: fila.mux_asset_id,
            mux_playback_id: playbackId,
            video_duration_seconds: asset.duration ? Math.round(asset.duration) : null,
            mux_error: null,
          })
          .eq("id", sesion.lesson_id)
          .is("mux_playback_id", null)
          .select("id")
          .maybeSingle<{ id: string }>();

        // Si la reparación efectivamente publicó el playback, el webhook de Mux
        // nunca va a avisarle a nadie (su match falló: por eso estamos acá).
        // Sin esto, la repetición se publica en silencio y la cohorte no recibe
        // el correo. Ambas funciones son idempotentes y excluyentes por programa.
        if (reparada) {
          await dispatchCapacitacionFollowup(admin, reparada.id);
          await dispatchRecordingAvailableNotification(admin, reparada.id);
        }
      }

      await admin
        .from("session_recordings")
        .update({
          status: "ready",
          duration_seconds: asset.duration ? Math.round(asset.duration) : null,
        })
        .eq("id", fila.id)
        .eq("status", "ingesting");
      resumen.listas++;
    }
  }

  // -------------------------------------------------------------------------
  // 4. Limpieza del bucket (D7). El MP4 tiene caras y voces de alumnos: se borra
  //    apenas Mux confirma. Si la ingesta falló se retiene 14 días —para poder
  //    reintentar o rescatarlo a mano— y después se barre igual. Nada de
  //    retención indefinida "por si acaso".
  // -------------------------------------------------------------------------
  {
    const { data: listas } = await admin
      .from("session_recordings")
      .select(COLUMNAS)
      .eq("status", "ready")
      .not("storage_path", "is", null)
      .is("storage_deleted_at", null)
      .limit(MAX_PER_RUN);

    const corteRetencion = new Date(
      ahora - RETENCION_FALLIDA_DIAS * 24 * 60 * MINUTO_MS,
    ).toISOString();
    const { data: vencidas } = await admin
      .from("session_recordings")
      .select(COLUMNAS)
      .eq("status", "failed")
      .not("storage_path", "is", null)
      .is("storage_deleted_at", null)
      .lt("started_at", corteRetencion)
      .limit(MAX_PER_RUN);

    for (const fila of [
      ...((listas ?? []) as FilaPendiente[]),
      ...((vencidas ?? []) as FilaPendiente[]),
    ]) {
      if (!fila.storage_path) continue;
      const { error } = await admin.storage.from(GRABACIONES_BUCKET).remove([fila.storage_path]);
      if (error) {
        console.error("[cron/grabaciones] no se pudo borrar el objeto", fila.storage_path, error);
        continue;
      }
      await admin
        .from("session_recordings")
        .update({ storage_deleted_at: new Date().toISOString() })
        .eq("id", fila.id);
      resumen.borradas++;
    }
  }

  return NextResponse.json({ ok: true, ...resumen });
}

// Algunos schedulers invocan por GET; otros prefieren POST.
export const POST = GET;
