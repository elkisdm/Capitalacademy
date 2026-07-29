import { describe, it, expect } from "vitest";
import { buildSurveyInvitationEmail } from "@/lib/email/survey-invitation";
import { getBrandBySlug } from "@/lib/programs/registry";

const BASE = {
  surveyTitle: "¿Qué te pareció la clase de IA?",
  surveyUrl: "https://capitalinteligente.com/s/feedback-clase-ia-2026",
};

describe("buildSurveyInvitationEmail", () => {
  it("pone el título en el asunto", () => {
    expect(buildSurveyInvitationEmail(BASE).subject).toBe("¿Qué te pareció la clase de IA?");
  });

  it("agrega la duración estimada al asunto y al cuerpo", () => {
    const mail = buildSurveyInvitationEmail({ ...BASE, estimatedMinutes: 3 });
    expect(mail.subject).toBe("¿Qué te pareció la clase de IA? (3 minutos)");
    expect(mail.html).toContain("3 minutos");
  });

  it("usa singular con un minuto", () => {
    expect(buildSurveyInvitationEmail({ ...BASE, estimatedMinutes: 1 }).subject).toContain(
      "(1 minuto)",
    );
  });

  // Núcleo del anonimato: el correo se personaliza, el enlace NO.
  it("personaliza el saludo pero deja el enlace idéntico", () => {
    const a = buildSurveyInvitationEmail({ ...BASE, fullName: "Ana Pérez" });
    const b = buildSurveyInvitationEmail({ ...BASE, fullName: "Luis Soto" });

    expect(a.html).toContain("Hola, Ana");
    expect(b.html).toContain("Hola, Luis");
    expect(a.html).toContain(`href="${BASE.surveyUrl}"`);
    expect(b.html).toContain(`href="${BASE.surveyUrl}"`);
  });

  it("no concatena ningún identificador a la URL", () => {
    const mail = buildSurveyInvitationEmail({ ...BASE, fullName: "Ana Pérez" });
    for (const param of ["?email=", "&email=", "uid=", "token=", "?t="]) {
      expect(mail.html).not.toContain(param);
      expect(mail.text).not.toContain(param);
    }
  });

  it("declara el anonimato en el cuerpo y en el pie", () => {
    const mail = buildSurveyInvitationEmail(BASE);
    expect(mail.html).toContain("No registramos quién responde qué");
    expect(mail.html).toContain("no quedan asociadas a tu nombre");
  });

  it("brandea con el acento del entorno", () => {
    const mail = buildSurveyInvitationEmail({ ...BASE, brand: getBrandBySlug("capacitaciones") });
    expect(mail.html).toContain("#d14a6b");
  });

  it("acepta una bajada propia", () => {
    const mail = buildSurveyInvitationEmail({ ...BASE, intro: "Queremos saber tu opinión." });
    expect(mail.html).toContain("Queremos saber tu opinión.");
    expect(mail.text).toContain("Queremos saber tu opinión.");
  });
});
