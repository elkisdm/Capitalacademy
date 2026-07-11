"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/utils/time-ago";

type Notification = {
  id: string;
  type: string;
  actorName: string;
  title: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
};

const ENDPOINT = "/api/classroom/conversaciones/notifications";

// La campana se monta dos veces a la vez (sidebar desktop + header móvil),
// y ambas disparan un fetch inicial casi simultáneo. Esta promesa in-flight
// a nivel de módulo (compartida entre instancias) colapsa esos dos fetches
// en uno solo dentro de una ventana corta. No afecta al canal realtime, que
// sigue siendo por instancia.
let inflight: Promise<{ notifications: Notification[]; unread: number }> | null = null;
let inflightAt = 0;

function fetchNotifications() {
  const now = Date.now();
  if (inflight && now - inflightAt < 1500) return inflight;
  inflightAt = now;
  inflight = fetch(ENDPOINT)
    .then((res) => {
      if (!res.ok) return Promise.reject(new Error("fetch failed"));
      return res.json() as Promise<{ notifications: Notification[]; unread: number }>;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

// Ancho del panel y margen mínimo respecto al borde del viewport, usados
// para calcular su posición `fixed` (ver comentario en `updatePosition`).
const PANEL_WIDTH = 360;
const VIEWPORT_MARGIN = 16;

/** Copy por tipo de notificación (foro y lección, T14/T16). `title` ya viene
 *  resuelto server-side (título del hilo o de la lección). */
function notificationCopy(n: Notification): ReactNode {
  const titleNode = (
    <span className="font-semibold">&ldquo;{n.title ?? "una conversación"}&rdquo;</span>
  );
  switch (n.type) {
    case "mention":
      return <>te mencionó en {titleNode}</>;
    case "lesson_reply":
      return <>respondió tu comentario en la lección {titleNode}</>;
    case "lesson_comment_new":
      return <>comentó en tu lección {titleNode}</>;
    case "reply":
    default:
      return <>respondió tu conversación {titleNode}</>;
  }
}

export function NotificationBell({ viewerId }: { viewerId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Nombre de canal ÚNICO por instancia montada. La campana se renderiza en
  // más de un lugar a la vez (sidebar desktop + header móvil, ambos montados
  // aunque uno esté oculto por CSS); si compartieran nombre de canal, el segundo
  // `.on()` correría sobre un canal ya suscrito y lanzaría "cannot add
  // postgres_changes callbacks after subscribe()", crasheando la página.
  const instanceIdRef = useRef<string | null>(null);
  if (instanceIdRef.current === null) {
    instanceIdRef.current = Math.random().toString(36).slice(2);
  }

  const refetch = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setNotifications(data.notifications);
      setUnread(data.unread);
    } catch {
      // Silencioso: la campana no debe romper la página.
    }
  }, []);

  // Fetch inicial.
  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Realtime: INSERT en conversation_notifications para este viewer.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`conversation-notifications-${viewerId}-${instanceIdRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_notifications",
          filter: `user_id=eq.${viewerId}`,
        },
        () => {
          // El payload crudo no trae el nombre del actor ni el título: re-fetch.
          void refetch();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [viewerId, refetch]);

  // Marca leídas SOLO las notificaciones visibles en el panel (no "todas" a
  // ciegas): usa {ids} contra el POST generalizado (T14/T16).
  const markVisibleRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setUnread(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unreadIds }),
      });
    } catch {
      // Silencioso.
    }
  }, [notifications]);

  // La campana puede vivir dentro del sidebar angosto (256px) o del header
  // móvil: anclar el panel con `absolute right-0` lo desborda por la
  // izquierda cuando el contenedor es más angosto que el panel. En su lugar
  // se posiciona `fixed` a partir del rect real del botón, alineado a su
  // borde derecho y clampeado dentro del viewport.
  const updatePosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const maxLeft = Math.max(window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN, VIEWPORT_MARGIN);
    const left = Math.min(Math.max(rect.right - PANEL_WIDTH, VIEWPORT_MARGIN), maxLeft);
    setPanelPos({ top: rect.bottom + 8, left });
  }, []);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        updatePosition();
        // Al abrir, marca como leídas las visibles en el panel.
        if (unread > 0) void markVisibleRead();
      }
      return next;
    });
  }, [unread, markVisibleRead, updatePosition]);

  // Cerrar con Escape o click fuera; recalcular posición en scroll/resize.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onReflow() {
      updatePosition();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, updatePosition]);

  const panel = open && panelPos && (
    <div
      ref={panelRef}
      className="ca-card fixed z-50 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden p-0 shadow-xl"
      style={{ top: panelPos.top, left: panelPos.left }}
    >
      <div className="flex items-center justify-between border-b border-ca-ink/[0.08] px-4 py-3">
        <p className="text-[13px] font-bold text-ca-ink">Notificaciones</p>
        {notifications.some((n) => !n.read) && (
          <button
            type="button"
            onClick={markVisibleRead}
            className="text-[11px] font-semibold text-ca-violet transition-colors hover:underline"
          >
            Marcar todas como leídas
          </button>
        )}
      </div>

      <div className="max-h-[380px] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-ca-ink-soft">
                No tienes notificaciones todavía.
              </p>
            ) : (
              <ul>
                {notifications.map((n) => {
                  const content = (
                    <>
                      <p className="text-[13px] leading-snug text-ca-ink">
                        <span className="font-bold">{n.actorName}</span> {notificationCopy(n)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ca-ink-soft">
                        {timeAgo(n.createdAt)}
                      </p>
                    </>
                  );

                  const base = `block px-4 py-3 transition-colors hover:bg-ca-bg-soft ${
                    n.read ? "" : "bg-ca-violet/[0.05]"
                  }`;

                  return (
                    <li
                      key={n.id}
                      className="border-b border-ca-ink/[0.06] last:border-b-0"
                    >
                      {n.href ? (
                        <Link href={n.href} onClick={() => setOpen(false)} className={base}>
                          {content}
                        </Link>
                      ) : (
                        <div className={base}>{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        aria-label="Notificaciones"
        aria-expanded={open}
        className="relative inline-grid h-11 w-11 place-items-center rounded-full text-ca-ink-soft transition-colors hover:bg-ca-bg-soft hover:text-ca-ink md:h-10 md:w-10"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-grid min-w-[18px] place-items-center rounded-full bg-ca-violet px-1 py-0.5 text-[10px] font-bold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {mounted && panel && createPortal(panel, document.body)}
    </div>
  );
}
