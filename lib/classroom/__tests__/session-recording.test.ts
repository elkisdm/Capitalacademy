import { describe, it, expect } from "vitest";
import { needsRecordingUpload } from "@/lib/classroom/session-recording";

const base = {
  isPast: true,
  status: "finished",
  modality: "live_online",
  hasReadyRecording: false,
};

describe("needsRecordingUpload", () => {
  it("clase en vivo ya ocurrida y sin repetición: sí necesita subida", () => {
    expect(needsRecordingUpload(base)).toBe(true);
    expect(needsRecordingUpload({ ...base, modality: "live_in_person" })).toBe(true);
  });

  it("clase que todavía no ocurre: no se ofrece el atajo", () => {
    expect(needsRecordingUpload({ ...base, isPast: false })).toBe(false);
  });

  it("con la repetición ya publicada: no se ofrece el atajo", () => {
    expect(needsRecordingUpload({ ...base, hasReadyRecording: true })).toBe(false);
  });

  it("clase cancelada: no se dictó, no hay nada que subir", () => {
    expect(needsRecordingUpload({ ...base, status: "cancelled" })).toBe(false);
  });

  it("clase 'recorded': ya es un video, no una clase en vivo por grabar", () => {
    expect(needsRecordingUpload({ ...base, modality: "recorded" })).toBe(false);
  });

  it("una clase pasada en curso o programada por status igual necesita subida", () => {
    // El status no siempre se cierra a mano: la fila usa la hora para saber que
    // la clase ya ocurrió, no el status.
    expect(needsRecordingUpload({ ...base, status: "scheduled" })).toBe(true);
    expect(needsRecordingUpload({ ...base, status: "in_progress" })).toBe(true);
  });
});
