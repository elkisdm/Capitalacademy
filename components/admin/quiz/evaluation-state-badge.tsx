import { Badge } from "@/components/ui/badge";
import { getEvaluationState, type EvaluationState, type EvaluationWindow } from "@/lib/classroom/evaluation-window";

/**
 * Badge de estado de una evaluación (draft/scheduled/open/closed — ventana de
 * programación 0070). Único uso compartido autorizado: el panel de gestión
 * (evaluation-panel.tsx) y el listado de la pestaña central (evaluaciones-tab.tsx).
 */
const STATE_LABEL: Record<EvaluationState, string> = {
  draft: "Borrador",
  scheduled: "Programada",
  open: "Activa",
  closed: "Cerrada",
};

const STATE_TONE: Record<EvaluationState, "neutral" | "amber" | "lime"> = {
  draft: "neutral",
  scheduled: "amber",
  open: "lime",
  closed: "neutral",
};

export function EvaluationStateBadge({
  evaluation,
  size,
}: {
  evaluation: EvaluationWindow;
  size?: "sm" | "md";
}) {
  const state = getEvaluationState(evaluation);
  return (
    <Badge tone={STATE_TONE[state]} size={size}>
      {STATE_LABEL[state]}
    </Badge>
  );
}
