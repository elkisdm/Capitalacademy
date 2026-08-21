"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Revela su contenido al entrar al viewport (fade + subida suave, clases
 * `ca-reveal` / `is-visible` de globals.css). El estado inicial oculto se
 * aplica RECIÉN al montar en el cliente: sin JavaScript (o si el observer
 * no corre) el contenido queda visible, que es el fallback correcto para
 * una landing pública.
 */
export function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<"inicial" | "oculto" | "visible">("inicial");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // Si ya está en pantalla al montar (hero, primer pliegue), no se oculta
    // nada: ocultarlo provocaría un parpadeo sobre contenido ya pintado.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) return;
    setEstado("oculto");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setEstado("visible");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${className ?? ""} ${estado === "inicial" ? "" : "ca-reveal"} ${
        estado === "visible" ? "is-visible" : ""
      }`}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
