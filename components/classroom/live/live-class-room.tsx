"use client";

import { useCallback, useState } from "react";
import {
  LiveKitRoom,
  VideoConference,
  PreJoin,
  type LocalUserChoices,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { liveMessage, tokenErrorMessage, type LiveScreenState } from "@/lib/livekit/room-state";
import { ModerationPanel } from "./moderation-panel";
import { AplicarEleccion } from "./aplicar-eleccion";

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

type Conexion = { token: string; url: string; role: "teacher" | "student" };

/**
 * Lo que la persona eligió en la antesala: si entra con micrófono y cámara
 * encendidos, y con qué dispositivos.
 */
type Eleccion = Pick<
  LocalUserChoices,
  "audioEnabled" | "videoEnabled" | "audioDeviceId" | "videoDeviceId"
>;

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

export function LiveClassRoom({
  sessionId,
  fill = false,
  userName,
}: {
  sessionId: string;
  /** `true` en la pantalla propia de la sala: ocupa todo el alto disponible. */
  fill?: boolean;
  /**
   * Nombre del perfil, para rellenar la antesala.
   *
   * Es DECORATIVO: el nombre con que se aparece en la sala lo fija el token que
   * firma el servidor. Se rellena igual para que el campo diga la verdad en vez
   * de aparecer vacío pidiendo algo que no se va a usar.
   */
  userName?: string | null;
}) {
  const [estado, setEstado] = useState<Estado>({
    screen: "idle",
    error: null,
    detalle: null,
  });
  const [conexion, setConexion] = useState<Conexion | null>(null);
  const [eleccion, setEleccion] = useState<Eleccion | null>(null);
  const [enAntesala, setEnAntesala] = useState(false);

  const entrar = useCallback(async (elegido: Eleccion) => {
    setEleccion(elegido);
    setEnAntesala(false);
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

      const { token, url, role } = (await res.json()) as Conexion;
      setConexion({ token, url, role });
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
    setEnAntesala(false);
    setEstado({ screen: "disconnected", error: null, detalle: null });
  }, []);

  const fallo = useCallback((e: Error) => {
    console.error("[clase en vivo] error de la sala", e);
    setConexion(null);
    setEnAntesala(false);
    setEstado({ screen: "error", error: null, detalle: `${e.name}: ${e.message}` });
  }, []);

  /**
   * Un problema con el micrófono o la cámara NO puede echar a nadie de la clase.
   *
   * Sin esto, quien niega el permiso —o simplemente no tiene micrófono— quedaba
   * fuera con un `ConnectionError: Client initiated disconnect`, sin poder ni
   * mirar ni escuchar. Acá solo se registra: la persona sigue en la sala y puede
   * reintentar desde la barra de controles cuando resuelva sus permisos.
   */
  const falloDeDispositivo = useCallback((e: unknown) => {
    console.warn("[clase en vivo] no se pudo usar un dispositivo", e);
  }, []);

  const mensaje = liveMessage(estado.screen);

  // En la pantalla propia ya se está "aquí mismo", así que ese detalle sobra; lo
  // útil es anticipar que hay un paso previo para probar cámara y micrófono.
  const detalleEntrada =
    fill && estado.screen === "idle"
      ? "Antes de entrar podrás revisar tu cámara y tu micrófono."
      : mensaje.detail;

  /* ── Antesala ─────────────────────────────────────────────── */
  // Verse y probar el micrófono ANTES de entrar es lo que evita el clásico "no
  // se me escucha" en los primeros cinco minutos de clase. `PreJoin` de la
  // librería ya trae vista previa y selección de dispositivos.
  if (enAntesala && estado.screen !== "connected") {
    return (
      <div
        data-lk-theme="default"
        className={[
          "ca-live-room ca-live-prejoin overflow-hidden rounded-[18px]",
          fill ? "h-full" : "",
        ].join(" ")}
        style={fill ? undefined : { height: "min(70vh, 560px)" }}
      >
        <PreJoin
          onSubmit={entrar}
          onError={(e) => {
            console.warn("[clase en vivo] antesala", e);
          }}
          joinLabel="Entrar a la clase"
          micLabel="Micrófono"
          camLabel="Cámara"
          // El nombre real lo fija el token; acá solo se muestra.
          userLabel="Entrarás como"
          // Arranca con el micrófono listo y la cámara apagada: es lo que
          // conviene en un aula de 20, y desde acá se puede cambiar antes de
          // entrar, que es justo el punto de la antesala.
          defaults={{
            audioEnabled: true,
            videoEnabled: false,
            ...(userName ? { username: userName } : {}),
          }}
        />
      </div>
    );
  }

  /* ── Fuera de la sala ─────────────────────────────────────── */
  if (estado.screen !== "connected" || !conexion) {
    const ocupado = estado.screen === "connecting";
    return (
      <div
        className={[
          "ca-card flex flex-col items-start gap-3 p-5",
          fill ? "m-auto max-w-md" : "",
        ].join(" ")}
      >
        <div>
          <p className="text-[15px] font-black tracking-tight text-ca-ink">{mensaje.title}</p>
          {(estado.error ?? detalleEntrada) && (
            <p className="mt-1 text-[13px] leading-relaxed text-ca-ink-soft">
              {estado.error ?? detalleEntrada}
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
            onClick={() => setEnAntesala(true)}
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
      className="ca-live-room h-full overflow-hidden rounded-[18px]"
      style={fill ? undefined : { height: "min(70vh, 560px)" }}
    >
      <LiveKitRoom
        token={conexion.token}
        serverUrl={conexion.url}
        connect
        // Se CONECTA siempre silenciado y sin cámara, y lo que la persona eligió
        // en la antesala se aplica DESPUÉS (ver `AplicarEleccion`).
        //
        // Pedir dispositivos durante la conexión hace que un permiso denegado
        // tumbe la conexión entera y deje a la persona fuera de la clase, sin
        // poder ni mirar. Ya pasó una vez en el QA de esta pantalla; separar las
        // dos cosas es lo que impide que vuelva a pasar.
        audio={false}
        video={false}
        onDisconnected={salir}
        onError={fallo}
        onMediaDeviceFailure={falloDeDispositivo}
        style={{ height: "100%" }}
      >
        {/* `relative` acá para que el panel se posicione contra la sala. */}
        <div className="relative h-full">
          <AplicarEleccion
            micro={eleccion?.audioEnabled ?? false}
            camara={eleccion?.videoEnabled ?? false}
          />
          <VideoConference />
          {conexion.role === "teacher" && <ModerationPanel sessionId={sessionId} />}
        </div>
      </LiveKitRoom>
    </div>
  );
}
