import { describe, it, expect } from "vitest";
import { buildDeliverableOpenEmail } from "@/lib/email/deliverable-open";

function baseInput(
  overrides: Partial<Parameters<typeof buildDeliverableOpenEmail>[0]> = {},
) {
  return {
    email: "ana@example.com",
    fullName: "Ana Soto",
    deliverableTitle: "Entregable 1: Plan de negocio",
    dueAtIso: "2026-07-24T15:00:00.000Z", // 11:00 hrs Chile
    programName: "Diplomado 4ta Generación",
    url: "https://capitalacademy.cl/classroom/entregables/1",
    ...overrides,
  };
}

describe("buildDeliverableOpenEmail", () => {
  it("camino feliz: arma subject/html/text con el título del entregable", () => {
    const result = buildDeliverableOpenEmail(baseInput());

    expect(result.subject).toBe("Ya puedes subir: Entregable 1: Plan de negocio");
    expect(typeof result.html).toBe("string");
    expect(typeof result.text).toBe("string");
  });

  describe("programName", () => {
    it("con programName definido: lo usa en el cuerpo", () => {
      const result = buildDeliverableOpenEmail(
        baseInput({ programName: "Programa de Liderazgo" }),
      );

      expect(result.html).toContain("Programa de Liderazgo");
      expect(result.text).toContain("Programa de Liderazgo");
    });

    it("sin programName: cae al default 'Capital Academy'", () => {
      const result = buildDeliverableOpenEmail(baseInput({ programName: undefined }));

      expect(result.html).toContain(
        "Ya está abierta la ventana para subir tu entrega en Capital Academy",
      );
      expect(result.text).toContain(
        "Ya está abierta la ventana para subir tu entrega en Capital Academy",
      );
    });
  });

  describe("url del CTA", () => {
    it("con url definida: la usa en el botón y en el texto plano", () => {
      const result = buildDeliverableOpenEmail(
        baseInput({ url: "https://capitalacademy.cl/classroom/entregables/1" }),
      );

      expect(result.html).toContain(
        'href="https://capitalacademy.cl/classroom/entregables/1"',
      );
      expect(result.text).toContain(
        "Subir mi entrega: https://capitalacademy.cl/classroom/entregables/1",
      );
    });

    it("sin url: cae al link por defecto de la plataforma (/classroom)", () => {
      const result = buildDeliverableOpenEmail(baseInput({ url: undefined }));

      expect(result.html).toContain('href="https://capitalacademy.cl/classroom"');
      expect(result.text).toContain("Subir mi entrega: https://capitalacademy.cl/classroom");
    });
  });

  describe("saludo con primer nombre", () => {
    it("con fullName de varias palabras: saluda solo con el primer nombre", () => {
      const result = buildDeliverableOpenEmail(baseInput({ fullName: "Ana Sofía Soto Pérez" }));

      expect(result.html).toContain("Hola, Ana 👋");
      expect(result.text).toContain("Hola, Ana.");
    });

    it("fullName vacío: saluda sin nombre y sin coma", () => {
      const result = buildDeliverableOpenEmail(baseInput({ fullName: "" }));

      expect(result.html).toContain("Hola 👋");
      expect(result.html).not.toContain("Hola,");
      expect(result.text).toContain("Hola.");
      expect(result.text).not.toContain("Hola,");
    });
  });

  describe("fecha límite: formato es-CL / America/Santiago", () => {
    it("formatea la fecha y hora, con la anotación '(Chile)'", () => {
      const result = buildDeliverableOpenEmail(
        baseInput({ dueAtIso: "2026-07-24T15:00:00.000Z" }), // 11:00 hrs Chile
      );

      expect(result.html).toContain("viernes, 24 de julio, 11:00");
      expect(result.html).toContain("(Chile)");
      expect(result.text).toContain("Fecha límite: viernes, 24 de julio, 11:00 (Chile)");
    });
  });

  describe("esc(): escapa HTML solo en el cuerpo html", () => {
    it("escapa caracteres especiales en el título, el nombre y el programa", () => {
      const result = buildDeliverableOpenEmail(
        baseInput({
          deliverableTitle: `<script>alert("x")</script> & Tips`,
          fullName: `O'Brien <b>Jefe</b>`,
          programName: `Diplomado & Cía`,
        }),
      );

      expect(result.html).not.toContain('<script>alert("x")</script>');
      expect(result.html).toContain(
        "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Tips",
      );
      // El saludo solo usa el primer nombre (firstNameOf toma el primer token).
      expect(result.html).toContain("Hola, O&#39;Brien 👋");
      expect(result.html).toContain("Diplomado &amp; Cía");
      // El texto plano no escapa: va tal cual.
      expect(result.text).toContain(`Entregable: <script>alert("x")</script> & Tips`);
    });

    it("escapa el url en el href del botón CTA", () => {
      const result = buildDeliverableOpenEmail(
        baseInput({ url: 'https://capitalacademy.cl/x?a=1&b="2"' }),
      );

      expect(result.html).toContain(
        'href="https://capitalacademy.cl/x?a=1&amp;b=&quot;2&quot;"',
      );
    });
  });

  it("incluye el pie de página fijo de la plataforma", () => {
    const result = buildDeliverableOpenEmail(baseInput());

    expect(result.html).toContain("Capital Academy");
    expect(result.html).toContain("capitalacademy.cl/classroom");
    expect(result.text).toContain("Capital Academy · capitalacademy.cl/classroom");
  });

  it("incluye el título del entregable en la tarjeta del cuerpo", () => {
    const result = buildDeliverableOpenEmail(baseInput());

    expect(result.html).toContain("Entregable 1: Plan de negocio");
    expect(result.text).toContain("Entregable: Entregable 1: Plan de negocio");
  });
});
