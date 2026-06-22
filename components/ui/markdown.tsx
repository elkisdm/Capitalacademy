import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

// Esquema de sanitización: parte del default seguro y permite imágenes (con
// src/alt) y los atributos básicos que GFM necesita. NO se permite HTML crudo
// peligroso (script, iframe, on*). Las imágenes inline viven en el bucket
// público `lesson-content`.
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img ?? []), "src", "alt", "title"],
    a: [...(defaultSchema.attributes?.a ?? []), "href", "title", "target", "rel"],
  },
};

/**
 * Renderiza Markdown sanitizado dentro de un contenedor `.ca-prose`
 * (estilos tipográficos en globals.css). Soporta GFM (tablas, listas de
 * tareas, etc.) e imágenes intercaladas.
 */
export function Markdown({ content, className = "" }: { content: string; className?: string }) {
  return (
    <div className={`ca-prose ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          a: ({ href, children, ...props }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
