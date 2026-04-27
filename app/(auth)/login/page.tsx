export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Acceso para alumnos, profesores y staff.
        </p>
        <div className="mt-6 rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">
          Form de autenticación pendiente — se implementa en la épica E1.
        </div>
      </div>
    </main>
  );
}
