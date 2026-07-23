/**
 * Calidad de las transcripciones automaticas de Mux.
 *
 * El ASR de Mux a veces se rinde en tramos largos de habla real y los rellena
 * con marcadores de sonido ([Musica], [Aplausos]...), un cue cada 10s. La
 * transcripcion queda "ready" pero sin contenido: generar capitulos, resumenes
 * o quizzes sobre ella produce contenido inventado.
 */

/**
 * Sobre 13 transcripciones en produccion las sanas llegan hasta 5,8% de
 * marcadores y las rotas parten en 26,5%. El umbral cae en ese hueco.
 */
export const MAX_SOUND_MARKER_RATIO = 0.15;

/** Proporcion de lineas que son solo marcador de sonido (0 a 1). */
export function soundMarkerRatio(transcriptText: string): number {
  const lines = transcriptText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  if (lines.length === 0) return 0;

  const markerOnly = lines.filter(
    (line) => line.replace(/\[[^\]]*\]/g, "").trim() === "",
  ).length;

  return markerOnly / lines.length;
}

/**
 * Lanza si la transcripcion tiene demasiados marcadores de sonido como para
 * generar contenido con IA. El mensaje empieza con "transcript_degraded" para
 * que las rutas lo mapeen a un 422.
 */
export function assertTranscriptIsUsable(transcriptText: string): void {
  const ratio = soundMarkerRatio(transcriptText);

  if (ratio > MAX_SOUND_MARKER_RATIO) {
    const pct = Math.round(ratio * 100);
    throw new Error(
      `transcript_degraded: ${pct}% de la transcripcion son marcadores de sonido ([Musica] y similares), no texto de la clase`,
    );
  }
}
