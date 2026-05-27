import { createAdminClient } from "@/lib/supabase/admin";

async function resolveSlug(
  table: "cohorts" | "program_modules" | "lessons",
  slug: string,
): Promise<string | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from(table)
    .select("id")
    .eq("slug", slug)
    .single();

  if (data?.id) return data.id;

  const { data: byId } = await supabase
    .from(table)
    .select("id")
    .eq("id", slug)
    .single();

  return byId?.id ?? null;
}

export function resolveCohortSlug(slug: string) {
  return resolveSlug("cohorts", slug);
}

export function resolveModuleSlug(slug: string) {
  return resolveSlug("program_modules", slug);
}

export function resolveLessonSlug(slug: string) {
  return resolveSlug("lessons", slug);
}
