import { describe, expect, it } from "vitest";
import {
  assertTranscriptIsUsable,
  soundMarkerRatio,
} from "@/lib/classroom/transcript-quality";

/** Construye una transcripcion con `markers` lineas de sonido y `speech` de habla. */
function transcript(markers: number, speech: number): string {
  return [
    ...Array.from({ length: markers }, () => " [Música]"),
    ...Array.from({ length: speech }, (_, i) => `Linea de la clase ${i}.`),
  ].join("\n");
}

describe("soundMarkerRatio", () => {
  it("es 0 en una transcripcion sin marcadores", () => {
    expect(soundMarkerRatio(transcript(0, 100))).toBe(0);
  });

  it("es 1 cuando todo son marcadores", () => {
    expect(soundMarkerRatio(transcript(50, 0))).toBe(1);
  });

  it("ignora lineas vacias", () => {
    expect(soundMarkerRatio("\n\n[Música]\n\nHabla real.\n\n")).toBe(0.5);
  });

  it("cuenta cualquier marcador de sonido, no solo musica", () => {
    expect(soundMarkerRatio("[Aplausos]\n[Risas]\nHabla real.")).toBeCloseTo(
      2 / 3,
    );
  });

  it("no cuenta una linea que mezcla marcador y habla", () => {
    expect(soundMarkerRatio("[Música] y aqui el profesor habla.")).toBe(0);
  });

  it("es 0 en una transcripcion vacia", () => {
    expect(soundMarkerRatio("")).toBe(0);
  });
});

describe("assertTranscriptIsUsable", () => {
  // Porcentajes medidos sobre las transcripciones reales en produccion.
  it("acepta las transcripciones sanas (hasta 5,8% de marcadores)", () => {
    expect(() => assertTranscriptIsUsable(transcript(58, 942))).not.toThrow();
  });

  it("rechaza la degradada al 26,5% (Educacion Financiera)", () => {
    expect(() => assertTranscriptIsUsable(transcript(373, 1037))).toThrow(
      /transcript_degraded/,
    );
  });

  it("rechaza la degradada al 76% (Rentix)", () => {
    expect(() => assertTranscriptIsUsable(transcript(365, 115))).toThrow(
      /transcript_degraded/,
    );
  });

  it("rechaza la degradada al 100% (IA aplicada al rol del asesor)", () => {
    expect(() => assertTranscriptIsUsable(transcript(809, 0))).toThrow(
      /transcript_degraded/,
    );
  });

  it("informa el porcentaje en el mensaje", () => {
    expect(() => assertTranscriptIsUsable(transcript(809, 0))).toThrow(/100%/);
  });
});
