import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { getTasksForDigest } from "@/lib/admin/leads-queries";
import { diaChile } from "@/lib/admin/leads-pipeline";
import { buildLeadTasksDigest } from "@/lib/email/lead-tasks-digest";
import { sendEmailBatch } from "@/lib/email/send-batch";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET/POST  /api/cron/lead-tasks
//
//   Recordatorio diario del seguimiento de leads (ADR-0038). Corre una vez al
//   día temprano en Chile y le manda a cada persona SUS tareas atrasadas y las
//   que vencen hoy.
//
//   No hay bitácora de envío ni reintentos a propósito: la corrida de mañana
//   vuelve a incluir todo lo que siga pendiente, así que un envío perdido se
//   recupera solo. Lo que sí importa es no mandar dos veces el mismo día, y de
//   eso se encarga la clave de idempotencia del batch.
//
//   El prefijo LLEVA EL DÍA de Chile y eso no es decorativo: `idempotencyKeyFor`
//   hashea solo la lista de destinatarios, no el contenido. Con un prefijo fijo
//   y un equipo estable la clave sería idéntica todos los días, Resend
//   respondería con la copia cacheada del día anterior y el correo dejaría de
//   llegar para siempre — reportando `sent` igual. El resto de los llamadores de
//   `sendEmailBatch` ancla el prefijo a un id único (`sr:<sesión>`, `ec:<campaña>`)
//   justamente por esto; acá lo único que distingue una corrida de la siguiente
//   es la fecha.
// ---------------------------------------------------------------------------

async function run(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let destinatarios;
  try {
    destinatarios = await getTasksForDigest();
  } catch (err) {
    console.error("lead-tasks digest query error", err);
    return NextResponse.json({ error: "Error al consultar tareas" }, { status: 500 });
  }

  // Sin nada pendiente no se envía nada. Un correo que a veces dice "no tienes
  // tareas" deja de leerse, y entonces tampoco se lee el día que sí importaba.
  if (destinatarios.length === 0) {
    return NextResponse.json({ ok: true, recipients: 0, sent: 0 });
  }

  const messages = destinatarios.map((r) => ({
    to: r.email,
    ...buildLeadTasksDigest(r),
  }));

  const outcome = await sendEmailBatch(
    messages,
    `lead-tasks-digest:${diaChile(new Date())}`,
  );

  if (outcome.failed.length > 0) {
    console.error("lead-tasks digest fallos", outcome.failed);
  }

  return NextResponse.json({
    ok: true,
    recipients: destinatarios.length,
    sent: outcome.sent.length,
    failed: outcome.failed.length,
  });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
