import { describe, it, expect } from "vitest";
import { buildInstructorPatch, BIO_MAX, HEADLINE_MAX } from "../patch";

/**
 * Contrato compartido por las DOS rutas que editan el perfil docente: el panel
 * de operaciones y el autoservicio del profesor. Si acá se cuela un campo de
 * más, el docente podría editarlo de su propia ficha.
 */
describe("buildInstructorPatch", () => {
  it("acepta los cinco campos del perfil público", () => {
    const out = buildInstructorPatch({
      headline: "Directora Académica",
      bio: "Veinte años en el rubro.",
      linkedin_url: "linkedin.com/in/paola",
      instagram_url: "instagram.com/paola",
      website_url: "paola.cl",
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.patch.headline).toBe("Directora Académica");
    expect(out.patch.bio).toBe("Veinte años en el rubro.");
    expect(out.patch.linkedin_url).toBe("https://linkedin.com/in/paola");
  });

  // Lo que NO debe poder tocarse: identidad de la ficha y estado.
  it("descarta los campos que no son del perfil público", () => {
    const out = buildInstructorPatch({
      headline: "Profesor",
      full_name: "Otro Nombre",
      email: "otro@example.cl",
      is_active: false,
      profile_id: "00000000-0000-4000-8000-000000000000",
      photo_url: "https://evil.cl/x.png",
      id: "11111111-1111-4111-8111-111111111111",
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(Object.keys(out.patch)).toEqual(["headline"]);
  });

  it("guarda null y no cadena vacía al borrar un campo", () => {
    const out = buildInstructorPatch({ headline: "   ", bio: "" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.patch.headline).toBeNull();
    expect(out.patch.bio).toBeNull();
  });

  it("rechaza un enlace que no sea https y dice qué campo falló", () => {
    const out = buildInstructorPatch({ linkedin_url: "javascript:alert(1)" });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(422);
    expect(out.field).toBe("linkedin_url");
  });

  it("rechaza http:// en vez de reescribirlo en silencio", () => {
    const out = buildInstructorPatch({ website_url: "http://sitio.cl" });
    expect(out.ok).toBe(false);
  });

  it("normaliza el enlace a la forma que exige el CHECK de la base", () => {
    const out = buildInstructorPatch({ website_url: "https:/sitio.cl" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.patch.website_url).toMatch(/^https:\/\//);
  });

  it("rechaza un cuerpo sin ningún campo editable", () => {
    const out = buildInstructorPatch({ full_name: "Otro" });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(422);
  });

  it("rechaza textos que exceden el límite", () => {
    expect(buildInstructorPatch({ headline: "x".repeat(HEADLINE_MAX + 1) }).ok).toBe(false);
    expect(buildInstructorPatch({ bio: "x".repeat(BIO_MAX + 1) }).ok).toBe(false);
  });
});
