"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnectionState, useIsRecording } from "@livekit/components-react";
import {
  MENSAJE_GRABACION_DESHABILITADA,
  confirmacionDetenerGrabacion,
  estaGrabando,
  etiquetaEstado,
  mensajeErrorGrabacion,
  type EstadoGrabacion,
} from "@/lib/livekit/egress-estado";

/**
 * Control de grabación de la clase en vivo (ADR-0034).
 *
 * Se monta dentro de `<LiveKitRoom>` para TODOS, no solo para quien dicta: la
 * insignia "Grabando" es el aviso de que la sesión se está grabando, y la Ley
 * 21.719 lo pide a la vista de quien aparece en el video, no escondido en el
 * panel del docente.
 *
 * De dónde sale cada cosa:
 * - La INSIGNIA sale de `useIsRecording()`, que LiveKit propaga por la sala a
 *   todos los participantes. No se consulta nuestra API para eso: el alumno
 *   recibe 403 en `/grabacion` a propósito, y sondear una ruta prohibida sería
 *   ruido garantizado.
 * - El ESTADO detallado (preparando, subiendo, falló) sale de nuestra API y solo
 *   lo ve el docente, porque es lo único que le dice si tiene que subir la
 *   repetición a mano.
 *
 * Los errores del servidor se muestran TAL CUAL. Este frente vive de que el
 * egress puede no estar desplegado todavía: "La grabación no está configurada"
 * con la lista de variables que faltan es información accionable, y taparla con
 * un "algo salió mal" convierte un despliegue incompleto en un misterio.
 */

type EstadoApi = {
  grabando?: boolean;
  estado?: EstadoGrabacion | null;
  error?: string | null;
  deshabilitado?: boolean;
};

