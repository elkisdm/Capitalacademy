import { describe, it, expect } from "vitest";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_ACTIVITY_KINDS,
  LEAD_ACTIVITY_LABELS,
  LEAD_CALL_OUTCOMES,
  LEAD_CALL_OUTCOME_LABELS,
  isLeadStage,
  toLeadStage,
  isTerminalStage,
  describeStageChange,
  esContacto,
  ultimoContacto,
  visibleConFiltroEtapa,
  diaChile,
  urgenciaDeTarea,
  estaPendiente,
  tareasPorAvisar,
} from "@/lib/admin/leads-pipeline";

describe("etapas", () => {
  it("toda etapa tiene etiqueta", () => {
    for (const stage of LEAD_STAGES) {
      expect(LEAD_STAGE_LABELS[stage]).toBeTruthy();
    }
  });

  it("el orden es el del embudo", () => {
    expect([...LEAD_STAGES]).toEqual([
      "nuevo",
      "contactado",
      "interesado",
      "matriculado",
      "descartado",
    ]);
  });

  it("isLeadStage acepta las válidas y rechaza el resto", () => {
    expect(isLeadStage("interesado")).toBe(true);
    expect(isLeadStage("zombie")).toBe(false);
    expect(isLeadStage(null)).toBe(false);
    expect(isLeadStage(42)).toBe(false);
    expect(isLeadStage(undefined)).toBe(false);
  });

  it("toLeadStage cae a 'nuevo' ante un valor inesperado", () => {
    expect(toLeadStage("contactado")).toBe("contactado");
    expect(toLeadStage("zombie")).toBe("nuevo");
    expect(toLeadStage(null)).toBe("nuevo");
  });

  it("matriculado y descartado son terminales; el resto no", () => {
    expect(isTerminalStage("matriculado")).toBe(true);
    expect(isTerminalStage("descartado")).toBe(true);
    expect(isTerminalStage("nuevo")).toBe(false);
    expect(isTerminalStage("contactado")).toBe(false);
    expect(isTerminalStage("interesado")).toBe(false);
  });

  it("describeStageChange usa las etiquetas, no los códigos", () => {
    expect(describeStageChange("nuevo", "contactado")).toBe("Nuevo → Contactado");
  });
});

describe("tipos de contacto", () => {
  it("todo kind y todo outcome tienen etiqueta", () => {
    for (const kind of LEAD_ACTIVITY_KINDS) {
      expect(LEAD_ACTIVITY_LABELS[kind]).toBeTruthy();
    }
    for (const outcome of LEAD_CALL_OUTCOMES) {
      expect(LEAD_CALL_OUTCOME_LABELS[outcome]).toBeTruthy();
    }
  });

  it("un cambio de etapa NO cuenta como haber contactado", () => {
    expect(esContacto("stage_change")).toBe(false);
    expect(esContacto("note")).toBe(true);
    expect(esContacto("call")).toBe(true);
    expect(esContacto("email")).toBe(true);
    expect(esContacto("whatsapp")).toBe(true);
  });

  describe("ultimoContacto", () => {
    it("devuelve el contacto más reciente sin depender del orden de entrada", () => {
      expect(
        ultimoContacto([
          { kind: "email", created_at: "2026-08-20T12:00:00Z" },
          { kind: "call", created_at: "2026-08-25T09:00:00Z" },
          { kind: "note", created_at: "2026-08-22T18:00:00Z" },
        ]),
      ).toBe("2026-08-25T09:00:00Z");
    });

    it("ignora los cambios de etapa aunque sean lo más reciente", () => {
      expect(
        ultimoContacto([
          { kind: "call", created_at: "2026-08-20T12:00:00Z" },
          { kind: "stage_change", created_at: "2026-08-26T12:00:00Z" },
        ]),
      ).toBe("2026-08-20T12:00:00Z");
    });

    it("es null si solo hubo cambios de etapa, o si no hubo nada", () => {
      expect(
        ultimoContacto([{ kind: "stage_change", created_at: "2026-08-26T12:00:00Z" }]),
      ).toBeNull();
      expect(ultimoContacto([])).toBeNull();
    });

    it("con 'todas' los descartados quedan fuera; con su chip, solo ellos", () => {
      expect(visibleConFiltroEtapa("descartado", "todas")).toBe(false);
      expect(visibleConFiltroEtapa("nuevo", "todas")).toBe(true);
      expect(visibleConFiltroEtapa("matriculado", "todas")).toBe(true);
      expect(visibleConFiltroEtapa("descartado", "descartado")).toBe(true);
      expect(visibleConFiltroEtapa("nuevo", "descartado")).toBe(false);
      expect(visibleConFiltroEtapa("contactado", "contactado")).toBe(true);
    });

    it("ignora la actividad automática (sin autor): el bot no es un contacto del equipo", () => {
      expect(
        ultimoContacto([
          { kind: "whatsapp", created_at: "2026-08-28T15:00:00Z", created_by: null },
        ]),
      ).toBeNull();
      // La manual (con autor) sí cuenta, y una sin el campo también (compatibilidad).
      expect(
        ultimoContacto([
          { kind: "whatsapp", created_at: "2026-08-28T15:00:00Z", created_by: null },
          { kind: "call", created_at: "2026-08-20T12:00:00Z", created_by: "user-1" },
        ]),
      ).toBe("2026-08-20T12:00:00Z");
    });

    it("descarta fechas ilegibles en vez de propagarlas", () => {
      expect(
        ultimoContacto([
          { kind: "call", created_at: "no-es-fecha" },
          { kind: "email", created_at: "2026-08-20T12:00:00Z" },
        ]),
      ).toBe("2026-08-20T12:00:00Z");
      expect(ultimoContacto([{ kind: "call", created_at: "no-es-fecha" }])).toBeNull();
    });
  });
});

