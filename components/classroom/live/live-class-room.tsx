"use client";

import { useCallback, useState } from "react";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { liveMessage, tokenErrorMessage, type LiveScreenState } from "@/lib/livekit/room-state";

/**
 * Sala de clase en vivo del alumno (ADR-0031).
 *
 * El interior de la sala lo pone `<VideoConference />` de
 * `@livekit/components-react`: trae compartir pantalla, chat, barra de
 * controles, selección de dispositivos y —lo que más pesa acá— grilla PAGINADA.
 * Una primera versión hecha a mano se descartó por eso: su tira de miniaturas
 * no escalaba a los ~20 alumnos de una cohorte real, y alcanzar a la librería a
 * mano era reimplementar una app de videoconferencia entera.
 *
 * Lo que NO se delega en la librería es la autorización: el token lo emite
 * `/api/classroom/clase/[sessionId]/token` contra nuestra base (matrícula,
 * cohorte, ventana horaria, permisos por rol). Eso ningún SDK lo sabe.
 *
 * El token se pide al pulsar "Entrar" y no al montar: pedirlo antes gastaría
 * una credencial —y encendería el micrófono— en cada alumno que abre la
 * pantalla de la clase solo a mirar el material.
 */

type Conexion = { token: string; url: string };

type Estado = {
  screen: LiveScreenState;
  /** Mensaje del servidor cuando el token fue rechazado. */
  error: string | null;
  /**
   * Causa técnica del fallo, si la hubo.
   *
   * Se muestra en chico bajo el mensaje amable. Sin esto, un bloqueo del
   * navegador (una directiva de CSP que falta, un permiso denegado) se ve
   * exactamente igual que un corte de internet, y ni el alumno ni soporte
   * pueden distinguirlos. Es justo lo que pasó al estrenar esta pantalla.
   */
  detalle: string | null;
};

export function LiveClassRoom({ sessionId }: { sessionId: string }) {
  const [estado, setEstado] = useState<Estado>({
    screen: "idle",
    error: null,
    detalle: null,
  });
  const [conexion, setConexion] = useState<Conexion | null>(null);

  const entrar = useCallback(async () => {
    setEstado({ screen: "connecting", error: null, detalle: null });

    try {
      const res = await fetch(`/api/classroom/clase/${sessionId}/token`, { method: "POST" });
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null);
        setEstado({
          screen: "error",
          error: tokenErrorMessage(res.status, cuerpo?.error ?? null),
          detalle: `HTTP ${res.status}`,
        });
        return;
      }

      const { token, url } = (await res.json()) as Conexion;
      setConexion({ token, url });
      setEstado({ screen: "connected", error: null, detalle: null });
    } catch (e) {
      console.error("[clase en vivo] no se pudo pedir el token", e);
      setEstado({
        screen: "error",
        error: null,
        detalle: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      });
    }
  }, [sessionId]);

  // Cubre las dos salidas: el botón de colgar de la barra de controles y una
  // desconexión del servidor. En ambos casos se vuelve a la tarjeta de entrada,
  // desde donde se puede volver a entrar mientras la clase siga en curso.
  const salir = useCallback(() => {
    setConexion(null);
    setEstado({ screen: "disconnected", error: null, detalle: null });
  }, []);

  const fallo = useCallback((e: Error) => {
    console.error("[clase en vivo] error de la sala", e);
    setConexion(null);
    setEstado({ screen: "error", error: null, detalle: `${e.name}: ${e.message}` });
  }, []);

  const mensaje = liveMessage(estado.screen);

  /* ── Fuera de la sala ─────────────────────────────────────── */
  if (estado.screen !== "connected" || !conexion) {
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
          {estado.detalle && (
            <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-ca-ink-soft/70">
              {estado.detalle}
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
  return (
    <div
      // `data-lk-theme` engancha la hoja de estilos de la librería; las
      // variables `--lk-*` (en globals.css) la repintan con los colores de marca.
      data-lk-theme="default"
      className="ca-live-room overflow-hidden rounded-[18px]"
      style={{ height: "min(70vh, 560px)" }}
    >
      <LiveKitRoom
        token={conexion.token}
        serverUrl={conexion.url}
        connect
        // Micrófono sí, cámara no: entrar con la cámara encendida sin avisar es
        // invasivo, y en un aula de 20 es además ancho de banda que nadie pidió.
        audio
        video={false}
        onDisconnected={salir}
        onError={fallo}
        style={{ height: "100%" }}
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
