/**
 * Subset de Markdown → HTML apto para correo.
 *
 * Por qué no react-markdown (que sí está instalado): ese renderer produce HTML
 * moderno con clases CSS, y los clientes de correo (Outlook, Gmail) descartan
 * hojas de estilo y buena parte de CSS. En correo TODO estilo va inline en cada
 * etiqueta. Este módulo emite exactamente eso, y solo las construcciones que un
 * comunicado necesita — no es un Markdown completo ni pretende serlo.
 *
 * Soporta: `## título`, `### subtítulo`, párrafos, `**negrita**`, `*cursiva*`,
 * `[texto](url)`, listas `- ` y `1. `, y `---` como separador.
 *
 * SEGURIDAD: el cuerpo lo escribe personal admin/ops, pero se escapa igual
 * (defensa en profundidad — una cuenta de staff comprometida no debe poder
 * inyectar HTML arbitrario en un correo con la marca de Capital Academy), y los
 * enlaces se limitan a http/https/mailto para cerrar `javascript:` y `data:`.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Solo esquemas navegables. Cualquier otra cosa se degrada a texto plano. */
function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed;
  return null;
}

// URL de un enlace: admite un nivel de paréntesis balanceados, porque
// `https://x.cl/a_(b)` es una URL legítima y cortarla en el primer ")" produce
// un enlace roto.
const LINK_RE = /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

// Cursiva: el asterisco de apertura NO puede ir seguido de espacio ni el de
// cierre precedido de espacio. Sin esta guarda, "2 * 3 = 6 y 4 * 5 = 20" se
// interpreta como cursiva y se come el texto intermedio.
const ITALIC_RE = /\*(\S|\S[^*]*?\S)\*/g;

/**
 * Formato inline sobre texto YA escapado. El orden importa: primero enlaces
 * (su etiqueta puede contener negrita), luego negrita y por último cursiva —
 * si la cursiva corriera antes, se comería un asterisco de `**`.
 */
function inline(escaped: string, accent: string): string {
  return escaped
    .replace(LINK_RE, (whole, label: string, rawUrl: string) => {
      // El texto llega escapado, así que `&amp;` en una query string debe
      // volver a `&` antes de validar el esquema y re-escaparse en el href.
      const url = safeUrl(rawUrl.replace(/&amp;/g, "&"));
      if (!url) return whole;
      return `<a href="${escapeHtml(url)}" target="_blank" style="color:${accent};text-decoration:underline;">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:700;color:#14163a;">$1</strong>')
    .replace(ITALIC_RE, '<em style="font-style:italic;">$1</em>');
}

const P_STYLE = "margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#3a3d5c;";
const LI_STYLE = "margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#3a3d5c;";

/** Divide en bloques separados por una o más líneas en blanco. */
function toBlocks(markdown: string): string[] {
  return markdown
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
}

/**
 * Un tramo homogéneo de líneas contiguas. El parseo es POR LÍNEA y no por
 * bloque: la gente escribe "## Título" pegado al párrafo siguiente, y una lista
 * justo debajo de su línea de introducción. Exigir que el bloque entero fuera
 * de un solo tipo hacía que en esos casos —los más comunes— el "##" y los "-"
 * salieran literales en el correo.
 */
type Run =
  | { kind: "hr" }
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "p"; lines: string[] };

function segmentLines(lines: string[]): Run[] {
  const runs: Run[] = [];
  const last = () => runs[runs.length - 1];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (/^---+$/.test(line)) {
      runs.push({ kind: "hr" });
      continue;
    }
    if (line.startsWith("### ")) {
      runs.push({ kind: "heading", level: 3, text: line.slice(4) });
      continue;
    }
    if (line.startsWith("## ")) {
      runs.push({ kind: "heading", level: 2, text: line.slice(3) });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      const tail = last();
      if (tail?.kind === "ul") tail.items.push(bullet[1]);
      else runs.push({ kind: "ul", items: [bullet[1]] });
      continue;
    }

    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    if (ordered) {
      const tail = last();
      if (tail?.kind === "ol") tail.items.push(ordered[1]);
      else runs.push({ kind: "ol", items: [ordered[1]] });
      continue;
    }

    const tail = last();
    if (tail?.kind === "p") tail.lines.push(line);
    else runs.push({ kind: "p", lines: [line] });
  }

  return runs;
}

function renderRun(run: Run, accent: string): string {
  switch (run.kind) {
    case "hr":
      return '<hr style="border:0;border-top:1px solid #ededf0;margin:24px 0;" />';
    case "heading": {
      const text = inline(escapeHtml(run.text), accent);
      return run.level === 2
        ? `<h2 style="margin:24px 0 12px 0;font-size:19px;line-height:1.3;color:#14163a;font-weight:800;">${text}</h2>`
        : `<h3 style="margin:20px 0 10px 0;font-size:16px;line-height:1.35;color:#14163a;font-weight:700;">${text}</h3>`;
    }
    case "ul":
    case "ol": {
      const items = run.items
        .map((item) => `<li style="${LI_STYLE}">${inline(escapeHtml(item), accent)}</li>`)
        .join("");
      const tag = run.kind;
      return `<${tag} style="margin:0 0 14px 0;padding-left:22px;">${items}</${tag}>`;
    }
    case "p": {
      // Los saltos de línea sueltos dentro del párrafo se respetan como <br />.
      const body = run.lines.map((l) => inline(escapeHtml(l), accent)).join("<br />");
      return `<p style="${P_STYLE}">${body}</p>`;
    }
  }
}

/** Cuerpo del correo en HTML con estilos inline. */
export function markdownToEmailHtml(markdown: string, accent: string): string {
  return toBlocks(markdown)
    .flatMap((block) => segmentLines(block.split("\n")))
    .map((run) => renderRun(run, accent))
    .join("\n");
}

/**
 * Versión texto plano del mismo cuerpo. No es opcional: un correo sin `text`
 * puntúa peor en los filtros de spam y es lo único que ven los lectores de
 * pantalla en modo texto.
 */
export function markdownToPlainText(markdown: string): string {
  return toBlocks(markdown)
    .map((block) => {
      if (/^---+$/.test(block)) return "---";
      return block
        .split("\n")
        .map((line) =>
          line
            .trim()
            .replace(/^###\s+/, "")
            .replace(/^##\s+/, "")
            .replace(/^[-*]\s+/, "• ")
            .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/\*([^*]+)\*/g, "$1"),
        )
        .join("\n");
    })
    .join("\n\n");
}
