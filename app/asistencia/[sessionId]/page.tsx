import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuthUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandByProgramId, loginPath } from "@/lib/programs/registry";
import { getWindowState } from "@/lib/asistencia/window";
import { CheckinClient } from "./checkin-client";

export const metadata: Metadata = {
  title: "Registro de asistencia | Capital Academy",
};

export default async function AsistenciaPage(props: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await props.params;
  const admin = createAdminClient();

  // Resolver la sesión (+ cohorte + programa) con service_role: la necesitamos
  // para brandear el login del invitado y para renderizar la tarjeta.
  const { data: session } = await admin
    .from("class_sessions")
    .select("id, title, starts_at, ends_at, cohort_id, cohorts(id, name, program_id)")
    .eq("id", sessionId)
    .single();

  if (!session) notFound();

  const {
    data: { user },
  } = await getAuthUser();

  if (!user) {
    const programId =
      (session.cohorts as { program_id: string | null } | null)?.program_id ?? null;
    const brand = getBrandByProgramId(programId);
    redirect(`${loginPath(brand)}?next=/asistencia/${sessionId}`);
  }

  // Gate de matrícula: solo un alumno con matrícula ACTIVA en la cohorte de la
  // sesión puede ver la tarjeta (título + cohorte). Sin esto, cualquier usuario
  // logueado de otro programa podría leer la metadata de una sesión ajena. El
  // check-in en sí ya lo valida; aquí evitamos también la fuga de lectura.
  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id")
    .eq("student_id", user.id)
    .eq("cohort_id", session.cohort_id)
    .eq("status", "active")
    .maybeSingle();

  if (!enrollment) notFound();

  // ¿Ya registró asistencia? (para mostrar el estado inicial "ya registrada")
  const { data: existing } = await admin
    .from("session_attendance")
    .select("id")
    .eq("session_id", sessionId)
    .eq("student_id", user.id)
    .maybeSingle();

  const cohortName = (session.cohorts as { name: string } | null)?.name ?? null;
  const windowState = getWindowState({ starts_at: session.starts_at, ends_at: session.ends_at });

  return (
    <CheckinClient
      sessionId={session.id}
      title={session.title ?? "Clase en vivo"}
      startsAt={session.starts_at}
      cohortName={cohortName}
      alreadyRegistered={Boolean(existing)}
      windowState={windowState}
    />
  );
}
