import { describe, it, expect } from "vitest";
import {
  isSafeProfileUrl,
  normalizeProfileUrl,
  socialDisplay,
  buildSocialLinks,
  hasProfileContent,
} from "@/lib/instructors/social";

const EMPTY = {
  bio: null,
  headline: null,
  linkedin_url: null,
  instagram_url: null,
  website_url: null,
};

describe("isSafeProfileUrl", () => {
  it("acepta https con host", () => {
    expect(isSafeProfileUrl("https://www.linkedin.com/in/paola")).toBe(true);
    expect(isSafeProfileUrl("  https://capitalacademy.cl  ")).toBe(true);
  });

  it("rechaza http, protocolos peligrosos y esquemas raros", () => {
    expect(isSafeProfileUrl("http://linkedin.com/in/paola")).toBe(false);
    expect(isSafeProfileUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeProfileUrl("JavaScript:alert(1)")).toBe(false);
    expect(isSafeProfileUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeProfileUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeProfileUrl("ftp://archivos.cl/x")).toBe(false);
  });

  it("rechaza vacío, no-string, sin protocolo y con espacios internos", () => {
    expect(isSafeProfileUrl(null)).toBe(false);
    expect(isSafeProfileUrl(undefined)).toBe(false);
    expect(isSafeProfileUrl("")).toBe(false);
    expect(isSafeProfileUrl("   ")).toBe(false);
    expect(isSafeProfileUrl(42 as unknown as string)).toBe(false);
    expect(isSafeProfileUrl("linkedin.com/in/paola")).toBe(false);
    expect(isSafeProfileUrl("https://linkedin.com/in/pa ola")).toBe(false);
    expect(isSafeProfileUrl("https://linked\nin.com")).toBe(false);
    expect(isSafeProfileUrl("no es una url")).toBe(false);
  });

  it("rechaza URLs de más de 500 caracteres", () => {
    expect(isSafeProfileUrl(`https://x.cl/${"a".repeat(500)}`)).toBe(false);
  });

  it("rechaza https sin host", () => {
    expect(isSafeProfileUrl("https://")).toBe(false);
  });
});

