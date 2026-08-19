import Link from "next/link";

/**
 * Marco de la sala: encabezado mínimo y el resto de la pantalla para el video.
 *
 * Lo comparten el participante con cuenta y el invitado ya aprobado, para que la
 * sala se vea igual en los dos casos. Lo único que cambia es el "Volver a la
 * clase", que un invitado no tiene adónde seguir.
 *
 * Vive aparte de la página porque la portada del invitado decide del lado del
 * cliente cuándo deja de ser portada y pasa a ser sala: sin el marco extraído,
 * envolver la sala obligaba a envolver también la portada, que tiene cabecera
 * propia.
 */
export function SalaShell({
  title,
  code,
  volverA,
  children,
}: {
  title: string;
  code: string;
  volverA: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col bg-ca-ink">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <svg width="22" height="22" viewBox="0 0 26 26" fill="none" aria-hidden className="hidden shrink-0 md:block">
            <path d="M13 3L23 23H17.5L13 13.2L8.5 23H3L13 3Z" fill="#ffffff" />
            <rect x="8" y="16.5" width="10" height="2.4" rx="1.2" fill="#c5f122" />
          </svg>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-black tracking-tight text-white">{title}</h1>
            {/* El código a la vista: es lo que se dicta o se pega para invitar. */}
            <p className="font-mono text-[11px] text-white/50">{code}</p>
          </div>
        </div>
        {volverA && (
          <Link
            href={volverA}
            className="shrink-0 rounded-full border border-white/12 px-4 py-2 text-[12px] font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          >
            Volver a la clase
          </Link>
        )}
      </header>

      <main className="min-h-0 flex-1 px-3 pb-3">{children}</main>
    </div>
  );
}
