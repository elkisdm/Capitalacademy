import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClassroomAccess } from "@/lib/classroom/access";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { getLiveKitConfig, LiveKitNotConfiguredError } from "@/lib/livekit/config";
import { decideRoomAccess, roomNameForSession, type RoomSession } from "@/lib/livekit/access";
import { createAccessToken } from "@/lib/livekit/token";
import { parseSessionRef } from "@/lib/livekit/meeting-code";

export const runtime = "nodejs";

/**
 * Moderación de la sala por parte de quien dicta la clase (ADR-0031).
 *
 * Silenciar o sacar a alguien se hace SIEMPRE contra el servidor de LiveKit
 * desde acá, nunca desde el navegador: el token del docente incluye `roomAdmin`,
 * pero confiar en que el cliente lo use bien significaría que cualquiera que
 * copie ese token modera la clase. Acá se vuelve a verificar contra nuestra base
 * que quien pide moderar es efectivamente staff de ESA cohorte.
 *
 * La acción se ejecuta con un token de servicio de vida muy corta, acotado a la
 * sala de esa clase: ni siquiera este endpoint firma una credencial general.
 */

const moderarLimiter = createRateLimiter({ limit: 30, windowSeconds: 60 });

/** Identidad del participante (es el id de su perfil). */
const identity = z.string().min(1).max(100);

