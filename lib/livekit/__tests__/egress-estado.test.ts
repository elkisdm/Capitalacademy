import { describe, it, expect } from "vitest";
import {
  ESTADOS_GRABACION,
  egressTerminado,
  estaGrabando,
  estadoDesdeEgress,
  etiquetaEstado,
  filePathFor,
  confirmacionDetenerGrabacion,
  mensajeErrorGrabacion,
} from "@/lib/livekit/egress-estado";

/**
 * La máquina de estados de una grabación. Es lo único de este frente que se
 * puede ejercitar sin red ni base, y lo que impide que una reentrega tardía
 * reviva una fila cerrada y cree un segundo asset en Mux.
 */

describe("estaGrabando", () => {
  it("solo starting y active cuentan como grabación viva", () => {
    expect(estaGrabando("starting")).toBe(true);
    expect(estaGrabando("active")).toBe(true);
    expect(estaGrabando("uploaded")).toBe(false);
    expect(estaGrabando("ready")).toBe(false);
    expect(estaGrabando("failed")).toBe(false);
    expect(estaGrabando(null)).toBe(false);
    expect(estaGrabando(undefined)).toBe(false);
  });
});

describe("estadoDesdeEgress", () => {
  it("traduce los status de LiveKit", () => {
    expect(estadoDesdeEgress("EGRESS_STARTING")).toBe("starting");
    expect(estadoDesdeEgress("EGRESS_ACTIVE")).toBe("active");
    // Terminando todavía es grabar: el archivo aún no está en el bucket.
    expect(estadoDesdeEgress("EGRESS_ENDING")).toBe("active");
    expect(estadoDesdeEgress("EGRESS_COMPLETE")).toBe("uploaded");
    expect(estadoDesdeEgress("EGRESS_FAILED")).toBe("failed");
    expect(estadoDesdeEgress("EGRESS_ABORTED")).toBe("failed");
    expect(estadoDesdeEgress("EGRESS_LIMIT_REACHED")).toBe("failed");
  });

  it("un status desconocido no mueve la fila", () => {
    // Preferimos no interpretar un estado nuevo de una versión futura antes que
    // interpretarlo mal y cerrar una grabación que sigue viva.
    expect(estadoDesdeEgress("EGRESS_LO_QUE_VENGA")).toBeNull();
    expect(estadoDesdeEgress(undefined)).toBeNull();
    expect(estadoDesdeEgress(null)).toBeNull();
  });
});

describe("egressTerminado", () => {
  it("distingue el trabajo que ya cerró del que sigue vivo", () => {
    expect(egressTerminado("EGRESS_COMPLETE")).toBe(true);
    expect(egressTerminado("EGRESS_FAILED")).toBe(true);
    expect(egressTerminado("EGRESS_ACTIVE")).toBe(false);
    expect(egressTerminado("EGRESS_ENDING")).toBe(false);
    expect(egressTerminado(undefined)).toBe(false);
  });
});

describe("filePathFor", () => {
  it("empieza por el id de la sesión, para que borrar una clase sea borrar un prefijo", () => {
    expect(filePathFor("ses-1", "rec-9")).toBe("ses-1/rec-9.mp4");
  });
});

describe("etiquetaEstado", () => {
  it("sin grabación y con grabación fallida dicen lo mismo al docente", () => {
    // Al docente le importa el hecho —no se está grabando—, no de qué lado del
    // sistema falló.
    expect(etiquetaEstado(null)).toBe("No se está grabando esta clase");
    expect(etiquetaEstado("failed")).toBe("No se está grabando esta clase");
  });

  it("ningún estado se queda sin texto", () => {
    for (const estado of ESTADOS_GRABACION) {
      expect(etiquetaEstado(estado).length).toBeGreaterThan(0);
    }
  });
});

describe("confirmacionDetenerGrabacion", () => {
  it("avisa que detener no es pausar", () => {
    // Egress cierra el archivo: reanudar la misma grabación no existe, y
    // descubrirlo después del clic ya es tarde.
    expect(confirmacionDetenerGrabacion()).toMatch(/no se puede retomar/i);
  });
});

describe("mensajeErrorGrabacion", () => {
  it("muestra el mensaje del servidor TAL CUAL", () => {
    // Es el punto entero: "Entra a la sala antes de grabar." dice qué hacer;
    // cualquier reescritura del navegador lo empeora.
    expect(mensajeErrorGrabacion(409, { error: "Entra a la sala antes de grabar." })).toBe(
      "Entra a la sala antes de grabar.",
    );
  });

  it("pega la lista de lo que falta configurar, que es lo accionable del 503", () => {
    const texto = mensajeErrorGrabacion(503, {
      error: "La grabación no está configurada.",
      missing: ["LIVEKIT_URL", "SUPABASE_S3_REGION"],
    });
    expect(texto).toContain("La grabación no está configurada.");
    expect(texto).toContain("LIVEKIT_URL");
    expect(texto).toContain("SUPABASE_S3_REGION");
  });

  it("sin mensaje del servidor, no inventa una causa: nombra el código", () => {
    expect(mensajeErrorGrabacion(502, null)).toContain("502");
    expect(mensajeErrorGrabacion(500, { error: "   " })).toContain("500");
  });

  it("traduce los códigos que el navegador sí sabe interpretar", () => {
    expect(mensajeErrorGrabacion(401, null)).toMatch(/sesión expiró/i);
    expect(mensajeErrorGrabacion(403, null)).toMatch(/no puedes grabar/i);
    expect(mensajeErrorGrabacion(429, null)).toMatch(/espera un momento/i);
  });
});
