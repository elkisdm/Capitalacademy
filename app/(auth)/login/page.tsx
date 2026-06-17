import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginScreen } from "./login-screen";
import { DEFAULT_BRAND } from "@/lib/programs/registry";

export const metadata = {
  title: "Iniciar sesión",
  description: "Accede a tu cuenta en Capital Academy.",
};

export default async function LoginPage(
  props: { searchParams: Promise<{ next?: string; error?: string }> },
) {
  const { next, error } = await props.searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect(next || "/classroom");
  }

  return (
    <LoginScreen
      brand={DEFAULT_BRAND}
      redirectTo={next || DEFAULT_BRAND.redirectTo}
      error={error}
    />
  );
}
