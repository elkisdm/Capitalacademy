import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  markdownToEmailHtml,
  markdownToPlainText,
} from "@/lib/email/markdown";

const ACCENT = "#5e17eb";

describe("escapeHtml", () => {
  it("escapa los cinco caracteres peligrosos", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;",
    );
  });
});

describe("markdownToEmailHtml", () => {
  it("renderiza párrafos con estilo inline (no clases CSS)", () => {
    const html = markdownToEmailHtml("Hola a todos.", ACCENT);
    expect(html).toContain("<p style=");
    expect(html).toContain("Hola a todos.");
    expect(html).not.toContain("class=");
  });

  it("respeta los saltos de línea sueltos dentro de un párrafo", () => {
    const html = markdownToEmailHtml("Primera\nSegunda", ACCENT);
    expect(html).toContain("Primera<br />Segunda");
  });

  it("renderiza títulos de nivel 2 y 3", () => {
    expect(markdownToEmailHtml("## Título", ACCENT)).toContain("<h2 style=");
    expect(markdownToEmailHtml("### Sub", ACCENT)).toContain("<h3 style=");
  });

  it("renderiza listas con viñetas y numeradas", () => {
    const bullets = markdownToEmailHtml("- uno\n- dos", ACCENT);
    expect(bullets).toContain("<ul style=");
    expect(bullets.match(/<li /g)).toHaveLength(2);

    const ordered = markdownToEmailHtml("1. uno\n2. dos", ACCENT);
    expect(ordered).toContain("<ol style=");
  });

  it("renderiza el separador ---", () => {
    expect(markdownToEmailHtml("---", ACCENT)).toContain("<hr style=");
  });

  it("aplica negrita y cursiva sin confundir ** con *", () => {
    const html = markdownToEmailHtml("**fuerte** y *suave*", ACCENT);
    expect(html).toContain("<strong");
    expect(html).toContain(">fuerte</strong>");
    expect(html).toContain("<em");
    expect(html).toContain(">suave</em>");
  });

  it("usa el acento del entorno en los enlaces", () => {
    const html = markdownToEmailHtml("[ir](https://capitalacademy.cl)", "#f5a524");
    expect(html).toContain('href="https://capitalacademy.cl"');
    expect(html).toContain("color:#f5a524");
  });

  it("preserva el & de una query string en el href", () => {
    const html = markdownToEmailHtml("[ir](https://x.cl/a?b=1&c=2)", ACCENT);
    expect(html).toContain('href="https://x.cl/a?b=1&amp;c=2"');
  });

  // Seguridad: el cuerpo lo escribe staff, pero una cuenta comprometida no debe
  // poder inyectar HTML ni esquemas ejecutables en un correo con la marca.
  it("escapa HTML inyectado en el cuerpo", () => {
    const html = markdownToEmailHtml("<script>alert(1)</script>", ACCENT);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("no genera enlaces con esquemas peligrosos", () => {
    const js = markdownToEmailHtml("[click](javascript:alert(1))", ACCENT);
    expect(js).not.toContain("<a href");

    const data = markdownToEmailHtml("[click](data:text/html,<b>x</b>)", ACCENT);
    expect(data).not.toContain("<a href");
  });

  it("acepta mailto", () => {
    const html = markdownToEmailHtml("[escríbenos](mailto:academia@capitalacademy.cl)", ACCENT);
    expect(html).toContain('href="mailto:academia@capitalacademy.cl"');
  });

  it("ignora bloques vacíos", () => {
    expect(markdownToEmailHtml("\n\n\n", ACCENT)).toBe("");
  });

  // Regresiones de la revisión del 2026-07-29: el parseo era por BLOQUE y exigía
  // que el bloque entero fuera homogéneo, así que la forma más común de escribir
  // dejaba el "##" y los "-" literales dentro del correo.
  describe("parseo por línea (no por bloque homogéneo)", () => {
    it("renderiza un título pegado al párrafo siguiente", () => {
      const html = markdownToEmailHtml("## Cambios de octubre\nEl calendario se movió.", ACCENT);

      expect(html).toContain("<h2");
      expect(html).toContain("Cambios de octubre");
      expect(html).not.toContain("##");
      expect(html).toContain("<p");
      expect(html).toContain("El calendario se movió.");
    });

    it("renderiza una lista pegada a su línea de introducción", () => {
      const html = markdownToEmailHtml("Esto cambia:\n- uno\n- dos", ACCENT);

      expect(html).toContain("<p");
      expect(html).toContain("Esto cambia:");
      expect(html).toContain("<ul");
      expect(html.match(/<li /g)).toHaveLength(2);
      expect(html).not.toContain("- uno");
    });

    it("cierra la lista cuando vuelve el texto corrido", () => {
      const html = markdownToEmailHtml("- uno\n- dos\nY luego esto.", ACCENT);

      expect(html).toContain("</ul>");
      expect(html.indexOf("</ul>")).toBeLessThan(html.indexOf("Y luego esto."));
    });

    it("separa dos títulos consecutivos", () => {
      const html = markdownToEmailHtml("## Uno\n### Dos", ACCENT);
      expect(html).toContain("<h2");
      expect(html).toContain("<h3");
    });
  });

  it("no convierte en cursiva un asterisco de multiplicación", () => {
    const html = markdownToEmailHtml("2 * 3 = 6 y 4 * 5 = 20", ACCENT);

    expect(html).not.toContain("<em");
    expect(html).toContain("2 * 3 = 6 y 4 * 5 = 20");
  });

  it("sigue aplicando cursiva a una palabra pegada a los asteriscos", () => {
    expect(markdownToEmailHtml("esto es *importante*", ACCENT)).toContain("<em");
  });

  it("no corta la URL de un enlace con paréntesis balanceados", () => {
    const html = markdownToEmailHtml("[ver](https://x.cl/a_(b))", ACCENT);

    expect(html).toContain('href="https://x.cl/a_(b)"');
    expect(html).not.toContain("</a>)");
  });
});

describe("markdownToPlainText", () => {
  it("quita la sintaxis y conserva el texto", () => {
    const text = markdownToPlainText("## Título\n\n**fuerte** y *suave*");
    expect(text).toContain("Título");
    expect(text).toContain("fuerte y suave");
    expect(text).not.toContain("**");
    expect(text).not.toContain("##");
  });

  it("convierte viñetas en • y enlaces en texto (url)", () => {
    const text = markdownToPlainText("- uno\n- dos\n\n[ir](https://x.cl)");
    expect(text).toContain("• uno");
    expect(text).toContain("ir (https://x.cl)");
  });

  it("conserva el separador", () => {
    expect(markdownToPlainText("uno\n\n---\n\ndos")).toContain("---");
  });
});
