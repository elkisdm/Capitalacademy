import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Globe, UserRound } from "lucide-react";
import { getAuthUser } from "@/lib/supabase/auth";
import { getClassroomAccess } from "@/lib/classroom/access";
import { getCohortWithProgram } from "@/lib/classroom/queries";
import { resolveCohortSlug } from "@/lib/classroom/resolve-slugs";
import { getInstructorProfile } from "@/lib/instructors/queries";
import { buildSocialLinks, hasProfileContent } from "@/lib/instructors/social";
import type { SocialNetwork } from "@/lib/instructors/types";
import { Avatar, BrandShapes, Breadcrumb } from "@/components/classroom/primitives";

export const metadata: Metadata = {
  title: "Perfil del profesor · Capital Academy",
};

// lucide 1.x ya no incluye íconos de marca (Linkedin/Instagram se eliminaron del
// set), así que los dos glifos van inline. `Globe` sí existe y cubre el sitio web.
function LinkedinGlyph() {
  return (
    <svg
      aria-hidden
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.78 2.5 4.78 5.76V21h-4v-5.6c0-1.34-.03-3.07-1.95-3.07-1.95 0-2.25 1.46-2.25 2.97V21h-4z" />
    </svg>
  );
}

function InstagramGlyph() {
  return (
    <svg
      aria-hidden
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

const NETWORK_ICON: Record<SocialNetwork, () => React.ReactElement> = {
  linkedin: LinkedinGlyph,
  instagram: InstagramGlyph,
  website: () => <Globe className="h-4 w-4 shrink-0" />,
};

export default async function InstructorProfilePage(
  props: { params: Promise<{ cohortSlug: string; instructorId: string }> },
) {
  const { cohortSlug, instructorId } = await props.params;

  const cohortId = await resolveCohortSlug(cohortSlug);
  if (!cohortId) notFound();

  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const [access, cohort] = await Promise.all([
    getClassroomAccess(user.id, cohortId),
    getCohortWithProgram(cohortId),
  ]);
  if (!access) notFound();
  if (!cohort) notFound();

  // La autorización real la hace la RLS: `instructors_program_scoped_select`
  // (migración 0059) solo devuelve la ficha si este usuario tiene acceso a algún
  // programa donde el docente dicta. Un alumno de otro entorno recibe null y cae
  // en el mismo notFound() que un id inexistente — la pantalla NO filtra si el
  // instructor existe o no.
  const instructor = await getInstructorProfile(instructorId);
  if (!instructor) notFound();

  const program = cohort.programs as { id: string; name: string };
  const links = buildSocialLinks(instructor);
  const hasContent = hasProfileContent(instructor);
  const bio = instructor.bio?.trim() ?? "";

  return (
    <div className="ca-fade-up mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <Breadcrumb
        items={[
          { label: program.name, href: `/classroom/${cohortSlug}` },
          { label: "Calendario", href: `/classroom/${cohortSlug}/calendario` },
          { label: instructor.full_name },
        ]}
      />

      {/* Ficha */}
      <section
        className="relative mt-4 overflow-hidden p-6 text-white md:p-8"
        style={{
          background:
            "linear-gradient(135deg, var(--color-ca-navy-ink) 0%, var(--color-ca-navy-deep) 70%, var(--color-ca-violet-deep) 100%)",
          borderRadius: 28,
        }}
      >
        <BrandShapes variant="hero" />
        <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <Avatar
            initials={instructor.full_name}
            avatarUrl={instructor.photo_url}
            size={96}
            accent="bg-ca-lime"
          />
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/55">
              Profesor
            </div>
            <h1 className="mt-1 text-[26px] font-black leading-[1.05] tracking-[-0.03em] md:text-[34px]">
              {instructor.full_name}
            </h1>
            {instructor.headline?.trim() && (
              <p className="mt-2 text-[14px] font-semibold text-ca-lime md:text-[15px]">
                {instructor.headline.trim()}
              </p>
            )}
          </div>
        </div>
      </section>

      {hasContent ? (
        <div className="mt-6 flex flex-col gap-6">
          {bio && (
            <section className="ca-card p-5 md:p-6">
              <h2 className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                Sobre el profesor
              </h2>
              <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ca-ink">
                {bio}
              </p>
            </section>
          )}

          {links.length > 0 && (
            <section className="ca-card p-5 md:p-6">
              <h2 className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                Dónde encontrarlo
              </h2>
              <div className="mt-3 flex flex-wrap gap-2.5">
                {links.map((link) => {
                  const Icon = NETWORK_ICON[link.network];
                  return (
                    <a
                      key={link.network}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={`${link.label} de ${instructor.full_name} (se abre en una pestaña nueva)`}
                      className="inline-flex items-center gap-2 rounded-xl bg-ca-bg-soft px-3.5 py-2 text-[13px] font-bold text-ca-ink transition-colors hover:bg-ca-violet hover:text-white"
                    >
                      <Icon />
                      <span className="max-w-[200px] truncate">{link.display}</span>
                    </a>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      ) : (
        <section className="ca-card mt-6 flex flex-col items-center p-8 text-center md:p-12">
          <UserRound className="h-10 w-10 text-ca-ink-soft/40" />
          <p className="mt-3 text-[15px] font-bold text-ca-ink">
            Este perfil todavía no tiene información
          </p>
          <p className="mt-1 max-w-md text-[13px] leading-relaxed text-ca-ink-soft">
            Cuando el equipo publique la reseña y las redes de {instructor.full_name}, las vas a
            ver aquí. Mientras tanto, puedes revisar sus clases en el calendario del programa.
          </p>
          <Link
            href={`/classroom/${cohortSlug}/calendario`}
            className="mt-5 inline-flex items-center rounded-xl bg-ca-ink px-4 py-2 text-[13px] font-bold text-white transition-transform hover:scale-[1.02]"
          >
            Ir al calendario
          </Link>
        </section>
      )}
    </div>
  );
}
