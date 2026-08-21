"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Foto = { src: string; alt: string };

/**
 * Rotador de fotos con fundido cruzado para los bloques de imagen de la
 * landing. Ocupa el contenedor posicionado del padre (todas las fotos van
 * `fill`), igual que el `<Image fill>` al que reemplaza.
 *
 * Decisiones:
 * - Solo la PRIMERA foto respeta `priority`: es la que pinta el LCP; las
 *   demás cargan `loading="lazy"` y el navegador las trae antes de que les
 *   toque entrar (el intervalo es de segundos, no de milisegundos).
 * - El intervalo se detiene con la pestaña oculta (`document.hidden`) para
 *   no rotar a nadie que no está mirando.
 * - `prefers-reduced-motion` no necesita manejo propio: el kill-switch
 *   global de `globals.css` ya vuelve instantánea la transición de opacidad,
 *   y un cambio de foto cada varios segundos no es "motion" problemático.
 */
export function RotadorFotos({
  fotos,
  sizes,
  className,
  priority = false,
  intervaloMs = 6000,
}: {
  fotos: Foto[];
  sizes: string;
  /** Clases del object-fit/position, aplicadas a cada foto. */
  className?: string;
  priority?: boolean;
  intervaloMs?: number;
}) {
  const [activa, setActiva] = useState(0);
  const total = fotos.length;
  const totalRef = useRef(total);
  totalRef.current = total;

  useEffect(() => {
    if (totalRef.current < 2) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      setActiva((i) => (i + 1) % totalRef.current);
    }, intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);

  return (
    <>
      {fotos.map((f, i) => (
        <Image
          key={f.src}
          src={f.src}
          alt={i === activa ? f.alt : ""}
          fill
          sizes={sizes}
          priority={priority && i === 0}
          className={`${className ?? ""} transition-opacity duration-1000 ease-linear ${
            i === activa ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
    </>
  );
}
