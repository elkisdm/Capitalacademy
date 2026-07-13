"use server";

import { cookies } from "next/headers";
import { ENV_COOKIE, VIEW_MODE_COOKIE, type ViewMode } from "./active-env";
import { getActiveEnvCohortSlug } from "@/lib/classroom/staff-preview";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Fija el entorno activo del staff (program_id o "all"). */
export async function setActiveEnv(programId: string): Promise<string | null> {
  const store = await cookies();
  store.set(ENV_COOKIE, programId, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });
  // Devuelve el cohorte del nuevo entorno para que el switcher re-ancle la URL
  // del classroom (evita que el sidebar quede pegado al entorno anterior).
  if (programId === "all") return null;
  return getActiveEnvCohortSlug(programId);
}

/** Fija el modo de vista del staff (admin | student). */
export async function setViewMode(mode: ViewMode): Promise<void> {
  const store = await cookies();
  store.set(VIEW_MODE_COOKIE, mode, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });
}
