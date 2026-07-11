import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser, getViewerProfile } from "@/lib/supabase/auth";
import {
  getCohortSlugById,
  getActiveEnrollmentsForUser,
} from "@/lib/classroom/queries";
import { getBrandByProgramId } from "@/lib/programs/registry";
import { getActiveEnv, getViewMode } from "@/lib/admin/active-env";
import { getActiveEnvCohortSlug } from "@/lib/classroom/staff-preview";

export default async function ClassroomIndexPage() {
  const {
    data: { user },
  } = await getAuthUser();

  if (!user) redirect("/login");

  // Staff en preview: el classroom sigue el ENTORNO ACTIVO del switcher, no la
  // matrícula propia (un admin puede estar matriculado en otros programas). Un
  // alumno puro no tiene cookie de entorno → no entra aquí.
  const profile = await getViewerProfile(user.id);
  const sysRole = profile?.system_role ?? profile?.role;
  const isStaff = sysRole === "admin" || sysRole === "ops";
  if (isStaff) {
    const viewMode = await getViewMode();
    if (viewMode === "student") {
      const previewSlug = await getActiveEnvCohortSlug(await getActiveEnv());
      if (previewSlug) redirect(`/classroom/${previewSlug}`);
    } else {
      redirect("/admin");
    }
  }

  const programs = await getActiveEnrollmentsForUser(user.id);

  // Con una sola matrícula, no hay nada que elegir: entrada directa al programa.
  if (programs.length === 1) {
    const p = programs[0];
    const slug = p.cohortSlug ?? (await getCohortSlugById(p.cohortId));
    redirect(`/classroom/${slug ?? p.cohortId}`);
  }

  // Con varias matrículas activas, el alumno elige a qué programa entrar.
  if (programs.length > 1) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
        <h1 className="text-2xl font-bold text-gray-900">Mis programas</h1>
        <p className="mt-2 text-gray-500">
          Tienes acceso a varios programas. Elige a cuál quieres entrar.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {programs.map((p) => {
            const brand = getBrandByProgramId(p.programId);
            const href = `/classroom/${p.cohortSlug ?? p.cohortId}`;
            return (
              <Link
                key={p.cohortId}
                href={href}
                className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{ ["--tw-ring-color" as string]: brand.accent }}
              >
                <span
                  className="inline-flex h-1.5 w-10 rounded-full"
                  style={{ backgroundColor: brand.accent }}
                  aria-hidden
                />
                {p.programCode && (
                  <span className="mt-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {p.programCode}
                    {p.cohortName ? ` · ${p.cohortName}` : ""}
                  </span>
                )}
                <span className="mt-1 text-lg font-bold text-gray-900">
                  {p.programName}
                </span>
                {p.programDescription && (
                  <span className="mt-2 line-clamp-3 text-sm text-gray-500">
                    {p.programDescription}
                  </span>
                )}
                <span
                  className="mt-4 text-sm font-semibold"
                  style={{ color: brand.accent }}
                >
                  Entrar →
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-gray-900">
        Bienvenido al Classroom
      </h1>
      <p className="mt-3 text-gray-500">
        No tienes una matrícula activa en este momento. Si crees que esto es un
        error, contacta a operaciones.
      </p>
    </div>
  );
}
