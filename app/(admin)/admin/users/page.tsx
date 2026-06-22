import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminUsersList, getCohortsForPicker } from "@/lib/admin/user-queries";
import { getActiveEnv } from "@/lib/admin/active-env";
import { UsersListClient } from "./users-list-client";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", user.id)
    .single();

  if (!profile || !["ops", "admin"].includes(profile.system_role)) {
    redirect("/classroom");
  }

  const activeEnv = await getActiveEnv();
  const [users, cohorts] = await Promise.all([
    getAdminUsersList(activeEnv),
    getCohortsForPicker(),
  ]);

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
      {/* Los datos ya vienen scopeados al entorno activo (server-side); el
          filtro cliente queda en "all" para no re-filtrar al staff transversal. */}
      <UsersListClient
        key={activeEnv ?? "all"}
        users={users}
        cohorts={cohorts}
        initialProgramFilter="all"
      />
    </div>
  );
}
