import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <div className="max-w-xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Capital Academy
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          Plataforma académica
        </h1>
        <p className="mt-4 text-base text-neutral-600 dark:text-neutral-400">
          Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria. Acceso por
          cohorte, asistencia, evaluaciones, tareas, notas y certificación.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-full bg-neutral-900 px-6 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-50 dark:text-neutral-900"
          >
            Ingresar
          </Link>
        </div>
      </div>
    </main>
  );
}
