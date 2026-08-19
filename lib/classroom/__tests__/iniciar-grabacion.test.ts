import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/livekit/egress", async () => {
  const real = await vi.importActual<typeof import("@/lib/livekit/egress")>(
    "@/lib/livekit/egress",
  );
  return { ...real, startRoomComposite: (...a: unknown[]) => mockStart(...(a as [])) };
});

const mockStart = vi.fn(async () => ({ egressId: "EG_1", status: "EGRESS_ACTIVE" }));

const { iniciarGrabacionDeSesion } = await import("@/lib/classroom/iniciar-grabacion");

type Resultado = { data: unknown; error?: unknown };

/** Cliente falso: cada tabla devuelve lo que le pongamos, y anota los insert. */
function fakeAdmin(opts: {
  viva?: Resultado;
  previa?: Resultado;
  insert?: Resultado;
  insertSpy?: (row: unknown) => void;
}) {
  const cadena = (resolver: () => Resultado) => {
    const n: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit", "update"]) {
      n[m] = () => n;
    }
    n.maybeSingle = () => Promise.resolve(resolver());
    n.single = () => Promise.resolve(resolver());
    return n;
  };

  let llamadaSelect = 0;
  return {
    from(table: string) {
      if (table !== "session_recordings") throw new Error(`tabla no mockeada: ${table}`);
      return {
        select: () => {
          llamadaSelect += 1;
          // 1ª lectura: ¿hay una viva? 2ª: ¿ya se grabó antes?
          const r = llamadaSelect === 1 ? opts.viva : opts.previa;
          return cadena(() => r ?? { data: null });
        },
        insert: (row: unknown) => {
          opts.insertSpy?.(row);
          return cadena(() => opts.insert ?? { data: null, error: { message: "sin mock" } });
        },
        update: () => cadena(() => ({ data: null })),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const SESSION = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const base = { sessionId: SESSION, room: `clase-${SESSION}`, startedBy: null };

const ENV_GRABACION = {
  LIVEKIT_EGRESS_ENABLED: "1",
  LIVEKIT_URL: "wss://livekit.example",
  LIVEKIT_API_KEY: "k",
  LIVEKIT_API_SECRET: "s",
  SUPABASE_S3_ACCESS_KEY_ID: "ak",
  SUPABASE_S3_SECRET_ACCESS_KEY: "sk",
  SUPABASE_S3_REGION: "us-east-1",
  NEXT_PUBLIC_SUPABASE_URL: "https://proyecto.supabase.co",
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(process.env, ENV_GRABACION);
});
afterEach(() => {
  for (const k of Object.keys(ENV_GRABACION)) delete process.env[k];
});

describe("iniciarGrabacionDeSesion — arranque automático", () => {
  it("no reenciende una clase que el docente detuvo a mano", async () => {
    // El DELETE deja la fila en `uploaded`, que está FUERA del índice único
    // parcial: sin este guardia, el siguiente que entrara a la sala volvería a
    // grabar sin que nadie lo pidiera.
    const insertSpy = vi.fn();
    const admin = fakeAdmin({
      viva: { data: null },
      previa: { data: { id: "rec-previa" } },
      insertSpy,
    });

    const res = await iniciarGrabacionDeSesion(admin, { ...base, automatico: true });

    expect(res).toEqual({ ok: false, motivo: "ya_grabada" });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("el botón SÍ puede volver a grabar: es una decisión humana", async () => {
    const insertSpy = vi.fn();
    const admin = fakeAdmin({
      viva: { data: null },
      previa: { data: { id: "rec-previa" } },
      insert: { data: { id: "rec-nueva", status: "starting" }, error: null },
      insertSpy,
    });

    await iniciarGrabacionDeSesion(admin, { ...base, startedBy: "user-1" });

    expect(insertSpy).toHaveBeenCalled();
  });

  it("una grabación viva se devuelve tal cual, sin insertar otra", async () => {
    const insertSpy = vi.fn();
    const admin = fakeAdmin({
      viva: { data: { id: "rec-viva", status: "active", egress_id: "EG_9" } },
      insertSpy,
    });

    const res = await iniciarGrabacionDeSesion(admin, { ...base, automatico: true });

    expect(res).toMatchObject({ ok: true, yaEstaba: true });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("con el interruptor apagado no toca la base", async () => {
    delete process.env.LIVEKIT_EGRESS_ENABLED;
    const insertSpy = vi.fn();
    const admin = fakeAdmin({ insertSpy });

    const res = await iniciarGrabacionDeSesion(admin, { ...base, automatico: true });

    expect(res).toEqual({ ok: false, motivo: "deshabilitado" });
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
