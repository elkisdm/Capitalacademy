import { describe, it, expect } from "vitest";
import { buildCampaignEmail } from "@/lib/email/campaign";
import { getBrandBySlug } from "@/lib/programs/registry";

const BASE = { subject: "Novedades de octubre", bodyMd: "Hola a todos." };

describe("buildCampaignEmail", () => {
  it("usa el asunto tal cual y devuelve html y texto", () => {
    const mail = buildCampaignEmail(BASE);
    expect(mail.subject).toBe("Novedades de octubre");
    expect(mail.html).toContain("<!doctype html>");
    expect(mail.text.length).toBeGreaterThan(0);
  });

  it("saluda por el nombre de pila", () => {
    const mail = buildCampaignEmail({ ...BASE, fullName: "Paola Vicuña Soto" });
    expect(mail.html).toContain("Hola, Paola");
    expect(mail.text).toContain("Hola, Paola.");
  });

  it("saluda sin quedar cojo cuando no hay nombre", () => {
    const mail = buildCampaignEmail({ ...BASE, fullName: null });
    expect(mail.html).toContain("Hola 👋");
    expect(mail.text.startsWith("Hola.")).toBe(true);
  });

  it("brandea con el acento del entorno", () => {
    const liderazgo = buildCampaignEmail({
      ...BASE,
      ctaLabel: "Entrar",
      ctaUrl: "https://capitalacademy.cl/classroom",
      brand: getBrandBySlug("liderazgo"),
    });
    // Ámbar de Liderazgo, no el violeta genérico.
    expect(liderazgo.html).toContain("#f5a524");
    expect(liderazgo.html).toContain("Liderazgo · Capital Academy");
  });

  it("incluye el botón solo si hay etiqueta Y enlace", () => {
    const conCta = buildCampaignEmail({
      ...BASE,
      ctaLabel: "Ver calendario",
      ctaUrl: "https://capitalacademy.cl/classroom",
    });
    expect(conCta.html).toContain("Ver calendario");
    expect(conCta.text).toContain("Ver calendario: https://capitalacademy.cl/classroom");

    const soloLabel = buildCampaignEmail({ ...BASE, ctaLabel: "Ver" });
    expect(soloLabel.html).not.toContain(">Ver</a>");
  });

  it("inserta el preheader oculto", () => {
    const mail = buildCampaignEmail({ ...BASE, preheader: "Cambios en el calendario" });
    expect(mail.html).toContain("Cambios en el calendario");
    expect(mail.html).toContain("display:none");
  });

  it("escapa HTML del cuerpo también en la campaña", () => {
    const mail = buildCampaignEmail({ ...BASE, bodyMd: "<img src=x onerror=1>" });
    expect(mail.html).not.toContain("<img src=x");
  });

  // La audiencia puede incluir matrículas invitadas/completadas/suspendidas,
  // así que el pie no puede afirmar "matrícula activa".
  it("explica por qué la persona recibe el correo sin afirmar el estado de matrícula", () => {
    const html = buildCampaignEmail(BASE).html;
    expect(html).toContain("estás inscrito en un programa de Capital Academy");
    expect(html).not.toContain("matrícula activa");
  });
});