export function GrabacionControl({
  sessionId,
  esDocente,
}: {
  sessionId: string;
  /** Solo quien dicta la clase ve los controles; el resto ve la insignia. */
  esDocente: boolean;
}) {
  const grabandoEnSala = useIsRecording();
  const [estado, setEstado] = useState<EstadoGrabacion | null>(null);
  const [enCurso, setEnCurso] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Sondeo SOLO mientras hay algo en movimiento: una grabación que ya terminó no
  // cambia sola, y este classroom ya sufrió una cascada de `statement timeout`
  // por sondeos que corrían todo el rato. La primera consulta sí es siempre: el
  // docente puede haber recargado con la grabación ya en curso, y sin ella vería
  // el botón de arrancar sobre una grabación viva.
  const enMovimiento =
    estado === "starting" || estado === "active" || estado === "uploaded" || estado === "ingesting";

  useEffect(() => {
    if (!esDocente) return;
    let vivo = true;

    const consultar = async () => {
      try {
        const res = await fetch(`/api/classroom/clase/${sessionId}/grabacion`);
        if (!res.ok || !vivo) return;
        const cuerpo = (await res.json()) as EstadoApi;
        if (!vivo) return;
        setEstado(cuerpo.estado ?? null);
        // El motivo de un fallo lo escribe el servidor y llega en la misma
        // respuesta; sin esto el docente ve "no se está grabando" sin saber por qué.
        if (cuerpo.estado === "failed" && cuerpo.error) setAviso(cuerpo.error);
      } catch {
        // Un fallo puntual de red no cambia el estado: se reintenta al próximo tick.
      }
    };

    void consultar();
    if (!enMovimiento) {
      return () => {
        vivo = false;
      };
    }

    const id = setInterval(() => void consultar(), 30000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [esDocente, sessionId, enMovimiento]);

  const pedir = useCallback(
    async (metodo: "POST" | "DELETE", opciones?: { automatico?: boolean }) => {
      const automatico = opciones?.automatico ?? false;
      setEnCurso(true);
      if (!automatico) setAviso(null);
      try {
        const res = await fetch(`/api/classroom/clase/${sessionId}/grabacion`, { method: metodo });
        const cuerpo = (await res.json().catch(() => null)) as
          | (EstadoApi & { missing?: string[] })
          | null;

        if (!res.ok) {
          // El intento automático no regaña por un 409 de timing (la sala aún
          // no figura en el servidor); el docente tiene el botón a la vista.
          // Los errores de configuración SÍ se muestran: son accionables.
          if (!automatico || res.status !== 409) {
            setAviso(mensajeErrorGrabacion(res.status, cuerpo));
          }
          return;
        }
        if (cuerpo?.deshabilitado) {
          // Con el interruptor apagado el intento automático se va en silencio:
          // es el estado normal de un despliegue sin egress, no una novedad.
          if (!automatico) setAviso(MENSAJE_GRABACION_DESHABILITADA);
          return;
        }
        setEstado(cuerpo?.estado ?? null);
        if (cuerpo?.estado === "failed" && cuerpo.error) setAviso(cuerpo.error);
      } catch (e) {
        console.error("[grabación] falló la llamada", e);
        if (!automatico) {
          setAviso("No pudimos hablar con el servicio de grabación. Revisa tu conexión.");
        }
      } finally {
        if (montado.current) setEnCurso(false);
      }
    },
    [sessionId],
  );

  // Arranque AUTOMÁTICO (D5 del ADR-0034): la grabación parte sola cuando el
  // docente queda conectado — si dependiera del botón, el cuello de botella
  // humano se habría movido, no eliminado. Una sola vez por montaje: si el
  // docente detiene a mano, volver a grabar es una decisión suya, no nuestra.
  const conexion = useConnectionState();
  const autoIntentado = useRef(false);
  useEffect(() => {
    if (!esDocente || conexion !== "connected" || autoIntentado.current) return;
    autoIntentado.current = true;
    void pedir("POST", { automatico: true });
  }, [esDocente, conexion, pedir]);

  const detener = useCallback(() => {
    if (!window.confirm(confirmacionDetenerGrabacion())) return;
    void pedir("DELETE");
  }, [pedir]);

  // La sala manda sobre lo que creemos localmente: si LiveKit dice que se está
  // grabando, se está grabando, aunque nuestra fila todavía diga `starting`.
  const grabando = grabandoEnSala || estaGrabando(estado);

  // Para el resto de la sala esto es solo un aviso superpuesto: sin `absolute`
  // empujaría el video de la clase para hacerse sitio.
  if (!esDocente) {
    if (!grabando) return null;
    return (
      <div className="pointer-events-none absolute left-3 top-3 z-10">
        <Insignia />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[min(18rem,70vw)] flex-col items-start gap-2">
      {grabando && <Insignia />}

      <button
        type="button"
        onClick={grabando ? detener : () => void pedir("POST")}
        disabled={enCurso}
        aria-busy={enCurso}
        className={[
          "pointer-events-auto min-h-[44px] rounded-xl px-3 py-1.5 text-[12px] font-bold backdrop-blur transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-violet/40",
          "disabled:opacity-40",
          grabando
            ? "bg-ca-rose/90 text-white hover:bg-ca-rose"
            : "bg-black/60 text-white hover:bg-black/80",
        ].join(" ")}
      >
        {enCurso ? "Un momento…" : grabando ? "Detener grabación" : "Grabar"}
      </button>

      {/* El estado detallado solo cuando aporta: con la insignia arriba, repetir
          "Grabando" en texto es ruido. */}
      {!grabando && estado && estado !== "failed" && (
        <span className="pointer-events-none rounded-lg bg-black/60 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
          {etiquetaEstado(estado)}
        </span>
      )}

      {aviso && (
        <p
          aria-live="polite"
          className="pointer-events-auto rounded-lg bg-black/70 px-2 py-1.5 text-[11px] leading-relaxed text-white backdrop-blur"
        >
          {aviso}
        </p>
      )}
    </div>
  );
}

/** Lo que ve cualquiera en la sala mientras se graba. */
function Insignia() {
  return (
    <span
      className="pointer-events-none inline-flex items-center gap-1.5 rounded-full bg-ca-rose/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white backdrop-blur"
      role="status"
    >
      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-white" aria-hidden="true" />
      Grabando
    </span>
  );
}
