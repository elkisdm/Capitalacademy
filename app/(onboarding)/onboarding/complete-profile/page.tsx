import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompleteProfileClient } from "./complete-profile-client";

export default async function CompleteProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, phone, rut, company, job_title, linkedin_url, bio, avatar_url",
    )
    .eq("id", user.id)
    .single();

  return (
    <CompleteProfileClient
      email={user.email ?? ""}
      profile={{
        full_name: profile?.full_name ?? "",
        phone: profile?.phone ?? "",
        rut: profile?.rut ?? "",
        company: profile?.company ?? "",
        job_title: profile?.job_title ?? "",
        linkedin_url: profile?.linkedin_url ?? "",
        bio: profile?.bio ?? "",
        avatar_url: profile?.avatar_url ?? null,
      }}
    />
  );
}
