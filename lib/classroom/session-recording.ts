/**
 * Regla de "a esta clase le falta la repetición", en lógica pura.
 *
 * Vive fuera del componente porque decide qué se le ofrece al equipo en el
 * calendario (0041): el panel de grabación está enterrado dentro de la edición
 * de la clase, así que la fila solo muestra el atajo donde de verdad falta
 * subir el archivo. Ofrecerlo de más ensucia el listado; de menos, deja la
 * clase sin repetición, que es el problema que se está corrigiendo.
 */
export function needsRecordingUpload(params: {
  /** La clase ya terminó (derivado de la hora, no del status). */
  isPast: boolean;
  status: string;
  modality: string;
  /** Ya hay video publicado en Mux para esa clase. */
  hasReadyRecording: boolean;
}): boolean {
  const { isPast, status, modality, hasReadyRecording } = params;
  // Una clase cancelada no se dictó y una 'recorded' YA es un video: ninguna
  // espera que alguien suba una grabación.
  if (!isPast || hasReadyRecording) return false;
  if (status === "cancelled") return false;
  return modality !== "recorded";
}
