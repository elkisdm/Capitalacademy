import { describe, it, expect } from "vitest";
import {
  formatChile,
  formatDateOnly,
  isoToChileWallTime,
  chileWallTimeToIso,
} from "@/lib/time";

describe("formatChile", () => {
  it("formatea un instante antes de la transición (6-sep-2026) en UTC-4", () => {
    // 2026-09-01T14:00:00Z, invierno chileno (UTC-4) → 10:00 local.
    expect(
      formatChile("2026-09-01T14:00:00Z", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).replace(/[\u00a0\u202f]/g, " "),
    ).toBe("1 sept, 10:00 a. m.");
  });

  it("formatea un instante después de la transición (6-sep-2026) en UTC-3", () => {
    // 2026-09-10T14:00:00Z, ya en horario de verano (UTC-3) → 11:00 local.
    expect(
      formatChile("2026-09-10T14:00:00Z", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).replace(/[\u00a0\u202f]/g, " "),
    ).toBe("10 sept, 11:00 a. m.");
  });

  it("reproduce el caso real de C-1: clase 21-jul 10:00 Chile no debe verse como 14:00", () => {
    const result = formatChile("2026-07-21T14:00:00Z", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(result).toContain("10:00");
    expect(result).not.toContain("02:00");
  });

  it("devuelve '—' para null, undefined, vacío o un string no-fecha", () => {
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    expect(formatChile(null, opts)).toBe("—");
    expect(formatChile(undefined, opts)).toBe("—");
    expect(formatChile("", opts)).toBe("—");
    expect(formatChile("no-es-fecha", opts)).toBe("—");
  });
});

describe("formatDateOnly", () => {
  it("formatea una columna `date` sin retroceder de día", () => {
    // cohorts.start_date = "2026-06-20" (columna `date`, sin instante).
    expect(
      formatDateOnly("2026-06-20", { day: "numeric", month: "short", year: "numeric" }),
    ).toBe("20 jun 2026");
  });

  it("usa UTC, no Chile: aplicar Chile a una columna `date` la retrocede un día (caso a NO reproducir)", () => {
    // Demuestra por qué formatDateOnly existe: formatear el mismo día como si
    // fuera un instante y proyectarlo a Chile lo retrocede al 19.
    const wronglyUsingChile = formatChile("2026-06-20T00:00:00Z", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    expect(wronglyUsingChile).toBe("19 jun 2026");

    const correct = formatDateOnly("2026-06-20", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    expect(correct).toBe("20 jun 2026");
  });

  it("devuelve '—' para null, undefined, vacío o un string no-fecha", () => {
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
    expect(formatDateOnly(null, opts)).toBe("—");
    expect(formatDateOnly(undefined, opts)).toBe("—");
    expect(formatDateOnly("", opts)).toBe("—");
    expect(formatDateOnly("no-es-fecha", opts)).toBe("—");
  });
});

describe("isoToChileWallTime / chileWallTimeToIso", () => {
  it("hace round-trip en un día normal (invierno, UTC-4)", () => {
    const iso = chileWallTimeToIso("2026-07-21T10:00");
    expect(iso).toBe("2026-07-21T14:00:00.000Z");
    expect(isoToChileWallTime(iso)).toBe("2026-07-21T10:00");
  });

  it("hace round-trip en un día normal (verano, UTC-3)", () => {
    const iso = chileWallTimeToIso("2026-09-10T10:00");
    expect(iso).toBe("2026-09-10T13:00:00.000Z");
    expect(isoToChileWallTime(iso)).toBe("2026-09-10T10:00");
  });

  it("resuelve correctamente la hora de pared 02:00 del día de la transición (B-7)", () => {
    // 2026-09-06T02:00 hora de pared ya cae en horario de verano (UTC-3):
    // el salto de reloj ocurre a las 00:00→01:00 esa madrugada. Con una
    // sola pasada (offset calculado sobre la estimación ingenua) esto da
    // 06:00Z; con dos pasadas da el valor correcto, 05:00Z.
    const iso = chileWallTimeToIso("2026-09-06T02:00");
    expect(iso).toBe("2026-09-06T05:00:00.000Z");
    expect(iso).not.toBe("2026-09-06T06:00:00.000Z");
    expect(isoToChileWallTime(iso)).toBe("2026-09-06T02:00");
  });
});
