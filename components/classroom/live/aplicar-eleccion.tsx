"use client";

import { useEffect, useRef } from "react";
import { useLocalParticipant } from "@livekit/components-react";

/**
 * Aplica lo que la persona eligió en la antesala, UNA VEZ y ya conectada.
 *
 * Existe para separar dos cosas que no deben depender una de la otra: entrar a
 * la clase y encender los dispositivos. Cuando se piden al conectar, un permiso
 * denegado tumba la conexión entera y la persona queda fuera sin poder ni mirar
 * ni escuchar —pasó en el QA de esta pantalla—. Acá, si el micrófono falla, lo
 * único que ocurre es que se entra en silencio.
 */
export function AplicarEleccion({ micro, camara }: { micro: boolean; camara: boolean }) {
  const { localParticipant } = useLocalParticipant();
  // Solo al entrar: después manda la barra de controles, y volver a aplicar
  // pisaría lo que la persona acaba de decidir ahí.
  const yaAplicado = useRef(false);

  useEffect(() => {
    if (yaAplicado.current || !localParticipant) return;
    yaAplicado.current = true;

    if (micro) {
      localParticipant.setMicrophoneEnabled(true).catch((e: unknown) => {
        console.warn("[clase en vivo] no se pudo abrir el micrófono", e);
      });
    }
    if (camara) {
      localParticipant.setCameraEnabled(true).catch((e: unknown) => {
        console.warn("[clase en vivo] no se pudo encender la cámara", e);
      });
    }
  }, [localParticipant, micro, camara]);

  return null;
}
