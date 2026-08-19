import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { INSTRUCTOR_PROFILE_COLUMNS } from "@/lib/instructors/types";
import { ensureInstructorForProfile } from "@/lib/instructors/ensure";

export const runtime = "nodejs";

/**
 * Alta de una ficha docente (ADR-0036).
 *
 * Hasta ahora `instructors` solo nacía del seed del entorno, así que un docente
 * nuevo no existía para el selector de `class_sessions.teacher_id` y no había
 * forma de crearlo sin SQL. Esta ruta cierra ese hueco.
 *
 * Solo el nombre y —opcionalmente— la cuenta: el contenido del perfil público
 * (titular, reseña, redes, foto) se edita después en `/admin/docentes` o lo
 * completa la propia persona en `/docente/perfil`.
 *
 * La escritura la gatea la RLS (`instructors_staff_write`, solo platform staff);
 * `authorizeAdmin` es la primera barrera para devolver un mensaje claro.
 */
const createSchema = z.object({
  full_name: z.string().trim().min(2, "El nombre es muy corto").max(120),
  profile_id: uuidLike.nullable().optional(),
});

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 422 },
    );
  }

  const { full_name, profile_id } = parsed.data;
  const supabase = await createClient();

  // Si viene con cuenta, se reusa el mismo camino que el alta automática por rol
  // docente: así una persona nunca termina con dos fichas según por dónde entró.
  if (profile_id) {
    const ensured = await ensureInstructorForProfile(supabase, profile_id);
    if (ensured.error || !ensured.data) {
      return NextResponse.json(
        { error: ensured.error ?? "No se pudo crear la ficha" },
        { status: 422 },
      );
    }
    const { data } = await supabase
      .from("instructors")
      .select(`${INSTRUCTOR_PROFILE_COLUMNS}, is_active, profile_id`)
      .eq("id", ensured.data.id)
      .maybeSingle();
    return NextResponse.json(data, { status: ensured.data.created ? 201 : 200 });
  }

  // Sin cuenta: es el relator invitado que dicta una clase y no usa la
  // plataforma. Se puede enlazar después desde `/admin/docentes`.
  const { data, error } = await supabase
    .from("instructors")
    .insert({ full_name, is_active: true })
    .select(`${INSTRUCTOR_PROFILE_COLUMNS}, is_active, profile_id`)
    .single();

  if (error) {
    console.error("instructor create error", error);
    if (error.code === "42501") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error al crear la ficha" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
