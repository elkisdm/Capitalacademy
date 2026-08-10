import { describe, it, expect } from "vitest";
import { buildSessionChangeEmail } from "@/lib/email/session-change";

const BASE = {
  fullName: "Ana Pérez Soto",
  sessionTitle: "Sesión 4 — Cierre de negocios",
  previousStartsAtIso: "2026-08-16T14:00:00Z", // 10:00 en Chile (UTC-4)
  previousEndsAtIso: "2026-08-16T16:00:00Z",
  modality: "live_online",
  teacherName: "Paola Vicuña",
};

describe("buildSessionChangeEmail — reprogramación", () => {
  const mail = buildSessionChangeEmail({
    ...BASE,
    kind: "rescheduled",
    startsAtIso: "2026-08-16T19:00:00Z", // 15:00 en Chile
    endsAtIso: "2026-08-16T21:00:00Z",
  });

  it("el asunto dice que cambió el horario, con el nombre de la clase", () => {
    expect(mail.subject).toBe("Cambio de horario: Sesión 4 — Cierre de negocios");
  });

  // Quien recibe esto ya tiene otro correo con la hora vieja. Sin el contraste
  // no sabe cuál de los dos manda, así que ambas horas van sí o sí.
  it("muestra el horario anterior y el nuevo", () => {
    expect(mail.text).toContain("Horario anterior:");
    expect(mail.text).toContain("NUEVO horario:");
    expect(mail.text).toContain("10:00");
    expect(mail.text).toContain("15:00");
  });

  it("las horas van en hora de Chile, no en UTC", () => {
    // 14:00 UTC es 10:00 en Santiago; si saliera en UTC diría 14:00.
    expect(mail.text).toMatch(/Horario anterior:.*10:00 – 12:00/);
    expect(mail.text).not.toContain("14:00 – 16:00");
  });

  it("saluda por el nombre de pila", () => {
    expect(mail.text.startsWith("Hola, Ana.")).toBe(true);
  });

  it("incluye al docente cuando se conoce", () => {
    expect(mail.text).toContain("Docente: Paola Vicuña");
  });
});

describe("buildSessionChangeEmail — cancelación", () => {
  const mail = buildSessionChangeEmail({ ...BASE, kind: "cancelled" });

  it("el asunto dice que se canceló", () => {
    expect(mail.subject).toBe("Se canceló: Sesión 4 — Cierre de negocios");
  });

  it("dice explícitamente que la clase no se realizará", () => {
    expect(mail.text).toContain("NO se realizará");
  });

  // Prometer un horario nuevo en una cancelación sería el peor error posible
  // de este correo: alguien se conectaría a una clase que no existe.
  it("no muestra ningún horario nuevo", () => {
    expect(mail.text).not.toContain("NUEVO horario");
    expect(mail.html).not.toContain("Nuevo horario");
  });

  it("igual muestra cuándo estaba agendada, para que se reconozca cuál era", () => {
    expect(mail.text).toContain("Estaba para:");
    expect(mail.text).toContain("10:00");
  });
});

describe("buildSessionChangeEmail — detalles", () => {
  it("el motivo aparece cuando se escribe, y no estorba cuando no", () => {
    const con = buildSessionChangeEmail({
      ...BASE,
      kind: "cancelled",
      motivo: "Se reagenda para la próxima semana",
    });
    expect(con.text).toContain("Se reagenda para la próxima semana");

    const sin = buildSessionChangeEmail({ ...BASE, kind: "cancelled" });
    expect(sin.text).not.toContain("Se reagenda");
  });

  it("escapa el HTML de lo que escribe una persona", () => {
    const mail = buildSessionChangeEmail({
      ...BASE,
      kind: "cancelled",
      sessionTitle: '<script>alert("x")</script>',
      motivo: "<img onerror=1>",
    });

    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img onerror");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("funciona sin nombre y sin docente", () => {
    const mail = buildSessionChangeEmail({
      ...BASE,
      kind: "rescheduled",
      startsAtIso: "2026-08-16T19:00:00Z",
      endsAtIso: "2026-08-16T21:00:00Z",
      fullName: "",
      teacherName: null,
    });

    expect(mail.text.startsWith("Hola.")).toBe(true);
    expect(mail.text).not.toContain("Docente:");
  });
});
