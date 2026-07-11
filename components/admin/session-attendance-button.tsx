"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CheckCircleIcon } from "@/components/admin/icons";
import { SessionAttendancePanel } from "@/components/admin/session-attendance-panel";

/**
 * Botón + modal con el roster de asistencia de una sesión. Replica el patrón
 * de SessionQrButton (Dialog on-demand: el panel solo se monta -y hace fetch-
 * cuando el modal está abierto).
 */
export function SessionAttendanceButton({
  sessionId,
  sessionTitle,
  emphasized = false,
}: {
  sessionId: string;
  sessionTitle: string;
  emphasized?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={emphasized ? "lime" : "outline"}
        onClick={() => setOpen(true)}
        aria-label="Asistencia de la clase"
        className={`!h-auto gap-1.5 rounded-xl px-3 py-2 text-[12px] ${
          emphasized ? "" : "hover:border-ca-violet hover:text-ca-violet"
        }`}
      >
        <CheckCircleIcon size={15} />
        Asistencia
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby="session-att-title"
        className="w-full max-w-[520px] overflow-hidden p-0"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-ca-ink-soft">
              ASISTENCIA
            </div>
            <h3
              id="session-att-title"
              className="mt-0.5 truncate text-[15px] font-extrabold text-ca-ink"
            >
              {sessionTitle}
            </h3>
          </div>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            aria-label="Cerrar"
            className="!h-auto !w-auto shrink-0 rounded-lg px-2 py-1 text-[18px] leading-none text-ca-ink-soft hover:!bg-transparent hover:text-ca-ink"
          >
            ×
          </Button>
        </div>
        <div className="px-5 pb-5">
          <SessionAttendancePanel sessionId={sessionId} embedded />
        </div>
      </Dialog>
    </>
  );
}
