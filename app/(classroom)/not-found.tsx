import Image from "next/image";
import Link from "next/link";

export default function ClassroomNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <Image
        src="/brand/logo-on-light.png"
        alt="Capital Academy"
        width={96}
        height={95}
        className="mb-4 h-12 w-auto"
      />
      <div className="relative mb-6">
        <div className="shape-circle h-24 w-24 bg-ca-violet opacity-[0.08]" />
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-mono text-[48px] font-black text-ca-violet">404</span>
        </div>
      </div>
      <h1 className="text-[22px] font-black tracking-tight text-ca-ink">
        Página no encontrada
      </h1>
      <p className="mt-2 max-w-sm text-[14px] text-ca-ink-soft">
        El contenido que buscas no existe o no tienes acceso. Verifica la URL o
        vuelve al inicio.
      </p>
      <Link
        href="/classroom"
        className="ca-btn-primary mt-6 inline-flex items-center gap-2 px-6 py-3 text-[13px] font-bold uppercase tracking-[0.08em]"
      >
        Volver al Classroom
      </Link>
    </div>
  );
}
