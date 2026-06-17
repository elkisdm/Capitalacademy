import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginScreen } from "../login-screen";
import { getBrandBySlug } from "@/lib/programs/registry";

export async function generateMetadata(
  props: { params: Promise<{ programa: string }> },
) {
  const { programa } = await props.params;
  const brand = getBrandBySlug(programa);
  return {
    title: `Iniciar sesión · ${brand.shortName}`,
    description: `Accede a tu classroom de ${brand.shortName}.`,
  };
}

/**
 * Login branded por entorno: /login/diplomado, /login/workshop, /login/liderazgo.
 * Un slug desconocido cae a la marca genérica (no 404 de auth).
 */
export default async function ProgramLoginPage(
  props: {
    params: Promise<{ programa: string }>;
    searchParams: Promise<{ next?: string; error?: string }>;
  },
) {
  const { programa } = await props.params;
  const { next, error } = await props.searchParams;

  const brand = getBrandBySlug(programa);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect(next || "/classroom");
  }

  return (
    <LoginScreen
      brand={brand}
      redirectTo={next || brand.redirectTo}
      error={error}
    />
  );
}
