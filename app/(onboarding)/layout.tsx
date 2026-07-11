import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Completa tu perfil · Capital Academy",
};

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center px-4 py-8 md:py-12"
      style={{ background: "#070a29" }}
    >
      <div className="mb-8">
        <Image
          src="/brand/logo-light.webp"
          alt="Capital Academy"
          width={96}
          height={95}
          priority
          className="h-12 w-auto"
        />
      </div>
      {children}
    </div>
  );
}
