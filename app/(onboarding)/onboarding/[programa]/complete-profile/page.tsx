import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompleteProfileClient } from "../../complete-profile/complete-profile-client";
import { getBrandBySlug } from "@/lib/programs/registry";

export async function generateMetadata(
  props: { params: Promise<{ programa: string }> },
) {
  const { programa } = await props.params;
  const brand = getBrandBySlug(programa);
  return { title: `Completa tu perfil · ${brand.shortName}` };
}

/**
 * Complete-profile branded por entorno: /onboarding/diplomado/complete-profile.
 * La marca viene del slug de la URL; slug desconocido → marca genérica.
 */
export default async function ProgramCompleteProfilePage(
  props: { params: Promise<{ programa: string }> },
) {
  const { programa } = await props.params;
  const brand = getBrandBySlug(programa);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login/${programa}`);

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
      brand={brand}
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
