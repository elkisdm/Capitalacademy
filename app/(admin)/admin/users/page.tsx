import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminUsersList, getCohortsForPicker } from "@/lib/admin/user-queries";
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

  const [users, cohorts] = await Promise.all([
    getAdminUsersList(),
    getCohortsForPicker(),
  ]);

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
      <UsersListClient users={users} cohorts={cohorts} />
    </div>
  );
}
