import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { GuideIndexClient } from "@/components/classroom/guide/guide-index-client";
import { SupportCard } from "@/components/classroom/guide/support-card";

export const metadata: Metadata = {
  title: "Centro de ayuda · Capital Academy",
};

export default async function GuiaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, system_role")
    .eq("id", user.id)
    .single();

  const sysRole = profile?.system_role ?? profile?.role;
  const isStaff = sysRole === "admin" || sysRole === "ops";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <GuideIndexClient
        isStaff={isStaff}
        firstName={(profile?.full_name ?? "").split(" ")[0] || null}
      />
      <div className="mt-10">
        <SupportCard />
      </div>
    </div>
  );
}
