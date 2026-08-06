"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
} from "livekit-client";
import { ParticipantTile } from "./participant-tile";
import {
  liveMessage,
  tokenErrorMessage,
  pickMainParticipant,
  stripParticipants,
  participantCountLabel,
  type LiveScreenState,
  type TileParticipant,
} from "@/lib/livekit/room-state";

/**
 * Sala de clase en vivo del alumno (ADR-0031).
 *
 * Reemplaza el botón que abría Zoom en otra pestaña: la clase ocurre acá.
 *
 * El token NO se pide al montar sino al pulsar "Entrar": pedirlo antes gastaría
 * una credencial —y encendería cámara y micrófono— en cada alumno que abra la
 * pantalla de la clase para mirar el material, sin intención de entrar.
 *
 * Toda la decisión de acceso ya ocurrió en el servidor
 * (`/api/classroom/clase/[sessionId]/token`); acá solo se consume lo que ese
 * endpoint autorizó.
 */

type Estado = {
  screen: LiveScreenState;
  /** Mensaje del servidor cuando el token fue rechazado. */
  error: string | null;
};

/**
 * Lo que el SDK expone de cada participante, mapeado a lo que la UI necesita.
 *
 * Quién dicta la clase NO se deduce de los permisos del token: el SDK no expone
 * `roomAdmin` en el cliente. Viene del servidor, que sí sabe qué instructor
 * tiene asignada la sesión.
 */
function toTile(p: Participant, isLocal: boolean, hostIdentity: string | null): TileParticipant {
  return {
    identity: p.identity,
    name: p.name || p.identity,
    isLocal,
    isSpeaking: p.isSpeaking,
    hasVideo: Boolean(p.getTrackPublication(Track.Source.Camera)?.track),
    isHost: hostIdentity !== null && p.identity === hostIdentity,
  };
}

