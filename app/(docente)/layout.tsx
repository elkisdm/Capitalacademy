import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { Logo } from "@/components/classroom/primitives";

export const metadata = {
  title: "Panel del profesor",
};

/**
 * Layout del panel del docente (`/docente`). Sin ClassroomSidebar: evita
 * filtrar la navegación de administración global o la del alumno. Acceso:
 * platform staff (ops/admin) o cualquier docente/asistente (cohort_roles),
 * aunque no tenga matrícula ni system_role especial (ADR-0013).
 */
export default async function DocenteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getAuthUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", user.id)
    .single();

  const isPlatformStaff =
    !!profile && ["ops", "admin"].includes(profile.system_role);

  if (!isPlatformStaff) {
    const { data: cohortRole } = await supabase
      .from("cohort_roles")
      .select("id")
      .eq("user_id", user.id)
      .in("role", ["teacher", "assistant"])
      .limit(1)
      .maybeSingle();

    if (!cohortRole) redirect("/classroom");
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--color-ca-bg)" }}>
      <header className="flex items-center justify-between border-b border-ca-ink/[0.08] bg-ca-surface px-5 py-3.5">
        <Logo />
        <div className="flex items-center gap-4">
          <span className="hidden text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft sm:inline">
            Panel del profesor
          </span>
          <Link
            href="/classroom"
            className="rounded-xl border border-ca-ink/[0.1] px-3 py-2 text-[12px] font-bold text-ca-ink transition-colors hover:border-ca-violet hover:text-ca-violet"
          >
            Volver al classroom
          </Link>
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="rounded-xl px-3 py-2 text-[12px] font-bold text-ca-ink-soft transition-colors hover:bg-ca-bg-soft hover:text-ca-ink"
            >
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-5 py-6 sm:px-8">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  );
}