describe("urgenciaDeTarea", () => {
  // 26-ago-2026 15:00 en Chile (UTC-4 en invierno) = 19:00 UTC.
  const ahora = new Date("2026-08-26T19:00:00Z");

  it("una tarea de hoy más temprano sigue siendo de hoy, no vencida", () => {
    // 26-ago 09:00 Chile — ya pasó la hora, pero es el mismo día laboral.
    expect(urgenciaDeTarea("2026-08-26T13:00:00Z", ahora)).toBe("hoy");
  });

  it("una tarea de hoy más tarde es de hoy", () => {
    expect(urgenciaDeTarea("2026-08-26T23:00:00Z", ahora)).toBe("hoy");
  });

  it("la de ayer está vencida", () => {
    expect(urgenciaDeTarea("2026-08-25T13:00:00Z", ahora)).toBe("vencida");
  });

  it("la de mañana es próxima", () => {
    expect(urgenciaDeTarea("2026-08-27T13:00:00Z", ahora)).toBe("proxima");
  });

  it("corta por el día chileno, no por el UTC", () => {
    // 27-ago 01:00 UTC = 26-ago 21:00 en Chile: sigue siendo HOY.
    expect(urgenciaDeTarea("2026-08-27T01:00:00Z", ahora)).toBe("hoy");
    // Mirado a las 26-ago 21:00 Chile (= 27-ago 01:00 UTC), una tarea del
    // 27-ago 13:00 UTC (= 27-ago 09:00 Chile) todavía es de mañana.
    expect(
      urgenciaDeTarea("2026-08-27T13:00:00Z", new Date("2026-08-27T01:00:00Z")),
    ).toBe("proxima");
  });

  it("cruza el cambio de año sin confundir el orden", () => {
    const anioNuevo = new Date("2027-01-01T15:00:00Z");
    expect(urgenciaDeTarea("2026-12-31T15:00:00Z", anioNuevo)).toBe("vencida");
  });

  it("una fecha ilegible no inventa una alarma", () => {
    expect(urgenciaDeTarea("no-es-fecha", ahora)).toBe("proxima");
  });
});

describe("diaChile", () => {
  it("proyecta el instante al día calendario de Santiago", () => {
    expect(diaChile(new Date("2026-08-27T01:00:00Z"))).toBe("2026-08-26");
    expect(diaChile(new Date("2026-08-26T19:00:00Z"))).toBe("2026-08-26");
  });
});

describe("estaPendiente", () => {
  it("pendiente es done_at null", () => {
    expect(estaPendiente({ done_at: null })).toBe(true);
    expect(estaPendiente({ done_at: "2026-08-26T12:00:00Z" })).toBe(false);
  });
});

describe("tareasPorAvisar", () => {
  const ahora = new Date("2026-08-26T19:00:00Z");

  const tareas = [
    { id: "prox", due_at: "2026-08-28T13:00:00Z", done_at: null },
    { id: "hoy", due_at: "2026-08-26T13:00:00Z", done_at: null },
    { id: "vieja", due_at: "2026-08-20T13:00:00Z", done_at: null },
    { id: "ayer", due_at: "2026-08-25T13:00:00Z", done_at: null },
    { id: "hecha", due_at: "2026-08-20T13:00:00Z", done_at: "2026-08-21T10:00:00Z" },
  ];

  it("solo avisa lo pendiente y vencido o de hoy", () => {
    const avisos = tareasPorAvisar(tareas, ahora);
    expect(avisos.map((t) => t.id)).toEqual(["vieja", "ayer", "hoy"]);
  });

  it("lo más atrasado va primero", () => {
    const avisos = tareasPorAvisar(tareas, ahora);
    expect(avisos[0].id).toBe("vieja");
  });

  it("marca la urgencia de cada una", () => {
    const avisos = tareasPorAvisar(tareas, ahora);
    expect(avisos.map((t) => t.urgency)).toEqual(["vencida", "vencida", "hoy"]);
  });

  it("nunca incluye una tarea ya hecha, por vencida que esté", () => {
    const avisos = tareasPorAvisar(tareas, ahora);
    expect(avisos.some((t) => t.id === "hecha")).toBe(false);
  });

  it("no avisa nada cuando todo está al día", () => {
    expect(tareasPorAvisar([{ due_at: "2026-08-30T13:00:00Z", done_at: null }], ahora)).toEqual([]);
    expect(tareasPorAvisar([], ahora)).toEqual([]);
  });

  it("no muta el arreglo de entrada", () => {
    const original = [...tareas];
    tareasPorAvisar(tareas, ahora);
    expect(tareas).toEqual(original);
  });
});
