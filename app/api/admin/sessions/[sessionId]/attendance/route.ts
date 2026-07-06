import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import {
  getSessionAttendance,
  markManualAttendance,
  unmarkAttendance,
} from "@/lib/asistencia/queries";

export const runtime = "nodejs";

const bodySchema = z.object({ studentId: uuidLike });

async function resolveSessionId(
  props: { params: Promise<{ sessionId: string }> },
): Promise<string | null> {
  const { sessionId } = await props.params;
  return uuidLike.safeParse(sessionId).success ? sessionId : null;
}

/** GET — reporte de asistencia de la sesión (matriculados + estado). */
export async function GET(
  _req: Request,
  props: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireStaff();
  if ("error" in auth) return auth.error;

  const sessionId = await resolveSessionId(props);
  if (!sessionId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  const report = await getSessionAttendance(sessionId);
  if (!report) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  }
  return NextResponse.json(report);
}

/** POST — marca manualmente la asistencia de un alumno (method='manual'). */
export async function POST(
  req: Request,
  props: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireStaff();
  if ("error" in auth) return auth.error;

  const sessionId = await resolveSessionId(props);
  if (!sessionId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

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

  const res = await markManualAttendance(
    sessionId,
    parsed.data.studentId,
    auth.user.id,
  );
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE — quita la asistencia de un alumno a la sesión. */
export async function DELETE(
  req: Request,
  props: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireStaff();
  if ("error" in auth) return auth.error;

  const sessionId = await resolveSessionId(props);
  if (!sessionId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

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

  const res = await unmarkAttendance(sessionId, parsed.data.studentId);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
