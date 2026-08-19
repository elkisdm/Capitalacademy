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
      <header className="flex shrink-0 items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-black tracking-tight text-white">{title}</h1>
          {/* El código a la vista: es lo que se dicta o se pega para invitar. */}
          <p className="font-mono text-[11px] text-white/50">{code}</p>
        </div>
        {volverA && (
          <Link
            href={volverA}
            className="shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          >
            Volver a la clase
          </Link>
        )}
      </header>

      <main className="min-h-0 flex-1 px-3 pb-3">{children}</main>
    </div>
  );
}