export function LiveClassRoom({
  sessionId,
  hostIdentity = null,
}: {
  sessionId: string;
  /** Id de la cuenta de quien dicta, para darle la ventana grande. */
  hostIdentity?: string | null;
}) {
  const [estado, setEstado] = useState<Estado>({ screen: "idle", error: null });
  const [, forzarRender] = useState(0);
  // La sala va en ESTADO y no en un ref porque el render la lee: los
  // participantes y sus pistas salen de acá.
  const [room, setRoom] = useState<Room | null>(null);
  // El ref es solo para el cleanup al desmontar, donde no hay acceso al estado.
  const roomRef = useRef<Room | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);

  // Los eventos del SDK mutan objetos en su sitio, así que no sirve guardarlos
  // en estado: se re-renderiza a mano cuando algo cambia.
  const refrescar = useCallback(() => forzarRender((n) => n + 1), []);

  const guardarSala = useCallback((r: Room | null) => {
    roomRef.current = r;
    setRoom(r);
  }, []);

  const salir = useCallback(async () => {
    const actual = roomRef.current;
    guardarSala(null);
    if (actual) await actual.disconnect();
    setEstado({ screen: "disconnected", error: null });
  }, [guardarSala]);

  // Desconectar al desmontar: sin esto, navegar a otra pantalla deja la cámara
  // encendida y al alumno dentro de la sala sin saberlo.
  useEffect(() => {
    return () => {
      void roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, []);

  const entrar = useCallback(async () => {
    setEstado({ screen: "connecting", error: null });

    try {
      const res = await fetch(`/api/classroom/clase/${sessionId}/token`, { method: "POST" });
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null);
        setEstado({
          screen: "error",
          error: tokenErrorMessage(res.status, cuerpo?.error ?? null),
        });
        return;
      }

      const { token, url } = (await res.json()) as { token: string; url: string };

      const sala = new Room({ adaptiveStream: true, dynacast: true });

      sala
        .on(RoomEvent.ParticipantConnected, refrescar)
        .on(RoomEvent.ParticipantDisconnected, refrescar)
        .on(RoomEvent.TrackSubscribed, refrescar)
        .on(RoomEvent.TrackUnsubscribed, refrescar)
        .on(RoomEvent.TrackMuted, refrescar)
        .on(RoomEvent.TrackUnmuted, refrescar)
        .on(RoomEvent.LocalTrackPublished, refrescar)
        .on(RoomEvent.LocalTrackUnpublished, refrescar)
        .on(RoomEvent.ActiveSpeakersChanged, refrescar)
        .on(RoomEvent.Reconnecting, () => setEstado({ screen: "reconnecting", error: null }))
        .on(RoomEvent.Reconnected, () => setEstado({ screen: "connected", error: null }))
        .on(RoomEvent.Disconnected, () => {
          guardarSala(null);
          setEstado({ screen: "disconnected", error: null });
        });

      await sala.connect(url, token);
      guardarSala(sala);

      // Micrófono sí, cámara no: entrar con la cámara encendida sin avisar es
      // invasivo, y en un aula de 20 además es ancho de banda que nadie pidió.
      await sala.localParticipant.setMicrophoneEnabled(true).catch(() => {
        // Sin permiso de micrófono se entra igual, en silencio.
        setMicOn(false);
      });

      setEstado({ screen: "connected", error: null });
      refrescar();
    } catch (e) {
      console.error("[clase en vivo] no se pudo conectar", e);
      guardarSala(null);
      setEstado({ screen: "error", error: null });
    }
  }, [sessionId, refrescar, guardarSala]);

  const alternarMic = useCallback(async () => {
    const actual = roomRef.current;
    if (!actual) return;
    const siguiente = !actual.localParticipant.isMicrophoneEnabled;
    await actual.localParticipant.setMicrophoneEnabled(siguiente);
    setMicOn(siguiente);
    refrescar();
  }, [refrescar]);

  const alternarCam = useCallback(async () => {
    const actual = roomRef.current;
    if (!actual) return;
    const siguiente = !actual.localParticipant.isCameraEnabled;
    await actual.localParticipant.setCameraEnabled(siguiente);
    setCamOn(siguiente);
    refrescar();
  }, [refrescar]);

  const mensaje = liveMessage(estado.screen);

  /* ── Fuera de la sala ─────────────────────────────────────── */
  if (estado.screen !== "connected" && estado.screen !== "reconnecting") {
    const ocupado = estado.screen === "connecting";
    return (
      <div className="ca-card flex flex-col items-start gap-3 p-5">
        <div>
          <p className="text-[15px] font-black tracking-tight text-ca-ink">{mensaje.title}</p>
          {(estado.error ?? mensaje.detail) && (
            <p className="mt-1 text-[13px] leading-relaxed text-ca-ink-soft">
              {estado.error ?? mensaje.detail}
            </p>
          )}
        </div>
        {(estado.screen === "idle" || mensaje.canRetry) && (
          <button
            type="button"
            onClick={entrar}
            disabled={ocupado}
            className="ca-btn-lime ca-btn-interactive px-4 py-2 text-[12px] font-bold uppercase tracking-[0.08em] disabled:opacity-60"
          >
            {estado.screen === "idle" ? "Entrar a la clase" : "Volver a intentar"}
          </button>
        )}
        {ocupado && (
          <span className="text-[12px] font-semibold text-ca-ink-soft">Conectando…</span>
        )}
      </div>
    );
  }

  /* ── Dentro de la sala ────────────────────────────────────── */
  const todos: Array<{ p: Participant; local: boolean }> = room
    ? [
        { p: room.localParticipant, local: true },
        ...Array.from(room.remoteParticipants.values()).map((p: RemoteParticipant) => ({
          p,
          local: false,
        })),
      ]
    : [];

  const tiles = todos.map(({ p, local }) => toTile(p, local, hostIdentity));
  const main = pickMainParticipant(tiles);
  const tira = stripParticipants(tiles, main);
  const porIdentidad = new Map(todos.map(({ p, local }) => [p.identity, { p, local }]));

  const render = (t: TileParticipant, size: "main" | "strip") => {
    const entry = porIdentidad.get(t.identity);
    if (!entry) return null;
    return (
      <ParticipantTile
        key={t.identity}
        videoTrack={entry.p.getTrackPublication(Track.Source.Camera)?.track ?? null}
        audioTrack={entry.p.getTrackPublication(Track.Source.Microphone)?.track ?? null}
        name={t.name}
        isLocal={t.isLocal}
        isSpeaking={t.isSpeaking}
        size={size}
      />
    );
  };

  return (
    <div className="ca-card overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b border-ca-outline-strong/20 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
          <span className="font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-ca-ink">
            {estado.screen === "reconnecting" ? "Reconectando…" : "En vivo"}
          </span>
        </div>
        <span className="text-[11px] font-semibold text-ca-ink-soft">
          {participantCountLabel(tiles.length)}
        </span>
      </div>

      {estado.screen === "reconnecting" && (
        <p className="bg-ca-bg-soft px-4 py-2 text-[12px] text-ca-ink-soft">
          {liveMessage("reconnecting").detail}
        </p>
      )}

      <div className="space-y-2 p-3">
        {main && render(main, "main")}
        {tira.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {tira.map((t) => render(t, "strip"))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 border-t border-ca-outline-strong/20 px-4 py-3">
        <ControlButton active={micOn} onClick={alternarMic} label={micOn ? "Silenciar micrófono" : "Activar micrófono"}>
          {micOn ? "Micrófono" : "Silenciado"}
        </ControlButton>
        <ControlButton active={camOn} onClick={alternarCam} label={camOn ? "Apagar cámara" : "Encender cámara"}>
          {camOn ? "Cámara" : "Cámara off"}
        </ControlButton>
        <button
          type="button"
          onClick={salir}
          className="rounded-xl bg-red-500 px-4 py-2 text-[12px] font-bold text-white transition-transform hover:scale-[1.02]"
        >
          Salir
        </button>
      </div>
    </div>
  );
}

function ControlButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={[
        "rounded-xl px-3.5 py-2 text-[12px] font-bold transition-colors",
        active ? "bg-ca-ink text-white" : "bg-ca-bg-soft text-ca-ink-soft hover:text-ca-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
