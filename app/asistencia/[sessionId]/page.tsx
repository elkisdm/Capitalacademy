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

  /*
    Sin matrícula activa NO se muestra la tarjeta (evita filtrar la metadata de
    una sesión ajena), pero tampoco un 404 pelado: el caso frecuente es que la
    persona quedó con la sesión de otra cuenta abierta en el teléfono, y un
    "no se puede acceder" no le dice que el problema es con qué correo entró.
  */
  if (!enrollment) {
    return (
      <div
        className="grid min-h-dvh place-items-center px-4 py-10"
        style={{ background: "var(--color-ca-bg)" }}
      >
        <article className="ca-card w-full max-w-[440px] overflow-hidden p-6 text-center">
          <h1 className="text-[18px] font-black tracking-tight text-ca-ink">
            Esta clase no corresponde a tu cuenta
          </h1>
          <p className="mt-3 text-[13px] font-semibold text-ca-ink-soft">
            Estás usando <strong className="text-ca-ink">{user.email}</strong>, y esa
            cuenta no tiene una matrícula activa en el programa de esta clase.
          </p>
          <p className="mt-3 text-[13px] text-ca-ink-soft">
            Si tienes otro correo inscrito, cierra sesión y vuelve a abrir este
            enlace con esa cuenta. Si crees que es un error, avisa al equipo.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <form action="/api/auth/signout" method="post">
              <input type="hidden" name="next" value={`/asistencia/${sessionId}`} />
              <button
                type="submit"
                className="w-full rounded-xl px-4 py-3 text-[13px] font-bold text-white"
                style={{ background: "var(--color-ca-violet)" }}
              >
                Cerrar sesión y entrar con otra cuenta
              </button>
            </form>
            <a
              href="/classroom"
              className="text-[13px] font-semibold text-ca-ink-soft transition-colors hover:text-ca-violet"
            >
              Ir a mi classroom
            </a>
          </div>
        </article>
      </div>
    );
  }

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
