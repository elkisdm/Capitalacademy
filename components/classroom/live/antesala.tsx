"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  usePreviewTracks,
  useMediaDeviceSelect,
  type LocalUserChoices,
} from "@livekit/components-react";
import { Track, type LocalVideoTrack } from "livekit-client";

/**
 * Antesala: verse y probar el micrófono ANTES de entrar (ADR-0031).
 *
 * Reemplaza al `PreJoin` de la librería, que resolvía la función pero traía su
 * propia estética: es la pantalla que ve TODO alumno con cuenta antes de cada
 * clase, y era lo único de la sala que seguía sin la identidad de la marca.
 *
 * Lo que NO se toca es la mecánica que ya está probada: se piden las pistas de
 * previsualización acá, se apagan al salir, y lo elegido viaja como
 * `LocalUserChoices` para que `AplicarEleccion` lo aplique DESPUÉS de conectar
 * — pedir dispositivos durante la conexión hacía que un permiso denegado
 * tumbara la conexión entera y dejara a la persona fuera de la clase.
 */
export function Antesala({
  userName,
  onSubmit,
  conectados,
  fill,
}: {
  userName: string | null;
  onSubmit: (elecciones: LocalUserChoices) => void;
  /** Cuántos ya están dentro, si se sabe. */
  conectados?: number | null;
  fill?: boolean;
}) {
  const [micro, setMicro] = useState(true);
  const [camara, setCamara] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [errorMedios, setErrorMedios] = useState<string | null>(null);

  const opciones = useMemo(
    () => ({ audio: micro, video: camara }),
    [micro, camara],
  );
  const pistas = usePreviewTracks(opciones, (e) => {
    console.warn("[antesala] no se pudo abrir el dispositivo", e);
    setErrorMedios(
      "No pudimos abrir tu cámara o micrófono. Revisa los permisos del navegador.",
    );
  });

  const pistaVideo = useMemo(
    () =>
      pistas?.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined,
    [pistas],
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !pistaVideo) return;
    pistaVideo.attach(el);
    return () => {
      pistaVideo.detach(el);
    };
  }, [pistaVideo]);

  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    kind: "audioinput",
    requestPermissions: false,
  });

  const iniciales = (userName ?? "").trim().split(/\s+/).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  const entrar = () => {
    setEntrando(true);
    onSubmit({
      username: userName ?? "",
      videoEnabled: camara,
      audioEnabled: micro,
      videoDeviceId: "",
      audioDeviceId: activeDeviceId ?? "",
    });
  };

  const redondo = (activo: boolean) =>
    [
      "flex h-12 w-12 items-center justify-center rounded-full transition-colors",
      activo
        ? "border border-white/15 bg-white/10 text-white hover:bg-white/15"
        : "border border-ca-rose bg-ca-rose text-white hover:brightness-110",
    ].join(" ");

  return (
    <div
      className={[
        "relative overflow-hidden rounded-[18px] bg-ca-ink text-white",
        fill ? "h-full" : "",
      ].join(" ")}
      style={fill ? undefined : { height: "min(70vh, 560px)" }}
    >
      {/* Halo, no círculo: a este tamaño el contenedor recorta el círculo del
          manual y queda un bloque suelto. El degradado da la misma presencia de
          marca sin bordes que delaten el recorte. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(680px 420px at 78% -12%, rgba(94,23,235,0.28), transparent 68%)",
        }}
      />

      <div className="relative flex h-full flex-col overflow-y-auto p-5 md:grid md:grid-cols-12 md:items-center md:gap-10 md:overflow-hidden md:p-10">
        {/* Vista previa */}
        <div className="md:col-span-7">
          <div className="relative aspect-[16/10] overflow-hidden rounded-[22px] border border-white/[0.09] bg-ca-navy-ink">
            {camara ? (
              <video
                ref={videoRef}
                // `autoPlay` no es opcional: sin él la pista queda adjunta pero
                // el elemento nunca arranca y la previa se ve NEGRA, que es peor
                // que no tenerla — la persona cree que su cámara no funciona.
                autoPlay
                muted
                playsInline
                // Espejo: uno se ve como en un espejo, no como lo ven los demás.
                className="h-full w-full -scale-x-100 object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-4">
                <span className="flex h-[92px] w-[92px] items-center justify-center rounded-full bg-ca-violet text-[30px] font-bold">
                  {iniciales || "?"}
                </span>
                <span className="text-[13px] text-white/45">Tu cámara está apagada</span>
              </div>
            )}

            <div className="absolute bottom-4 left-4 flex items-center gap-2.5 rounded-full bg-ca-navy-ink/70 px-4 py-2 backdrop-blur-sm">
              <span
                className={[
                  "h-1.5 w-1.5 rounded-full",
                  micro ? "animate-pulse bg-ca-lime" : "bg-white/30",
                ].join(" ")}
              />
              <span className="text-[13px] font-semibold">{userName ?? "Tú"}</span>
            </div>
          </div>

          {/* Controles */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setMicro((v) => !v)}
              className={redondo(micro)}
              aria-label={micro ? "Apagar micrófono" : "Encender micrófono"}
              aria-pressed={micro}
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3" />
                {!micro && <path d="M4 4l16 16" />}
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setCamara((v) => !v)}
              className={redondo(camara)}
              aria-label={camara ? "Apagar cámara" : "Encender cámara"}
              aria-pressed={camara}
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="6" width="12" height="12" rx="2.5" />
                <path d="M15 11l6-3.5v9L15 13" />
                {!camara && <path d="M4 4l16 16" />}
              </svg>
            </button>

            {devices.length > 1 && (
              <>
                <span className="h-7 w-px bg-white/10" aria-hidden />
                <label className="sr-only" htmlFor="antesala-microfono">
                  Micrófono
                </label>
                <select
                  id="antesala-microfono"
                  value={activeDeviceId}
                  onChange={(e) => void setActiveMediaDevice(e.target.value)}
                  className="h-12 max-w-[230px] truncate rounded-full border border-white/10 bg-white/[0.06] px-4 text-[13px] text-white/75 outline-none focus:border-ca-lime"
                >
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId} className="bg-ca-ink">
                      {d.label || "Micrófono"}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        {/* Tarjeta de entrada */}
        <div className="mt-5 md:col-span-5 md:mt-0">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.055] p-6 md:p-8">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
              Entrarás como
            </p>
            <h2 className="mb-6 text-[24px] font-black tracking-[-0.03em] md:text-[26px]">
              {userName ?? "Invitado"}
            </h2>

            <div className="mb-7 flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className={`h-[7px] w-[7px] rounded-full ${micro ? "bg-ca-lime" : "bg-white/30"}`} />
                <span className="text-[13px] text-white/70">
                  {micro ? "Micrófono activo" : "Entrarás en silencio"}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className={`h-[7px] w-[7px] rounded-full ${camara ? "bg-ca-lime" : "bg-white/30"}`} />
                <span className="text-[13px] text-white/70">
                  {camara ? "Cámara activa" : "Entrarás sin cámara"}
                </span>
              </div>
            </div>

            {errorMedios && (
              <p role="alert" className="mb-4 text-[12px] leading-relaxed text-ca-amber">
                {errorMedios}
              </p>
            )}

            <button
              type="button"
              onClick={entrar}
              disabled={entrando}
              className="ca-btn-lime ca-btn-interactive h-[54px] w-full text-[13px] font-bold uppercase tracking-[0.08em] disabled:opacity-60"
            >
              {entrando ? "Conectando…" : "Entrar a la clase"}
            </button>

            <p className="mt-4 text-pretty text-center text-[12px] leading-relaxed text-white/40">
              {typeof conectados === "number" && conectados > 0
                ? `${conectados} ${conectados === 1 ? "persona ya está" : "personas ya están"} en la clase. `
                : ""}
              Puedes cambiar cámara y micrófono en cualquier momento dentro de la clase.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
