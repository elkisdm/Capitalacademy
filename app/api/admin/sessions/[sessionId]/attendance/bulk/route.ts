import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionStaff } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { bulkSetAttendance } from "@/lib/asistencia/queries";

export const runtime = "nodejs";

const bodySchema = z.object({
  studentIds: z.array(uuidLike).min(1).max(200),
  attended: z.boolean(),
});

async function resolveSessionId(
  props: { params: Promise<{ sessionId: string }> },
): Promise<string | null> {
  const { sessionId } = await props.params;
  return uuidLike.safeParse(sessionId).success ? sessionId : null;
}

/** POST — marca o quita, en un solo round-trip, la asistencia de varios alumnos. */
export async function POST(
  req: Request,
  props: { params: Promise<{ sessionId: string }> },
) {
  const sessionId = await resolveSessionId(props);
  if (!sessionId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  const auth = await requireSessionStaff(sessionId);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación fallida" }, { status: 422 });
  }

  const res = await bulkSetAttendance(
    sessionId,
    parsed.data.studentIds,
    parsed.data.attended,
    auth.user.id,
  );
  if (!res.ok || !res.report) {
    return NextResponse.json({ error: res.error ?? "No se pudo actualizar." }, { status: 404 });
  }
  return NextResponse.json(res.report);
}
