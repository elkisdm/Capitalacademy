import { NextResponse } from "next/server";
import { getAuthUser, getViewerProfile } from "@/lib/supabase/auth";
import { isTeacherUser } from "@/lib/docente/queries";
import { articlesByAudience } from "@/lib/guide/content";
import { buildGuidePdf } from "@/lib/guide/pdf";

export const runtime = "nodejs"; // pdf-lib no corre en edge
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/guia/profesor/pdf
//   Descarga directa (sin Storage) de la guía del profesor en PDF, generada
//   al vuelo desde `articlesByAudience("teacher")`: única fuente de verdad,
//   nunca se desincroniza del Centro de Ayuda. Staff o docente; un alumno
//   recibe 403.
// ---------------------------------------------------------------------------

export async function GET() {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const profile = await getViewerProfile(user.id);
  const sysRole = profile?.system_role ?? profile?.role;
  const isStaff = sysRole === "admin" || sysRole === "ops";
  const isTeacher = isStaff ? true : await isTeacherUser(user.id);

  if (!isTeacher) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const bytes = await buildGuidePdf(articlesByAudience("teacher"));

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="guia-del-profesor-capital-academy.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
