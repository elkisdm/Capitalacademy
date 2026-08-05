"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useFocusTrap } from "@/lib/utils/use-focus-trap";
import {
  STUDENT_TOUR_STEPS,
  resolveTourSteps,
  stepCounterLabel,
  clampStepIndex,
} from "@/lib/tour/steps";
import {
  computeCardPosition,
  computeSpotlight,
  isRectVisible,
} from "@/lib/tour/position";
import type { Placement, Rect, TourOutcome, TourStart, TourStep } from "@/lib/tour/types";

/**
 * Tour guiado del alumno (ADR-0030). Componente propio: `createPortal` +
 * `useFocusTrap`, la misma línea que `components/ui/dialog.tsx`. No hay
 * librería de tour en el repo y no se agregó ninguna.
 *
 * Toda la lógica que se puede testear vive en `lib/tour/` (el guion y la
 * geometría). Acá queda solo lo que necesita DOM: medir, hacer scroll y
 * manejar el foco.
 */

/**
 * Guarda de sesión. NO reemplaza al flag de `profiles`, que es la fuente de
 * verdad y lo que sincroniza entre dispositivos. Cubre una ventana chica: al
 * volver al dashboard por navegación del router, Next puede servir el payload
 * RSC cacheado —con `start: "auto"` todavía— y el tour se reabriría. Se lee
 * después del montaje, nunca durante el render, para no romper la hidratación.
 */
const SESSION_KEY = "ca-tour-visto";

/** Medidas de respaldo mientras la tarjeta todavía no se midió. */
const FALLBACK_CARD = { width: 340, height: 210 };

type Geometry = {
  spotlight: Rect | null;
  card: { top: number; left: number; placement: Placement };
};

function findTarget(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
}

function measureTarget(target: string): Rect | null {
  const el = findTarget(target);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const rect: Rect = { top: r.top, left: r.left, width: r.width, height: r.height };
  return isRectVisible(rect) ? rect : null;
}

