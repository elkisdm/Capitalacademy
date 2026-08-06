"use client";

import { useEffect, useRef } from "react";
import type { Track } from "livekit-client";
import { Avatar } from "@/components/classroom/primitives";

/**
 * Una baldosa de participante: el video si publica cámara, o su avatar si no.
 *
 * El `<video>` se conecta al track por `attach`/`detach` del SDK y NO por un
 * `src`: las pistas de WebRTC son MediaStream vivos, y el propio SDK maneja el
 * ciclo de vida. Desconectar en el cleanup es obligatorio; si no, quedan
 * elementos escuchando pistas de gente que ya se fue.
 */
export function ParticipantTile({
  videoTrack,
  audioTrack,
  name,
  isLocal,
  isSpeaking,
  size = "strip",
}: {
  videoTrack: Track | null;
  audioTrack: Track | null;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  size?: "main" | "strip";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoTrack) return;
    videoTrack.attach(el);
    return () => {
      videoTrack.detach(el);
    };
  }, [videoTrack]);

  useEffect(() => {
    const el = audioRef.current;
    // El audio propio NUNCA se reproduce: sería un eco de la propia voz.
    if (!el || !audioTrack || isLocal) return;
    audioTrack.attach(el);
    return () => {
      audioTrack.detach(el);
    };
  }, [audioTrack, isLocal]);

  const esPrincipal = size === "main";

  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl bg-ca-ink/90",
        esPrincipal ? "aspect-video w-full" : "aspect-video w-32 shrink-0 md:w-40",
        // El borde de "está hablando" es la única señal de quién tiene la
        // palabra cuando hay varias baldosas iguales.
        isSpeaking ? "ring-2 ring-ca-lime" : "ring-1 ring-white/10",
      ].join(" ")}
    >
      {videoTrack ? (
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          playsInline
          // El video propio va espejado: es lo que la gente espera de su cámara.
          style={isLocal ? { transform: "scaleX(-1)" } : undefined}
          muted={isLocal}
        />
      ) : (
        <div className="grid h-full w-full place-items-center">
          <Avatar initials={name} size={esPrincipal ? 72 : 32} />
        </div>
      )}

      {!isLocal && <audio ref={audioRef} autoPlay />}

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2.5 py-1.5">
        <span
          className={[
            "truncate font-sans font-bold text-white",
            esPrincipal ? "text-[12px]" : "text-[10px]",
          ].join(" ")}
        >
          {isLocal ? "Tú" : name}
        </span>
        {!audioTrack && !isLocal && (
          <span aria-label="Micrófono apagado" title="Micrófono apagado" className="text-white/70">
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="2" y1="2" x2="22" y2="22" />
              <path d="M9 9v3a3 3 0 005.1 2.1M12 2a3 3 0 013 3v6" />
              <path d="M19 10v2a7 7 0 01-.9 3.4M5 10v2a7 7 0 0012 5" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}

export { ParticipantTile as default };
