import { describe, it, expect } from "vitest";
import {
  emailButton,
  emailGreeting,
  emailSection,
  emailShell,
  firstNameOf,
} from "@/lib/email/layout";

describe("emailShell", () => {
  it("arma un documento con tablas email-safe y el eyebrow", () => {
    const html = emailShell({ eyebrow: "Diplomado · Capital Academy", bodyInner: "<tr></tr>" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('role="presentation"');
    expect(html).toContain("Diplomado · Capital Academy");
    expect(html).toContain("Ir a la plataforma");
  });

  it("escapa el eyebrow", () => {
    const html = emailShell({ eyebrow: "<b>x</b>", bodyInner: "" });
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("omite el bloque de preheader cuando no se pasa", () => {
    expect(emailShell({ eyebrow: "x", bodyInner: "" })).not.toContain("display:none");
  });

  it("incluye la nota de pie cuando se pasa", () => {
    const html = emailShell({ eyebrow: "x", bodyInner: "", footerNote: "Nota legal" });
    expect(html).toContain("Nota legal");
  });
});

describe("emailButton", () => {
  it("usa el acento recibido y escapa la etiqueta", () => {
    const html = emailButton("https://x.cl", "Ver <todo>", "#f5a524");
    expect(html).toContain("background:#f5a524");
    expect(html).toContain("Ver &lt;todo&gt;");
  });
});

describe("emailSection", () => {
  it("envuelve el contenido en una fila con padding", () => {
    expect(emailSection("<p>hola</p>")).toContain("<p>hola</p>");
  });
});

describe("emailGreeting / firstNameOf", () => {
  it("toma solo el nombre de pila", () => {
    expect(emailGreeting("Paola Vicuña Soto")).toBe("Hola, Paola 👋");
    expect(firstNameOf("Paola Vicuña Soto")).toBe("Paola");
  });

  it("degrada sin nombre", () => {
    expect(emailGreeting(null)).toBe("Hola 👋");
    expect(emailGreeting("   ")).toBe("Hola 👋");
    expect(firstNameOf(undefined)).toBe("");
  });

  it("escapa el nombre", () => {
    expect(emailGreeting("<script>")).toContain("&lt;script&gt;");
  });
});
