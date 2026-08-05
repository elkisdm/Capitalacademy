"use client";

import { useCallback, useEffect, useRef } from "react";
import { ACTIVITY_BEAT_INTERVAL_MS } from "./actividad";

/**
 * Latido de actividad del alumno (ADR-0029).
 *
 * Late cada ACTIVITY_BEAT_INTERVAL_MS mientras la pestaña está VISIBLE, y se
 * detiene cuando deja de estarlo. Medir con la pestaña al fondo convertiría
 * "me olvidé de cerrar el classroom" en ocho horas de uso.
 *
 * Hay dos clases de latido y la diferencia importa:
 *
 * - `resumed` (al montar y al volver a ser visible): acredita CERO segundos y
 *   solo reabre el reloj. Es lo correcto porque no sabemos qué pasó en el
 *   intervalo anterior — la persona pudo estar 40 minutos en otra pestaña. Sin
 *   esto, cada vuelta regalaría el tope completo de tiempo fantasma.
 * - normal (el del intervalo, y el último antes de ocultarse): acredita el
 *   tiempo real transcurrido desde el latido anterior, recortado en la base.
 *
 * DEGRADACIÓN: es telemetría y se comporta como tal. El latido va sin `await`,
 * se traga cualquier error y no se reintenta. Ninguna pantalla del alumno
 * espera por esta llamada ni cambia si falla.
 */
export function useActividadTracker({
  cohortSlug,
}: {
  /** Slug o id de la cohorte en la ruta. Ausente fuera de una cohorte. */
  cohortSlug?: string;
} = {}) {
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const send = useCallback(
    (resumed: boolean, keepalive = false) => {
      const payload: { resumed: boolean; cohortSlug?: string } = { resumed };
      if (cohortSlug) payload.cohortSlug = cohortSlug;

      try {
        void fetch("/api/classroom/actividad", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive,
        }).catch(() => {
          // Un latido perdido no se reintenta: el siguiente llega en un minuto
          // y el tiempo se deriva del reloj del servidor, así que no se pierde
          // nada más que la resolución de ese tramo.
        });
      } catch {
        // fetch puede tirar de forma síncrona en contextos degradados.
      }
    },
    [cohortSlug],
  );

  useEffect(() => {
    const stop = () => {
      if (timerRef.current === undefined) return;
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    };

    const start = () => {
      if (timerRef.current !== undefined) return;
      send(true);
      timerRef.current = setInterval(() => send(false), ACTIVITY_BEAT_INTERVAL_MS);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        start();
        return;
      }
      // Último latido antes de irse: rescata el tramo entre el latido del
      // intervalo y el momento de ocultarse (hasta un minuto que si no se
      // perdería). keepalive porque "oculto" muchas veces es "cerrando".
      if (timerRef.current !== undefined) send(false, true);
      stop();
    };

    const handlePageHide = () => {
      if (timerRef.current !== undefined) send(false, true);
      stop();
    };

    if (document.visibilityState === "visible") start();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      stop();
    };
  }, [send]);
}
