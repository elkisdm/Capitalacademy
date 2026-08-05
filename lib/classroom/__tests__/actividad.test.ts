import { describe, it, expect } from "vitest";
import {
  ACTIVITY_BEAT_INTERVAL_MS,
  ACTIVITY_MAX_GAP_SECONDS,
  activityRiskLevel,
  chileDateKey,
  daysBetweenDateKeys,
  formatActiveDuration,
  formatInactivity,
  shiftDateKey,
} from "@/lib/classroom/actividad";

describe("constantes del latido", () => {
  it("el tope por latido es el doble del intervalo", () => {
    // Si esta relación se rompe, un latido demorado por jitter deja de contar
    // completo (tope < intervalo) o se abre la puerta a tiempo fantasma
    // (tope >> intervalo). Ver ADR-0029.
    expect(ACTIVITY_MAX_GAP_SECONDS).toBe((ACTIVITY_BEAT_INTERVAL_MS / 1000) * 2);
  });
});

describe("chileDateKey", () => {
  it("usa el día de Chile, no el de UTC, en invierno (UTC-4)", () => {
    // 02:00 UTC del 5-ago es todavía el 4-ago 22:00 en Chile.
    expect(chileDateKey(new Date("2026-08-05T02:00:00Z"))).toBe("2026-08-04");
  });

  it("devuelve el mismo día cuando UTC y Chile coinciden", () => {
    expect(chileDateKey(new Date("2026-08-05T12:00:00Z"))).toBe("2026-08-05");
  });

  it("respeta el horario de verano chileno (UTC-3)", () => {
    // En enero Chile va UTC-3: 02:00 UTC del 15-ene es el 14-ene 23:00.
    expect(chileDateKey(new Date("2027-01-15T02:00:00Z"))).toBe("2027-01-14");
  });

  it("cruza correctamente el fin de mes", () => {
    expect(chileDateKey(new Date("2026-09-01T01:00:00Z"))).toBe("2026-08-31");
  });
});

describe("daysBetweenDateKeys", () => {
  it("cuenta días calendario", () => {
    expect(daysBetweenDateKeys("2026-08-01", "2026-08-05")).toBe(4);
  });

  it("devuelve 0 para el mismo día", () => {
    expect(daysBetweenDateKeys("2026-08-05", "2026-08-05")).toBe(0);
  });

  it("cruza meses y años", () => {
    expect(daysBetweenDateKeys("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetweenDateKeys("2026-08-28", "2026-09-02")).toBe(5);
  });

  it("no se descuadra al cruzar el cambio de hora chileno", () => {
    // El horario de verano arranca el primer domingo de septiembre. Como las
    // claves ya vienen proyectadas a Chile, la resta es aritmética pura de días
    // y NO debe devolver 4,958… ni 5.
    expect(daysBetweenDateKeys("2026-09-04", "2026-09-08")).toBe(4);
  });

  it("devuelve null ante una clave inválida", () => {
    expect(daysBetweenDateKeys("no-es-fecha", "2026-08-05")).toBeNull();
    expect(daysBetweenDateKeys("2026-08-05", "05/08/2026")).toBeNull();
  });
});

describe("shiftDateKey", () => {
  it("retrocede días", () => {
    expect(shiftDateKey("2026-08-05", -30)).toBe("2026-07-06");
  });

  it("avanza días", () => {
    expect(shiftDateKey("2026-08-05", 3)).toBe("2026-08-08");
  });

  it("devuelve la clave tal cual si es inválida", () => {
    expect(shiftDateKey("basura", -7)).toBe("basura");
  });
});

describe("formatActiveDuration", () => {
  it("devuelve — cuando no hay dato o es cero", () => {
    expect(formatActiveDuration(null)).toBe("—");
    expect(formatActiveDuration(undefined)).toBe("—");
    expect(formatActiveDuration(0)).toBe("—");
    expect(formatActiveDuration(Number.NaN)).toBe("—");
  });

  it("colapsa menos de un minuto", () => {
    expect(formatActiveDuration(1)).toBe("< 1 min");
    expect(formatActiveDuration(59)).toBe("< 1 min");
  });

  it("muestra solo minutos bajo la hora", () => {
    expect(formatActiveDuration(60)).toBe("1 min");
    expect(formatActiveDuration(2700)).toBe("45 min");
  });

  it("muestra horas exactas sin minutos colgando", () => {
    expect(formatActiveDuration(3600)).toBe("1 h");
    expect(formatActiveDuration(7200)).toBe("2 h");
  });

  it("combina horas y minutos", () => {
    expect(formatActiveDuration(8100)).toBe("2 h 15 min");
    expect(formatActiveDuration(462180)).toBe("128 h 23 min");
  });

  it("trata los negativos como sin actividad", () => {
    expect(formatActiveDuration(-30)).toBe("—");
  });
});

describe("formatInactivity", () => {
  it("distingue nunca de hoy", () => {
    expect(formatInactivity(null)).toBe("Nunca");
    expect(formatInactivity(0)).toBe("Hoy");
  });

  it("usa singular para ayer", () => {
    expect(formatInactivity(1)).toBe("Ayer");
  });

  it("cuenta días a partir de dos", () => {
    expect(formatInactivity(2)).toBe("Hace 2 días");
    expect(formatInactivity(21)).toBe("Hace 21 días");
  });
});

describe("activityRiskLevel", () => {
  it("marca en riesgo a quien nunca entró", () => {
    expect(activityRiskLevel(null)).toBe("risk");
  });

  it("está ok bajo los 7 días", () => {
    expect(activityRiskLevel(0)).toBe("ok");
    expect(activityRiskLevel(6)).toBe("ok");
  });

  it("vigila entre 7 y 13 días", () => {
    expect(activityRiskLevel(7)).toBe("watch");
    expect(activityRiskLevel(13)).toBe("watch");
  });

  it("marca en riesgo desde 14 días", () => {
    expect(activityRiskLevel(14)).toBe("risk");
    expect(activityRiskLevel(60)).toBe("risk");
  });
});
