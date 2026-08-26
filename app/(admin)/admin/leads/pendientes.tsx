"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
// Ver la nota en lead-seguimiento.tsx: el toast de `ui/` exige un provider que
// la aplicación nunca monta y lanza al renderizar.
import { useToast } from "@/components/admin/toast";
import { formatLeadDate } from "@/lib/admin/leads-format";
import { tareasPorAvisar } from "@/lib/admin/leads-pipeline";
import type { LeadTaskRow } from "@/lib/admin/leads-queries";

type TareaConLead = LeadTaskRow & { lead_name: string };

/**
 * Lo que está atrasado o vence hoy, arriba de todo al abrir el panel.
 *
 * Es el reemplazo directo de la lista en papel: la pregunta "¿a quién tengo que
 * llamar hoy?" se responde sin buscar lead por lead. Cruza tareas de leads
 * distintos, por eso vive en la página y no dentro del detalle.
 *
 * Si no hay nada pendiente no renderiza nada: una franja vacía diciendo "todo
 * al día" ocuparía el lugar que necesitan los leads.
 */
export function Pendientes({
  tasks,
  onIrAlLead,
}: {
  tasks: TareaConLead[];
  onIrAlLead: (leadId: string) => void;
}) {
  const router = useRouter();
  const { toast, ToastContainer } = useToast();
  const [cerrando, setCerrando] = useState<string | null>(null);

  const porAvisar = tareasPorAvisar(tasks);
  if (porAvisar.length === 0) return null;

  const vencidas = porAvisar.filter((t) => t.urgency === "vencida").length;

  async function completar(taskId: string) {
    if (cerrando) return;
    setCerrando(taskId);
    try {
      const res = await fetch(`/api/admin/leads/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: true }),
      });
      if (!res.ok) {
        toast("No se pudo cerrar la tarea", "error");
        return;
      }
      toast("Tarea lista", "success");
      router.refresh();
    } finally {
      setCerrando(null);
    }
  }

  return (
    <section
      aria-label="Tareas pendientes"
      className="mb-6 rounded-2xl border border-ca-ink/[0.10] bg-ca-bg-soft p-4"
    >
      <ToastContainer />

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Para hoy
        </h2>
        {vencidas > 0 && (
          <Badge tone="destructive" size="sm">
            {vencidas} {vencidas === 1 ? "atrasada" : "atrasadas"}
          </Badge>
        )}
      </div>

      <ul className="flex flex-col gap-1.5">
        {porAvisar.map((task) => (
          <li
            key={task.id}
            className="flex items-center gap-2.5 rounded-xl border border-ca-ink/[0.08] bg-ca-surface p-3"
          >
            <input
              type="checkbox"
              checked={false}
              disabled={cerrando !== null}
              onChange={() => completar(task.id)}
              aria-label={`Marcar "${task.title}" como hecha`}
              className="h-4 w-4 shrink-0 accent-ca-lime-deep"
            />
            <button
              type="button"
              onClick={() => onIrAlLead(task.lead_id)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block break-words text-[13px] font-bold text-ca-ink">
                {task.title}
              </span>
              <span className="mt-0.5 block text-[11px] text-ca-ink-soft">
                {task.lead_name} · {formatLeadDate(task.due_at)}
              </span>
            </button>
            {task.urgency === "vencida" && (
              <Badge tone="destructive" size="sm" className="shrink-0">
                Vencida
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
