import { createAdminClient } from "@/lib/supabase/admin";
import { sendDiplomadoInvitationEmail } from "@/lib/email/diplomado-invitation";
import { sendInvitationEmail } from "@/lib/email/invitation";
import { getBrandBySlug, onboardingSetPasswordPath } from "@/lib/programs/registry";
import { isPaymentPlan } from "@/lib/flow/checkout";
import { isLiderazgoPlan, LIDERAZGO_PROGRAM_NAME } from "@/lib/programs/liderazgo";

const INTERNAL_DOMAIN = "@capitalinteligente.cl";

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://capitalacademy.cl"
  );
}

// Familia de programa a la que pertenece un plan de pago. Determina qué
// cohorte matricula, qué onboarding branded usa y qué correo de bienvenida
// se envía. Los slugs coinciden con `lib/programs/registry.ts` (getBrandBySlug).
type ProgramFamily = "diplomado" | "liderazgo";

function resolveProgramFamily(plan: string): ProgramFamily | null {
  if (isPaymentPlan(plan)) return "diplomado";
  if (isLiderazgoPlan(plan)) return "liderazgo";
  return null;
}

/**
 * Resuelve la cohorte ACTIVA de un programa por query (nunca un ID
 * hardcodeado): así el enroll sigue funcionando cuando se abre una nueva
 * generación (G5, G6, …) sin tocar código.
 */
async function resolveActiveCohort(
  admin: ReturnType<typeof createAdminClient>,
  programId: string,
): Promise<{ id: string; name: string } | null> {
  const { data } = await admin
    .from("cohorts")
    .select("id, name")
    .eq("program_id", programId)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/**
 * Matricula a un comprador en el classroom de la cohorte ACTIVA de su
 * programa (Diplomado o Programa de Liderazgo, según el plan pagado) y le
 * envía el correo de onboarding branded con el link de activación.
 *
 * Se invoca desde el webhook de pago cuando un pago pasa a `succeeded` por
 * primera vez. Es idempotente (generateLink + upserts) y nunca lanza: devuelve
 * `{ ok }` para que un fallo de matrícula NO rompa el webhook (la plata ya fue
 * tomada; el fallo se loguea para reconciliar).
 *
 * Espeja la lógica de `scripts/invite-diplomado-g4.mjs` (creación de cuenta,
 * perfil, matrícula con segmento y correo), pero en server-side TypeScript.
 */
export async function enrollBuyer(input: {
  email: string;
  firstname: string;
  lastname: string;
  plan: string;
}): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const family = resolveProgramFamily(input.plan);
  if (!family) {
    return { ok: false, error: `unknown-plan-family:${input.plan}` };
  }

  const email = input.email.trim().toLowerCase();
  const fullName =
    `${input.firstname ?? ""} ${input.lastname ?? ""}`.trim() || email;
  const base = siteUrl();

  // Onboarding branded del programa: /onboarding/<slug>/set-password.
  const brand = getBrandBySlug(family);
  const onboardingPath = onboardingSetPasswordPath(brand);
  const redirectTo = `${base}${onboardingPath}`;

  try {
    const admin = createAdminClient();

    if (!brand.programId) {
      return { ok: false, error: `no-program-id:${family}` };
    }
    const cohort = await resolveActiveCohort(admin, brand.programId);
    if (!cohort) {
      return { ok: false, error: `no-active-cohort:${family}` };
    }

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
      `&type=${vtype}&next=${encodeURIComponent(onboardingPath)}`;

    // 2. Perfil (rol student). Solo se crea si no existe: si el comprador ya
    //    tenía un perfil (p. ej. admin/ops/teacher que compra con su misma
    //    cuenta), `ignoreDuplicates` evita degradar su `role` a "student" o
    //    pisar su `full_name` con lo que haya escrito en este checkout.
    const { error: profileErr } = await admin.from("profiles").upsert(
      { id: userId, email, full_name: fullName, role: "student" },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (profileErr) return { ok: false, error: `profile: ${profileErr.message}` };

    // 3. Matrícula en la cohorte activa (segmento Capital Inteligente por dominio del correo).
    const segment = email.endsWith(INTERNAL_DOMAIN) ? "capital_inteligente" : null;
    const { error: enrollErr } = await admin.from("enrollments").upsert(
      {
        cohort_id: cohort.id,
        student_id: userId,
        status: "active",
        segment,
      },
      { onConflict: "cohort_id,student_id" },
    );
    if (enrollErr) return { ok: false, error: `enrollment: ${enrollErr.message}` };

    // 4. Correo de onboarding branded con el link. El Diplomado usa su template
    //    específico (mismo que los alumnos invitados a mano); el resto usa el
    //    template genérico parametrizado por programa/cohorte.
    const emailResult =
      family === "diplomado"
        ? await sendDiplomadoInvitationEmail({ email, fullName, inviteUrl })
        : await sendInvitationEmail({
            email,
            fullName,
            inviteUrl,
            programName: LIDERAZGO_PROGRAM_NAME,
            cohortName: cohort.name,
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
