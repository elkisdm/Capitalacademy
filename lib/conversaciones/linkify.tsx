import type { ReactNode } from "react";

// Detecta URLs http(s). El grupo de captura hace que `String.prototype.split`
// conserve las URLs en el arreglo resultante (índices impares = URLs).
const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

// Puntuación de cierre que suele quedar pegada a una URL al final de una frase
// ("visita https://x.com.") y NO forma parte del enlace.
const TRAILING_PUNCT = /[.,;:!?)\]}]+$/;

/**
 * Convierte URLs http(s) dentro de texto PLANO en enlaces clicables sin
 * ejecutar HTML del usuario: devuelve un arreglo de strings y elementos <a>.
 * NO parsea markdown. Los saltos de línea se preservan con `whitespace-pre-wrap`
 * en el contenedor que renderiza el resultado.
 */
export function linkify(text: string): ReactNode {
  const parts = text.split(URL_REGEX);

  return parts.map((part, i) => {
    // Solo los índices impares (grupos capturados) son URLs.
    if (i % 2 === 0) return part;

    const trailingMatch = part.match(TRAILING_PUNCT);
    const trailing = trailingMatch ? trailingMatch[0] : "";
    const url = trailing ? part.slice(0, part.length - trailing.length) : part;

    return (
      <span key={i}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ca-violet underline break-words"
        >
          {url}
        </a>
        {trailing}
      </span>
    );
  });
}
