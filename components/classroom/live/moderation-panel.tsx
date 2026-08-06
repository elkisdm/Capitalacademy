"use client";

import { useCallback, useMemo, useState } from "react";
import { useRemoteParticipants } from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  etiquetaSilenciar,
  confirmacionSacar,
  resultadoModeracion,
  ordenarParaModerar,
  type ModerarAccion,
} from "@/lib/livekit/moderation";

/**
 * Panel de moderación del docente (ADR-0031).
 *
 * Se monta DENTRO de `<LiveKitRoom>` pero AL LADO de `<VideoConference />`, que
 * es un prefab cerrado sin lugar donde colgar acciones por participante.
 * Superponer un panel propio evita tener que rehacer el layout entero solo para
 * agregar dos botones.
 *
 * Las acciones NO se ejecutan desde el navegador contra LiveKit: van a nuestra
 * ruta, que vuelve a verificar contra la base que quien pide es staff de esa
 * cohorte. El `roomAdmin` del token alcanzaría técnicamente, pero significaría
 * que cualquiera que copie ese token modera la clase.
 */
export function ModerationPanel({ sessionId }: { sessionId: string }) {
  const remotos = useRemoteParticipants();
  const [abierto, setAbierto] = useState(false);
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const lista = useMemo(
    () =>
      ordenarParaModerar(
        remotos.map((p) => ({
          identity: p.identity,
          name: p.name || p.identity,
          micAbierto: Boolean(
            p.getTrackPublication(Track.Source.Microphone)?.track &&
              !p.getTrackPublication(Track.Source.Microphone)?.isMuted,
          ),
        })),
      ),
    [remotos],
  );

  const moderar = useCallback(
    async (accion: ModerarAccion, identity: string, nombre: string) => {
      if (accion === "remove" && !window.confirm(confirmacionSacar(nombre))) return;

      setEnCurso(identity);
      setAviso(null);
      try {
        const res = await fetch(`/api/classroom/clase/${sessionId}/moderar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: accion, identity }),
        });
        setAviso(resultadoModeracion(accion, nombre, res.ok));
      } catch (e) {
        console.error("[moderación] falló", e);
        setAviso(resultadoModeracion(accion, nombre, false));
      } finally {
        setEnCurso(null);
      }
    },
    [sessionId],
  );

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="pointer-events-auto rounded-xl bg-black/60 px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur transition-colors hover:bg-black/80"
      >
        Participantes ({lista.length})
      </button>

      {abierto && (
        <div className="pointer-events-auto max-h-[60%] w-64 overflow-y-auto rounded-xl bg-black/80 p-2 text-white backdrop-blur">
          {lista.length === 0 && (
            <p className="px-2 py-3 text-[12px] text-white/60">Todavía no ha entrado nadie.</p>
          )}

          {lista.map((p) => (
            <div key={p.identity} className="border-b border-white/10 px-2 py-2 last:border-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={[
                    "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                    p.micAbierto ? "bg-ca-lime" : "bg-white/30",
                  ].join(" ")}
                  aria-hidden="true"
                />
                <span className="truncate text-[12px] font-semibold">{p.name}</span>
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  disabled={!p.micAbierto || enCurso === p.identity}
                  onClick={() => moderar("mute", p.identity, p.name)}
                  className="rounded-lg bg-white/10 px-2 py-1 text-[11px] font-bold transition-colors hover:bg-white/20 disabled:opacity-40"
                >
                  {etiquetaSilenciar(p.micAbierto)}
                </button>
                <button
                  type="button"
                  disabled={enCurso === p.identity}
                  onClick={() => moderar("remove", p.identity, p.name)}
                  className="rounded-lg bg-red-500/80 px-2 py-1 text-[11px] font-bold transition-colors hover:bg-red-500 disabled:opacity-40"
                >
                  Sacar
                </button>
              </div>
            </div>
          ))}

          {aviso && (
            <p aria-live="polite" className="px-2 pt-2 text-[11px] text-white/70">
              {aviso}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