// Una rama por acción, con `literal` y no `enum`: es lo que deja a TypeScript
// angostar el cuerpo y saber en cada rama si hay destinatario o no. Las acciones
// sobre la sala entera NO lo llevan; pedirlo obligaría al cliente a mandar una
// identidad de mentira para que la validación pase.
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mute"), identity }),
  z.object({ action: z.literal("remove"), identity }),
  z.object({ action: z.literal("mute_all") }),
  z.object({ action: z.literal("end_room") }),
]);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const limit = moderarLimiter.check(user.id);
  if (!limit.ok) return rateLimitResponse(limit);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación fallida" }, { status: 422 });
  }
  // En una variable propia porque es lo que TypeScript sabe angostar: sobre
  // `parsed.data` cada rama tendría que volver a comprobar la acción.
  const orden = parsed.data;

  let config;
  try {
    config = getLiveKitConfig();
  } catch (e) {
    if (e instanceof LiveKitNotConfiguredError) {
      return NextResponse.json({ error: "No configurado" }, { status: 503 });
    }
    throw e;
  }

  // `parseSessionRef` devuelve `{ kind: "invalid" }`, que es truthy: hay que
  // mirar el `kind`, no la verdad del objeto.
  const ref = parseSessionRef(sessionId);
  if (ref.kind === "invalid") {
    return NextResponse.json({ error: "No encontramos esta clase." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("class_sessions")
    .select("id, cohort_id, starts_at, ends_at, modality")
    .eq(ref.kind === "code" ? "code" : "id", ref.value)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "No encontramos esta clase." }, { status: 404 });
  }
  const session = data as RoomSession;

  const access = await getClassroomAccess(user.id, session.cohort_id);
  const decision = decideRoomAccess({
    session,
    cohortId: session.cohort_id,
    hasActiveEnrollment: Boolean(access?.enrollment),
    isStaff: Boolean(access?.isStaff),
    now: new Date(),
  });

  // Solo quien dicta modera. Un alumno con acceso a la sala NO puede silenciar
  // ni sacar a sus compañeros, aunque sepa la ruta.
  if (!decision.allowed || decision.role !== "teacher") {
    return NextResponse.json({ error: "No puedes moderar esta clase." }, { status: 403 });
  }

  // Nadie puede moderarse a sí mismo: silenciarse es un botón propio, y
  // "sacarse" es simplemente salir.
  if ("identity" in orden && orden.identity === user.id) {
    return NextResponse.json({ error: "Esa acción es sobre otra persona." }, { status: 422 });
  }

  const room = roomNameForSession(session.id);
  const now = new Date();
  const serviceToken = createAccessToken({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    identity: `moderacion-${user.id}`,
    grant: {
      room,
      roomJoin: true,
      canPublish: false,
      canSubscribe: false,
      canPublishData: false,
      roomAdmin: true,
      // `DeleteRoom` es la única llamada de este endpoint que LiveKit no cubre
      // con `roomAdmin`. Se concede solo cuando se va a usar — y es un permiso
      // GLOBAL (LiveKit no lo acota por sala): este token puede borrar
      // cualquier sala mientras vive, así que jamás debe salir del handler.
      ...(orden.action === "end_room" ? { roomCreate: true } : {}),
    },
    issuedAt: now,
    // Un minuto alcanza de sobra para una llamada y no deja una credencial de
    // administración dando vueltas.
    expiresAt: new Date(now.getTime() + 60_000),
  });

  const httpBase = config.url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  const llamar = (endpoint: string, payload: unknown) =>
    fetch(`${httpBase}/twirp/livekit.RoomService/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

  // Terminar la clase para todos: se borra la sala, lo que desconecta a cada
  // participante de una vez. Sacarlos uno por uno dejaría la sala abierta y
  // cualquiera con el enlace volvería a entrar mientras el docente se despide.
  if (orden.action === "end_room") {
    const res = await llamar("DeleteRoom", { room });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      console.error("[clase/moderar] no se pudo terminar la clase", res.status, detalle.slice(0, 200));
      return NextResponse.json({ error: "No se pudo aplicar la acción" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, action: "end_room" });
  }

  // Silenciar a todos: una sola llamada para saber quién está publicando y
  // después un mute por micrófono abierto. LiveKit no tiene un "mute all", y
  // recorrer el panel del docente a mano es justo lo que esto evita.
  if (orden.action === "mute_all") {
    const listaRes = await llamar("ListParticipants", { room });
    if (!listaRes.ok) {
      const detalle = await listaRes.text().catch(() => "");
      console.error("[clase/moderar] no se pudo listar la sala", listaRes.status, detalle.slice(0, 200));
      return NextResponse.json({ error: "No se pudo aplicar la acción" }, { status: 502 });
    }

    const lista = (await listaRes.json().catch(() => null)) as {
      participants?: Array<{
        identity?: string;
        tracks?: Array<{ sid?: string; source?: string; muted?: boolean }>;
      }>;
    } | null;

    // El propio docente queda fuera: silenciarse a sí mismo al pedir silencio a
    // la sala lo dejaría explicando la clase en mudo.
    const objetivos = (lista?.participants ?? []).flatMap((p) =>
      p.identity && p.identity !== user.id
        ? (p.tracks ?? [])
            .filter((t) => t.source === "MICROPHONE" && !t.muted && t.sid)
            .map((t) => ({ identity: p.identity as string, sid: t.sid as string }))
        : [],
    );

    const resultados = await Promise.all(
      objetivos.map((o) =>
        llamar("MutePublishedTrack", {
          room,
          identity: o.identity,
          track_sid: o.sid,
          muted: true,
        })
          .then((r) => r.ok)
          .catch(() => false),
      ),
    );
    const silenciados = resultados.filter(Boolean).length;

    // Que fallen TODAS es un problema del servicio y hay que decirlo. Que falle
    // alguna suelta no: el resto de la sala sí quedó en silencio, y el número
    // que se devuelve ya dice cuántas se lograron.
    if (objetivos.length > 0 && silenciados === 0) {
      return NextResponse.json({ error: "No se pudo aplicar la acción" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      action: "mute_all",
      silenciados,
      total: objetivos.length,
    });
  }

  if (orden.action === "remove") {
    const res = await llamar("RemoveParticipant", { room, identity: orden.identity });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      console.error("[clase/moderar] no se pudo sacar", res.status, detalle.slice(0, 200));
      return NextResponse.json({ error: "No se pudo aplicar la acción" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, action: "remove" });
  }

  // Silenciar necesita el SID de la pista, no basta la identidad: por eso hay
  // que preguntar primero qué está publicando esa persona.
  const infoRes = await llamar("GetParticipant", { room, identity: orden.identity });
  if (!infoRes.ok) {
    return NextResponse.json({ error: "No encontramos a esa persona en la sala" }, { status: 404 });
  }

  const info = (await infoRes.json()) as {
    tracks?: Array<{ sid?: string; source?: string; muted?: boolean }>;
  };
  const micro = (info.tracks ?? []).find((t) => t.source === "MICROPHONE" && !t.muted);

  // Ya estaba en silencio: es el resultado que el docente quería, no un error.
  if (!micro?.sid) return NextResponse.json({ ok: true, action: "mute", yaEstaba: true });

  const muteRes = await llamar("MutePublishedTrack", {
    room,
    identity: orden.identity,
    track_sid: micro.sid,
    muted: true,
  });
  if (!muteRes.ok) {
    const detalle = await muteRes.text().catch(() => "");
    console.error("[clase/moderar] no se pudo silenciar", muteRes.status, detalle.slice(0, 200));
    return NextResponse.json({ error: "No se pudo aplicar la acción" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, action: "mute" });
}
