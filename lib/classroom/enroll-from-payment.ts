import { createAdminClient } from "@/lib/supabase/admin";
import { sendDiplomadoInvitationEmail } from "@/lib/email/diplomado-invitation";

// Cohorte del Diplomado en curso (IV Generación). Si en el futuro hay una nueva
// generación, este mapeo debe actualizarse (o derivarse del plan).
const DIPLOMADO_COHORT_ID = "b0000000-0000-0000-0000-000000000002";

const INTERNAL_DOMAIN = "@capitalinteligente.cl";

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://capitalacademy.cl"
  );
}

/**
 * Matricula a un comprador del Diplomado en el classroom de la generación en
 * curso (G4) y le envía el correo de onboarding con el link de activación.
 *
 * Se invoca desde el webhook de pago cuando un pago del Diplomado pasa a
 * `succeeded` por primera vez. Es idempotente (generateLink + upserts) y nunca
 * lanza: devuelve `{ ok }` para que un fallo de matrícula NO rompa el webhook
 * (la plata ya fue tomada; el fallo se loguea para reconciliar).
 *
 * Espeja la lógica de `scripts/invite-diplomado-g4.mjs` (creación de cuenta,
 * perfil, matrícula con segmento y correo), pero en server-side TypeScript.
 */
export async function enrollDiplomadoBuyer(input: {
  email: string;
  firstname: string;
  lastname: string;
}): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const email = input.email.trim().toLowerCase();
  const fullName =
    `${input.firstname ?? ""} ${input.lastname ?? ""}`.trim() || email;
  const base = siteUrl();
  const redirectTo = `${base}/onboarding/set-password`;

  try {
    const admin = createAdminClient();

    // 1. Link de invitación (crea el auth user si no existe; recovery si ya existe).
    let link = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    });
    if (link.error && /registered|already/i.test(link.error.message)) {
      link = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });
    }
    if (link.error) {
      return { ok: false, error: `generateLink: ${link.error.message}` };
    }

    const hashed = link.data.properties?.hashed_token;
    const vtype = link.data.properties?.verification_type ?? "invite";
    const userId = link.data.user?.id;
    if (!hashed || !userId) {
      return { ok: false, error: "generateLink: sin token o userId" };
    }

    const inviteUrl =
      `${base}/auth/confirm?token_hash=${encodeURIComponent(hashed)}` +
      `&type=${vtype}&next=${encodeURIComponent("/onboarding/set-password")}`;

    // 2. Perfil (rol student).
    const { error: profileErr } = await admin
      .from("profiles")
      .upsert(
        { id: userId, email, full_name: fullName, role: "student" },
        { onConflict: "id" },
      );
    if (profileErr) return { ok: false, error: `profile: ${profileErr.message}` };

    // 3. Matrícula en G4 (segmento Capital Inteligente por dominio del correo).
    const segment = email.endsWith(INTERNAL_DOMAIN) ? "capital_inteligente" : null;
    const { error: enrollErr } = await admin.from("enrollments").upsert(
      {
        cohort_id: DIPLOMADO_COHORT_ID,
        student_id: userId,
        status: "active",
        segment,
      } as never,
      { onConflict: "cohort_id,student_id" },
    );
    if (enrollErr) return { ok: false, error: `enrollment: ${enrollErr.message}` };

    // 4. Correo de onboarding del Diplomado (mismo template que los alumnos
    //    invitados a mano: bienvenida + logística de la 1ª clase) con el link.
    const emailResult = await sendDiplomadoInvitationEmail({
      email,
      fullName,
      inviteUrl,
    });
    if (!emailResult.success) {
      // El alumno YA está matriculado; el correo se puede reenviar. No abortamos.
      return { ok: false, error: `email: ${emailResult.error}`, userId };
    }

    // 5. Bitácora anti-duplicado (best-effort; no bloquea si falla).
    await admin.from("invitation_log").insert({
      user_id: userId,
      email,
      sent_at: new Date().toISOString(),
      sent_by: null,
      channel: "email",
      status: "sent",
    });

    return { ok: true, userId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}
