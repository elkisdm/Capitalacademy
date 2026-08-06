"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
type Solicitud = { userId: string; nombre: string; desde: string };

export function ModerationPanel({ sessionId }: { sessionId: string }) {
  const remotos = useRemoteParticipants();
  const [abierto, setAbierto] = useState(false);
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);

  // Sondeo de la sala de espera (0091). Cada 8 s: alguien que pide entrar puede
  // aguantar unos segundos, y consultar más seguido solo suma carga.
  useEffect(() => {
    let vivo = true;
    const consultar = async () => {
      try {
        const res = await fetch(`/api/classroom/clase/${sessionId}/acceso`);
        if (!res.ok || !vivo) return;
        const { pendientes } = (await res.json()) as { pendientes: Solicitud[] | null };
        if (vivo) setSolicitudes(pendientes ?? []);
      } catch {
        // Un fallo puntual no cambia nada: se reintenta al próximo tick.
      }
    };
    void consultar();
    const id = setInterval(consultar, 8000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [sessionId]);

  const decidir = useCallback(
    async (accion: "approve" | "deny", userId: string, nombre: string) => {
      setEnCurso(userId);
      try {
        const res = await fetch(`/api/classroom/clase/${sessionId}/acceso`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: accion, userId }),
        });
        if (res.ok) {
          // Se saca de la lista de inmediato: esperar al próximo sondeo dejaría
          // el botón ahí ocho segundos, invitando a pulsarlo dos veces.
          setSolicitudes((prev) => prev.filter((s) => s.userId !== userId));
          setAviso(accion === "approve" ? `Dejaste entrar a ${nombre}.` : `Rechazaste a ${nombre}.`);
        } else {
          setAviso(`No se pudo decidir sobre ${nombre}.`);
        }
      } catch {
        setAviso(`No se pudo decidir sobre ${nombre}.`);
      } finally {
        setEnCurso(null);
      }
    },
    [sessionId],
  );

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
        {solicitudes.length > 0 && (
          <span
            className="ml-1.5 rounded-full bg-ca-lime px-1.5 py-0.5 text-[10px] text-ca-ink"
            aria-label={`${solicitudes.length} esperando entrar`}
          >
            {solicitudes.length}
          </span>
        )}
      </button>

      {abierto && (
        <div className="pointer-events-auto max-h-[60%] w-64 overflow-y-auto rounded-xl bg-black/80 p-2 text-white backdrop-blur">
          {solicitudes.length > 0 && (
            <div className="mb-2 rounded-lg bg-white/10 p-2">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
                Piden entrar
              </p>
              {solicitudes.map((s) => (
                <div key={s.userId} className="mb-1.5 last:mb-0">
                  <p className="truncate text-[12px] font-semibold">{s.nombre}</p>
                  <div className="mt-1 flex gap-1.5">
                    <button
                      type="button"
                      disabled={enCurso === s.userId}
                      onClick={() => decidir("approve", s.userId, s.nombre)}
                      className="rounded-lg bg-ca-lime px-2 py-1 text-[11px] font-bold text-ca-ink transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      Dejar entrar
                    </button>
                    <button
                      type="button"
                      disabled={enCurso === s.userId}
                      onClick={() => decidir("deny", s.userId, s.nombre)}
                      className="rounded-lg bg-white/10 px-2 py-1 text-[11px] font-bold transition-colors hover:bg-white/20 disabled:opacity-40"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

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
