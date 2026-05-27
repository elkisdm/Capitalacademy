import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6"
      style={{ background: "linear-gradient(165deg, #0f1340 0%, #1a1060 40%, #0f1340 100%)" }}
    >
      <style>{`
        @keyframes nf-float {
          0%, 100% { transform: translateY(0) }
          50% { transform: translateY(-12px) }
        }
        @keyframes nf-pulse-ring {
          0% { transform: scale(1); opacity: 0.12 }
          100% { transform: scale(1.8); opacity: 0 }
        }
        @keyframes nf-glitch {
          0%, 80%, 100% { clip-path: polygon(0 0, 0 0, 0 0, 0 0); transform: translateX(0) }
          82% { clip-path: polygon(0 15%, 100% 15%, 100% 30%, 0 30%); transform: translateX(8px) }
          84% { clip-path: polygon(0 50%, 100% 50%, 100% 62%, 0 62%); transform: translateX(-5px) }
          86% { clip-path: polygon(0 70%, 100% 70%, 100% 82%, 0 82%); transform: translateX(4px) }
          88% { clip-path: polygon(0 0, 0 0, 0 0, 0 0); transform: translateX(0) }
        }
        @keyframes nf-fade-up {
          from { opacity: 0; transform: translateY(20px) }
          to { opacity: 1; transform: translateY(0) }
        }
        .nf-stagger-1 { animation: nf-fade-up 0.6s ease-out 0.1s both }
        .nf-stagger-2 { animation: nf-fade-up 0.6s ease-out 0.25s both }
        .nf-stagger-3 { animation: nf-fade-up 0.6s ease-out 0.4s both }
        .nf-stagger-4 { animation: nf-fade-up 0.6s ease-out 0.55s both }
        .nf-stagger-5 { animation: nf-fade-up 0.6s ease-out 0.7s both }
      `}</style>

      {/* Background grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "linear-gradient(rgba(94,23,235,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(94,23,235,0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Floating decorative shapes */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="shape-circle absolute -left-20 -top-20 h-72 w-72"
          style={{ background: "radial-gradient(circle, rgba(94,23,235,0.12) 0%, transparent 70%)", animation: "nf-float 8s ease-in-out infinite" }}
        />
        <div
          className="shape-circle absolute -bottom-12 -right-12 h-56 w-56"
          style={{ background: "radial-gradient(circle, rgba(197,241,34,0.08) 0%, transparent 70%)", animation: "nf-float 10s ease-in-out 2s infinite" }}
        />
        <div
          className="shape-circle absolute left-[15%] top-[20%] h-2 w-2"
          style={{ background: "var(--color-ca-lime)", opacity: 0.4, animation: "nf-float 4s ease-in-out 1s infinite" }}
        />
        <div
          className="shape-circle absolute right-[20%] top-[30%] h-3 w-3"
          style={{ background: "var(--color-ca-violet-soft)", opacity: 0.25, animation: "nf-float 5s ease-in-out 0.5s infinite" }}
        />
        <div
          className="shape-circle absolute bottom-[25%] left-[25%] h-1.5 w-1.5"
          style={{ background: "#fff", opacity: 0.15, animation: "nf-float 6s ease-in-out 3s infinite" }}
        />
        <div
          className="shape-half-right absolute bottom-32 right-[12%] h-20 w-10"
          style={{ background: "var(--color-ca-lime)", opacity: 0.06, animation: "nf-float 7s ease-in-out 1.5s infinite" }}
        />
      </div>

      <div className="relative z-10 flex max-w-lg flex-col items-center text-center">
        {/* 404 number with glitch */}
        <div className="nf-stagger-1 relative mb-4 select-none" aria-hidden="true">
          {/* Shadow layer */}
          <span
            className="font-black tracking-[-0.06em]"
            style={{ fontSize: "clamp(120px, 22vw, 220px)", lineHeight: 0.9, color: "var(--color-ca-violet)", opacity: 0.06 }}
          >
            404
          </span>
          {/* Main layer */}
          <span
            className="absolute inset-0 flex items-center justify-center font-black tracking-[-0.06em]"
            style={{ fontSize: "clamp(120px, 22vw, 220px)", lineHeight: 0.9, color: "#fff" }}
          >
            404
          </span>
          {/* Glitch layer */}
          <span
            className="absolute inset-0 flex items-center justify-center font-black tracking-[-0.06em]"
            style={{
              fontSize: "clamp(120px, 22vw, 220px)",
              lineHeight: 0.9,
              color: "var(--color-ca-lime)",
              animation: "nf-glitch 4s ease-in-out infinite",
            }}
          >
            404
          </span>
          {/* Pulse ring behind the number */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div
              className="shape-circle h-32 w-32 md:h-44 md:w-44"
              style={{ border: "2px solid var(--color-ca-violet)", animation: "nf-pulse-ring 3s ease-out infinite" }}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="nf-stagger-2 mb-6 flex items-center gap-4">
          <div className="h-px w-12" style={{ background: "linear-gradient(90deg, transparent, rgba(94,23,235,0.4))" }} />
          <div
            className="grid h-9 w-9 place-items-center rounded-lg font-black text-white"
            style={{ background: "var(--color-ca-violet)", fontSize: 13 }}
          >
            CA
          </div>
          <div className="h-px w-12" style={{ background: "linear-gradient(90deg, rgba(94,23,235,0.4), transparent)" }} />
        </div>

        <h1 className="nf-stagger-3 text-[22px] font-black tracking-tight text-white md:text-[28px]">
          Página no encontrada
        </h1>

        <p className="nf-stagger-3 mt-3 max-w-sm text-[14px] font-medium leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
          La dirección que buscas no existe, fue movida o no tienes acceso.
        </p>

        <div className="nf-stagger-4 mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/classroom"
            className="group inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-all hover:scale-[1.04] hover:shadow-[0_0_30px_rgba(94,23,235,0.3)]"
            style={{ background: "var(--color-ca-violet)" }}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:-translate-y-0.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Ir al Classroom
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border px-6 py-3.5 text-[12px] font-bold uppercase tracking-[0.1em] transition-all hover:border-white/30 hover:bg-white/5"
            style={{ borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.55)" }}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Ir al inicio
          </Link>
        </div>

        <p className="nf-stagger-5 mt-14 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "rgba(255,255,255,0.15)" }}>
          ¿Necesitas ayuda?{" "}
          <a href="mailto:soporte@capitalinteligente.cl" className="underline underline-offset-2 transition-colors hover:text-white/30">
            Contacta a soporte
          </a>
        </p>
      </div>
    </div>
  );
}
