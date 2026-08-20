"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useConnectionQualityIndicator } from "@livekit/components-react";
import { etiquetaConexion, type CalidadConexion } from "@/lib/livekit/room-state";

/**
 * Píldora de estado de la conexión, en la barra superior de la sala.
 *
 * Se monta por PORTAL y no como hijo del encabezado porque `SalaShell` vive
 * fuera de `<LiveKitRoom>`: el encabezado lo pinta la página (servidor) y la
 * calidad de conexión solo existe dentro del contexto del SDK. Mover el
 * encabezado adentro obligaría a que toda la cabecera fuera cliente y a que la
 * portada del invitado —que tiene cabecera propia— la duplicara.
 *
 * Efecto secundario deseado: la píldora existe exactamente mientras la sala
 * está montada. Al salir de la clase desaparece sola, sin que nadie la apague.
 */
export function EstadoConexion() {
  const { quality } = useConnectionQualityIndicator();
  const [ancla, setAncla] = useState<HTMLElement | null>(null);

  // El ancla la pinta el servidor, así que existe antes que este efecto. Se
  // busca en un efecto y no al renderizar para no tocar el DOM durante el
  // render, que en React 19 rompe la hidratación.
  useEffect(() => {
    setAncla(document.getElementById(ANCLA_ID));
  }, []);

  const etiqueta = etiquetaConexion(quality as CalidadConexion);
  if (!ancla || !etiqueta) return null;

  return createPortal(
    <span
      className={`flex items-center gap-2 text-[12px] ${TONOS[etiqueta.tono]}`}
      // Cambia solo cuando la conexión empeora de verdad; anunciarlo en cada
      // fluctuación convertiría al lector de pantalla en un metrónomo.
      aria-live="polite"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M3 13.5l3-4 3 2.5 3.5-5 3 4.5 2.5-2 4 4" />
      </svg>
      <span className="hidden sm:inline">{etiqueta.texto}</span>
    </span>,
    ancla,
  );
}

/** Id del hueco que `SalaShell` deja en el encabezado para esta píldora. */
export const ANCLA_ID = "ca-sala-conexion";

const TONOS: Record<"ok" | "aviso" | "malo", string> = {
  ok: "text-white/55",
  aviso: "text-ca-amber",
  malo: "text-ca-rose",
};
