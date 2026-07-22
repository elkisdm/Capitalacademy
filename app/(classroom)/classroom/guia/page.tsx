import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser, getViewerProfile } from "@/lib/supabase/auth";
import { isTeacherUser } from "@/lib/docente/queries";
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <GuideIndexClient
        audiences={audiences}
        firstName={(profile?.full_name ?? "").split(" ")[0] || null}
      />
      <div className="mt-10">
        <SupportCard />
      </div>
    </div>
  );
}
