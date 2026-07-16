"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EvaluationPanel } from "@/components/admin/quiz/evaluation-panel";
import type { Evaluation } from "@/components/admin/quiz/types";

export function EvaluationDetailClient({ evaluation }: { evaluation: Evaluation }) {
  const [ev, setEv] = useState<Evaluation>(evaluation);
  const router = useRouter();

  return (
    <EvaluationPanel evaluation={ev} onEvaluationChange={setEv} onDeleted={() => router.push("/admin/evaluaciones")} />
  );
}