describe("normalizeProfileUrl", () => {
  // El CHECK de la migración 0086 exige el literal `^https://`. Si se guardara
  // el texto crudo, un slash de menos pasaría la validación de la app, Postgres
  // rechazaría el UPDATE entero y se perdería también la reseña escrita a la vez.
  it("devuelve siempre una URL que cumple el CHECK ^https:// de la base", () => {
    const casos = ["https:/sitio.cl", "https:sitio.cl", "sitio.cl", "https://sitio.cl"];

    for (const caso of casos) {
      const out = normalizeProfileUrl(caso);
      expect(out.ok).toBe(true);
      expect(out.ok && out.value).toMatch(/^https:\/\//);
    }
  });

  it("normaliza el slash faltante en vez de guardar el texto crudo", () => {
    expect(normalizeProfileUrl("https:/paola.cl")).toEqual({
      ok: true,
      value: "https://paola.cl/",
    });
  });

  it("vacío, null y undefined se guardan como null", () => {
    expect(normalizeProfileUrl("")).toEqual({ ok: true, value: null });
    expect(normalizeProfileUrl("   ")).toEqual({ ok: true, value: null });
    expect(normalizeProfileUrl(null)).toEqual({ ok: true, value: null });
    expect(normalizeProfileUrl(undefined)).toEqual({ ok: true, value: null });
  });

  it("antepone https:// cuando falta el protocolo", () => {
    expect(normalizeProfileUrl("linkedin.com/in/paola")).toEqual({
      ok: true,
      value: "https://linkedin.com/in/paola",
    });
    expect(normalizeProfileUrl("  www.instagram.com/paola  ")).toEqual({
      ok: true,
      value: "https://www.instagram.com/paola",
    });
  });

  it("conserva la URL cuando ya viene con https", () => {
    expect(normalizeProfileUrl("https://capitalacademy.cl/equipo")).toEqual({
      ok: true,
      value: "https://capitalacademy.cl/equipo",
    });
  });

  it("rechaza http en vez de reescribirlo en silencio", () => {
    const res = normalizeProfileUrl("http://linkedin.com/in/paola");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("https://");
  });

  it("rechaza javascript: y otros protocolos", () => {
    expect(normalizeProfileUrl("javascript:alert(1)").ok).toBe(false);
    expect(normalizeProfileUrl("data:text/html,x").ok).toBe(false);
  });

  it("rechaza valores que no son texto", () => {
    const res = normalizeProfileUrl(123);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("El enlace debe ser texto");
  });

  it("rechaza un pegado gigante", () => {
    const res = normalizeProfileUrl(`https://x.cl/${"a".repeat(600)}`);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("demasiado largo");
  });

  it("rechaza texto que no forma una URL parseable", () => {
    expect(normalizeProfileUrl("no es una url").ok).toBe(false);
  });
});

describe("socialDisplay", () => {
  it("linkedin: muestra el handle final del path", () => {
    expect(socialDisplay("linkedin", "https://www.linkedin.com/in/paola-vicuna")).toBe(
      "paola-vicuna",
    );
    expect(socialDisplay("linkedin", "https://linkedin.com/in/paola/")).toBe("paola");
    expect(socialDisplay("linkedin", "https://linkedin.com/company/capital")).toBe("capital");
  });

  it("linkedin sin path cae al dominio", () => {
    expect(socialDisplay("linkedin", "https://www.linkedin.com")).toBe("linkedin.com");
  });

  it("instagram: antepone @ al primer segmento", () => {
    expect(socialDisplay("instagram", "https://instagram.com/capitalacademy")).toBe(
      "@capitalacademy",
    );
    expect(socialDisplay("instagram", "https://www.instagram.com")).toBe("instagram.com");
  });

  it("website: muestra el dominio sin www", () => {
    expect(socialDisplay("website", "https://www.capitalacademy.cl/equipo")).toBe(
      "capitalacademy.cl",
    );
  });

  it("URL impareseable cae al nombre de la red", () => {
    expect(socialDisplay("website", "no-es-url")).toBe("Sitio web");
  });
});

describe("buildSocialLinks", () => {
  it("devuelve los enlaces válidos en orden fijo", () => {
    const links = buildSocialLinks({
      linkedin_url: "https://linkedin.com/in/paola",
      instagram_url: "https://instagram.com/paola",
      website_url: "https://paola.cl",
    });
    expect(links.map((l) => l.network)).toEqual(["linkedin", "instagram", "website"]);
    expect(links[0]).toEqual({
      network: "linkedin",
      label: "LinkedIn",
      href: "https://linkedin.com/in/paola",
      display: "paola",
    });
  });

  it("omite los null y devuelve [] si no hay ninguno", () => {
    expect(buildSocialLinks(EMPTY)).toEqual([]);
    const links = buildSocialLinks({
      linkedin_url: null,
      instagram_url: "https://instagram.com/paola",
      website_url: null,
    });
    expect(links).toHaveLength(1);
    expect(links[0].network).toBe("instagram");
  });

  it("descarta en silencio una URL peligrosa que ya estuviera en la base", () => {
    const links = buildSocialLinks({
      linkedin_url: "javascript:alert(1)",
      instagram_url: "http://instagram.com/paola",
      website_url: "https://paola.cl",
    });
    expect(links.map((l) => l.network)).toEqual(["website"]);
  });

  it("normaliza los espacios sobrantes del href", () => {
    const links = buildSocialLinks({
      linkedin_url: "  https://linkedin.com/in/paola  ",
      instagram_url: null,
      website_url: null,
    });
    expect(links[0].href).toBe("https://linkedin.com/in/paola");
  });
});

describe("hasProfileContent", () => {
  it("false cuando la ficha está totalmente vacía", () => {
    expect(hasProfileContent(EMPTY)).toBe(false);
  });

  it("false cuando bio y headline son solo espacios", () => {
    expect(hasProfileContent({ ...EMPTY, bio: "   ", headline: "  " })).toBe(false);
  });

  it("true con bio, con headline o con una red válida", () => {
    expect(hasProfileContent({ ...EMPTY, bio: "Lidera el área académica." })).toBe(true);
    expect(hasProfileContent({ ...EMPTY, headline: "Directora Académica" })).toBe(true);
    expect(hasProfileContent({ ...EMPTY, website_url: "https://paola.cl" })).toBe(true);
  });

  it("false cuando la única red es inválida", () => {
    expect(hasProfileContent({ ...EMPTY, website_url: "javascript:alert(1)" })).toBe(false);
  });
});
