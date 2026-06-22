"use server";

import { cookies } from "next/headers";
import { ENV_COOKIE, VIEW_MODE_COOKIE, type ViewMode } from "./active-env";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Fija el entorno activo del staff (program_id o "all"). */
export async function setActiveEnv(programId: string): Promise<void> {
  const store = await cookies();
  store.set(ENV_COOKIE, programId, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });
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