export function GuidedTour({ start }: { start: TourStart }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [geometry, setGeometry] = useState<Geometry | null>(null);

  const cardRef = useFocusTrap(open);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const step: TourStep | undefined = steps[index];
  const isLast = index === steps.length - 1;

  /* ---------------------------------------------------------------- */
  /*  Apertura                                                         */
  /* ---------------------------------------------------------------- */

  const openTour = useCallback(() => {
    // El guion se resuelve UNA vez, al abrir, contra el DOM real. Si después
    // cambia el viewport solo se vuelve a medir la posición del paso actual: no
    // se recalcula la lista, para que el alumno no vea saltar el contador de
    // pasos a mitad del recorrido.
    const visible = resolveTourSteps(STUDENT_TOUR_STEPS, (t) => measureTarget(t) !== null);
    if (visible.length === 0) return;
    setSteps(visible);
    setIndex(0);
    setGeometry(null);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (start === "off") return;
    // `forced` es un re-lanzamiento explícito desde el Centro de ayuda: ignora
    // la guarda de sesión a propósito.
    if (start === "auto" && sessionStorage.getItem(SESSION_KEY) === "1") return;
    // El guion se resuelve leyendo el DOM, así que esto solo puede pasar
    // después del montaje.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    openTour();
  }, [start, openTour]);

  /* ---------------------------------------------------------------- */
  /*  Cierre                                                           */
  /* ---------------------------------------------------------------- */

  const close = useCallback(
    (outcome: TourOutcome) => {
      setOpen(false);
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // Modo privado de Safari puede tirar acá. El flag de `profiles` es la
        // fuente de verdad; perder la guarda de sesión no rompe nada.
      }

      // Saca `?tour=1` de la URL para que un recargar no repita el tour, sin
      // tocar el resto de los parámetros.
      const url = new URL(window.location.href);
      if (url.searchParams.has("tour")) {
        url.searchParams.delete("tour");
        router.replace(`${url.pathname}${url.search}`, { scroll: false });
      }

      void fetch("/api/classroom/tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      }).catch(() => {
        // Si falla, el tour se vuelve a ofrecer en la próxima sesión. Preferimos
        // eso a bloquear el cierre: el alumno ya dijo que quiere salir.
      });
    },
    [router],
  );

  /* ---------------------------------------------------------------- */
  /*  Navegación                                                       */
  /* ---------------------------------------------------------------- */

  const goTo = useCallback(
    (next: number) => setIndex((i) => (steps.length ? clampStepIndex(next, steps.length) : i)),
    [steps.length],
  );

  const next = useCallback(() => {
    if (index >= steps.length - 1) {
      close("completed");
      return;
    }
    goTo(index + 1);
  }, [index, steps.length, close, goTo]);

  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  /* ---------------------------------------------------------------- */
  /*  Medición                                                         */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!open || !step) return;

    const el = step.target ? findTarget(step.target) : null;
    // Scroll instantáneo, no suave: con `smooth` habría que adivinar cuándo
    // terminó para medir, y el recuadro de foco quedaría corrido mientras tanto.
    if (el) el.scrollIntoView({ block: "center", inline: "nearest" });

    const update = () => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const rect = step.target ? measureTarget(step.target) : null;
      const cardEl = cardRef.current;
      const card = cardEl
        ? { width: cardEl.offsetWidth, height: cardEl.offsetHeight }
        : FALLBACK_CARD;

      setGeometry({
        spotlight: rect ? computeSpotlight(rect, viewport) : null,
        card: computeCardPosition(rect, card, viewport, { prefer: step.prefer }),
      });
    };

    // En el frame siguiente la tarjeta ya está pintada con el contenido de este
    // paso, así que `offsetHeight` es el alto real y no el del paso anterior.
    const raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    // `true` (captura) para enterarse también del scroll de contenedores
    // internos, no solo del de la ventana.
    window.addEventListener("scroll", update, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, step, cardRef]);

  /* ---------------------------------------------------------------- */
  /*  Foco inicial                                                     */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!open) return;
    // `useFocusTrap` enfoca el PRIMER elemento enfocable, que acá es la X de
    // cerrar: quien navegue por teclado apretaría Enter y saldría del tour sin
    // querer. El foco correcto es la acción primaria. El Tab sigue circulando
    // dentro de la tarjeta, que es lo que aporta el hook.
    const raf = requestAnimationFrame(() => nextButtonRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  /* ---------------------------------------------------------------- */
  /*  Teclado                                                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close("skipped");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close, next, prev]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  if (!open || !step) return null;

  return createPortal(
    <div className="fixed inset-0 z-[95]">
      {/* Bloquea la interacción con el fondo: sin esto se puede navegar por
          debajo del tour y el foco queda huérfano. */}
      <div className="absolute inset-0" aria-hidden="true" />

      {/* Capa oscura. Con elemento destacado es un recuadro cuyo `box-shadow`
          tapa todo lo demás; sin elemento, una capa plana. */}
      {geometry?.spotlight ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-2xl ring-2 ring-ca-lime/70 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            top: geometry.spotlight.top,
            left: geometry.spotlight.left,
            width: geometry.spotlight.width,
            height: geometry.spotlight.height,
            boxShadow: "0 0 0 9999px rgba(15, 19, 64, 0.6)",
          }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-ca-ink/60" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="ca-card ca-scale-in absolute w-[min(340px,calc(100vw-24px))] p-5 shadow-2xl transition-[top,left] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          top: geometry?.card.top ?? 0,
          left: geometry?.card.left ?? 0,
          // Hasta la primera medición la posición todavía no es la buena: se
          // mantiene invisible para no mostrar un salto.
          opacity: geometry ? 1 : 0,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
            {stepCounterLabel(index, steps.length)}
          </span>
          <button
            type="button"
            onClick={() => close("skipped")}
            aria-label="Cerrar el recorrido"
            className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ca-ink-soft transition-colors hover:bg-ca-bg-soft hover:text-ca-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* La tarjeta no se desmonta entre pasos (para no perder el foco), así
            que el cambio de contenido hay que anunciarlo. */}
        <div aria-live="polite">
          <h2
            id={titleId}
            className="mt-2 text-[17px] font-black leading-snug tracking-tight text-ca-ink"
          >
            {step.title}
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ca-ink-soft">
            {step.body}
          </p>
        </div>

        {step.link && (
          <Link
            href={step.link.href}
            prefetch={false}
            onClick={() => close("completed")}
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-ca-violet hover:underline"
          >
            {step.link.label}
            <svg
              width={12}
              height={12}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => close("skipped")}
            className="rounded-xl px-2 py-1.5 text-[12px] font-bold text-ca-ink-soft transition-colors hover:bg-ca-bg-soft hover:text-ca-ink"
          >
            Saltar
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={prev}
                className="rounded-xl px-3 py-2 text-[12px] font-bold text-ca-ink transition-colors hover:bg-ca-bg-soft"
              >
                Atrás
              </button>
            )}
            <button
              ref={nextButtonRef}
              type="button"
              onClick={next}
              className="ca-btn-lime ca-btn-interactive px-4 py-2 text-[12px] font-bold uppercase tracking-[0.08em]"
            >
              {isLast ? "Entendido" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
