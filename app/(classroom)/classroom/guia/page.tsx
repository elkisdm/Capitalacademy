import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser, getViewerProfile } from "@/lib/supabase/auth";
import { isTeacherUser } from "@/lib/docente/queries";
import { getActiveEnrollmentsForUser } from "@/lib/classroom/queries";
import { visibleAudiences } from "@/lib/guide/audience";
import { GuideIndexClient } from "@/components/classroom/guide/guide-index-client";
import { SupportCard } from "@/components/classroom/guide/support-card";

export const metadata: Metadata = {
  title: "Centro de ayuda · Capital Academy",
};

export default async function GuiaPage() {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const profile = await getViewerProfile(user.id);

  const sysRole = profile?.system_role ?? profile?.role;
  const isStaff = sysRole === "admin" || sysRole === "ops";
  const isTeacher = isStaff ? false : await isTeacherUser(user.id);
  const audiences = visibleAudiences({ isStaff, isTeacher });

  // Re-lanzar el tour guiado (ADR-0030) exige un dashboard donde correrlo, y
  // eso es una cohorte. Se toma la matrícula activa más reciente, que es la
  // misma que usa el sidebar por defecto.
  const enrollments = await getActiveEnrollmentsForUser(user.id);
  const target = enrollments[0];
  const tourHref = target
    ? `/classroom/${target.cohortSlug ?? target.cohortId}?tour=1`
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <GuideIndexClient
        audiences={audiences}
        firstName={(profile?.full_name ?? "").split(" ")[0] || null}
        tourHref={tourHref}
      />
      <div className="mt-10">
        <SupportCard />
      </div>
    </div>
  );
}
