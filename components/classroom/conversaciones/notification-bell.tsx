"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ── Time helper (copiado de thread-list.tsx) ───────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "hace un momento";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} ${days === 1 ? "día" : "días"}`;

  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} ${months === 1 ? "mes" : "meses"}`;

  const years = Math.floor(months / 12);
  return `hace ${years} ${years === 1 ? "año" : "años"}`;
}

type Notification = {
  id: string;
  type: string;
  actorName: string;
  threadId: string | null;
  threadTitle: string | null;
  read: boolean;
  createdAt: string;
};

const ENDPOINT = "/api/classroom/conversaciones/notifications";

export function NotificationBell({
  viewerId,
  cohortSlug,
}: {
  viewerId: string;
  cohortSlug: string;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
      const res = await fetch(ENDPOINT);
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: Notification[];
        unread: number;
      };
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
          // El payload crudo no trae el nombre del actor: re-fetch.
          void refetch();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [viewerId, refetch]);

  const markAllRead = useCallback(async () => {
    setUnread(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      // Silencioso.
    }
  }, []);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      // Al abrir, marca todas como leídas.
      if (next && unread > 0) void markAllRead();
      return next;
    });
  }, [unread, markAllRead]);

  // Cerrar con Escape o click fuera.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Notificaciones"
        aria-expanded={open}
        className="relative inline-grid h-10 w-10 place-items-center rounded-full text-ca-ink-soft transition-colors hover:bg-ca-bg-soft hover:text-ca-ink"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-grid min-w-[18px] place-items-center rounded-full bg-ca-violet px-1 py-0.5 text-[10px] font-bold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="ca-card absolute right-0 z-20 mt-2 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden p-0 shadow-xl">
          <div className="flex items-center justify-between border-b border-ca-ink/[0.08] px-4 py-3">
            <p className="text-[13px] font-bold text-ca-ink">Notificaciones</p>
            {notifications.some((n) => !n.read) && (
              <button
                type="button"
                onClick={markAllRead}
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
                        <span className="font-bold">{n.actorName}</span>{" "}
                        {n.type === "mention" ? (
                          <>
                            te mencionó en{" "}
                            <span className="font-semibold">
                              &ldquo;{n.threadTitle ?? "una conversación"}&rdquo;
                            </span>
                          </>
                        ) : (
                          <>
                            respondió tu conversación{" "}
                            <span className="font-semibold">
                              &ldquo;{n.threadTitle ?? "una conversación"}&rdquo;
                            </span>
                          </>
                        )}
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
                      {n.threadId ? (
                        <Link
                          href={`/classroom/${cohortSlug}/conversaciones/${n.threadId}`}
                          onClick={() => setOpen(false)}
                          className={base}
                        >
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
      )}
    </div>
  );
}
