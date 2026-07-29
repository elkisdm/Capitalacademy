import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminUserProfile, getCohortsForPicker } from "@/lib/admin/user-queries";
import { UserProfileClient } from "./user-profile-client";
import { AccessHistory } from "./access-history";

export default async function AdminUserProfilePage(
  props: { params: Promise<{ userId: string }> },
) {
  const { userId } = await props.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", user.id)
    .single();

  if (!profile || !["ops", "admin"].includes(profile.system_role)) {
    redirect("/classroom");
  }

  const [userProfile, cohorts] = await Promise.all([
    getAdminUserProfile(userId),
    getCohortsForPicker(),
  ]);

  if (!userProfile) notFound();

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
      <UserProfileClient user={userProfile} cohorts={cohorts} />
      <AccessHistory userId={userId} email={userProfile.email} />
    </div>
  );
}
