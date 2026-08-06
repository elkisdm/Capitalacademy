import { describe, it, expect } from "vitest";
import {
  decideRoomAccess,
  roomNameForSession,
  tokenExpiryFor,
  isWithinRoomWindow,
  ROOM_OPENS_BEFORE_MIN,
  ROOM_CLOSES_AFTER_MIN,
  type RoomSession,
} from "../access";

/**
 * Esta es la frontera de acceso a la clase en vivo: decide quién entra a qué
 * sala y con qué permisos. El servidor de LiveKit no revalida nada de esto.
 */

const COHORT = "cohorte-1";

function session(overrides: Partial<RoomSession> = {}): RoomSession {
  return {
    id: "ses-1",
    cohort_id: COHORT,
    starts_at: "2026-08-06T15:00:00Z",
    ends_at: "2026-08-06T17:00:00Z",
    modality: "live_online",
    ...overrides,
  };
}

/** Alumno matriculado, en plena clase, salvo que el test diga otra cosa. */
function input(overrides: Partial<Parameters<typeof decideRoomAccess>[0]> = {}) {
  return {
    session: session(),
    cohortId: COHORT,
    hasActiveEnrollment: true,
    isStaff: false,
    now: new Date("2026-08-06T15:30:00Z"),
    ...overrides,
  };
}

describe("roomNameForSession", () => {
  it("deriva la sala del id de la sesión", () => {
    expect(roomNameForSession("ses-1")).toBe("clase-ses-1");
  });

  it("sesiones distintas nunca comparten sala", () => {
    expect(roomNameForSession("a")).not.toBe(roomNameForSession("b"));
  });
});

describe("isWithinRoomWindow", () => {
  const s = session();

  it("está abierta durante la clase", () => {
    expect(isWithinRoomWindow(s, new Date("2026-08-06T16:00:00Z"))).toBe(true);
  });

  it("abre antes del inicio y no más temprano", () => {
    const abre = Date.parse(s.starts_at) - ROOM_OPENS_BEFORE_MIN * 60_000;
    expect(isWithinRoomWindow(s, new Date(abre))).toBe(true);
    expect(isWithinRoomWindow(s, new Date(abre - 1000))).toBe(false);
  });

  it("cierra después del fin y no más tarde", () => {
    const cierra = Date.parse(s.ends_at) + ROOM_CLOSES_AFTER_MIN * 60_000;
    expect(isWithinRoomWindow(s, new Date(cierra))).toBe(true);
    expect(isWithinRoomWindow(s, new Date(cierra + 1000))).toBe(false);
  });
});

describe("tokenExpiryFor", () => {
  it("ata el vencimiento al fin de la clase más la gracia", () => {
    const exp = tokenExpiryFor(session(), new Date("2026-08-06T15:30:00Z"));
    expect(exp.toISOString()).toBe("2026-08-06T19:00:00.000Z");
  });

  it("nunca emite un token que vence de inmediato", () => {
    // Alguien que entra justo cuando la sala está por cerrar igual necesita
    // margen para conectarse.
    const now = new Date("2026-08-06T18:59:00Z");
    const exp = tokenExpiryFor(session(), now);
    expect(exp.getTime() - now.getTime()).toBeGreaterThanOrEqual(15 * 60_000);
  });
});

describe("decideRoomAccess", () => {
  it("deja entrar al alumno matriculado durante la clase", () => {
    const d = decideRoomAccess(input());
    expect(d.allowed).toBe(true);
    if (!d.allowed) return;
    expect(d.role).toBe("student");
    expect(d.grant.room).toBe("clase-ses-1");
    expect(d.grant.roomJoin).toBe(true);
    expect(d.grant.canSubscribe).toBe(true);
  });

  it("el alumno puede publicar micrófono y cámara", () => {
    const d = decideRoomAccess(input());
    if (!d.allowed) throw new Error("debía permitir");
    expect(d.grant.canPublish).toBe(true);
  });

  it("el alumno NO puede moderar", () => {
    const d = decideRoomAccess(input());
    if (!d.allowed) throw new Error("debía permitir");
    // Con roomAdmin podría silenciar o expulsar a sus compañeros.
    expect(d.grant.roomAdmin).toBeUndefined();
  });

  it("el staff entra como docente y sí puede moderar", () => {
    const d = decideRoomAccess(input({ hasActiveEnrollment: false, isStaff: true }));
    if (!d.allowed) throw new Error("debía permitir");
    expect(d.role).toBe("teacher");
    expect(d.grant.roomAdmin).toBe(true);
  });

  it("a quien no está matriculado ni es staff se le ofrece la sala de espera", () => {
    const d = decideRoomAccess(input({ hasActiveEnrollment: false }));
    expect(d).toEqual({ allowed: false, reason: "needs_approval" });
  });

  it("rechaza una sesión de otra cohorte que la verificada", () => {
    // Defensa contra un llamador que valide el acceso en una cohorte y pase la
    // sesión de otra.
    const d = decideRoomAccess({ ...input(), cohortId: "otra-cohorte" });
    expect(d).toEqual({ allowed: false, reason: "wrong_cohort" });
  });

  it("la cohorte se chequea incluso para el staff", () => {
    const d = decideRoomAccess({
      ...input({ isStaff: true, hasActiveEnrollment: false }),
      cohortId: "otra-cohorte",
    });
    expect(d.allowed).toBe(false);
  });

  it("una clase grabada no tiene sala en vivo", () => {
    const d = decideRoomAccess(input({ session: session({ modality: "recorded" }) }));
    expect(d).toEqual({ allowed: false, reason: "not_live" });
  });

  it("una modalidad desconocida o vacía tampoco abre sala", () => {
    expect(decideRoomAccess(input({ session: session({ modality: null }) })).allowed).toBe(false);
    expect(decideRoomAccess(input({ session: session({ modality: "otra" }) })).allowed).toBe(false);
  });

  it("acepta la presencial, que también puede tener parte online", () => {
    const d = decideRoomAccess(input({ session: session({ modality: "live_in_person" }) }));
    expect(d.allowed).toBe(true);
  });

  it("rechaza al alumno mucho antes de la clase", () => {
    const d = decideRoomAccess(input({ now: new Date("2026-08-06T10:00:00Z") }));
    expect(d).toEqual({ allowed: false, reason: "outside_window" });
  });

  it("rechaza al alumno mucho después de la clase", () => {
    const d = decideRoomAccess(input({ now: new Date("2026-08-07T10:00:00Z") }));
    expect(d).toEqual({ allowed: false, reason: "outside_window" });
  });

  it("el staff entra fuera de la ventana, para preparar y para cerrar", () => {
    const antes = decideRoomAccess(
      input({ isStaff: true, hasActiveEnrollment: false, now: new Date("2026-08-06T09:00:00Z") }),
    );
    const despues = decideRoomAccess(
      input({ isStaff: true, hasActiveEnrollment: false, now: new Date("2026-08-08T09:00:00Z") }),
    );
    expect(antes.allowed).toBe(true);
    expect(despues.allowed).toBe(true);
  });

  it("fuera de la ventana pesa más que la falta de matrícula", () => {
    // Pedir entrar a una clase que no está ocurriendo no tiene sentido: el
    // motivo correcto ahí es el horario, no el permiso.
    const d = decideRoomAccess(
      input({ hasActiveEnrollment: false, now: new Date("2026-08-06T10:00:00Z") }),
    );
    expect(d).toEqual({ allowed: false, reason: "outside_window" });
  });
});

// ===========================================================================
describe("sala de espera (0091)", () => {
  const invitado = (solicitud?: "pending" | "approved" | "denied" | null) =>
    decideRoomAccess(input({ hasActiveEnrollment: false, isStaff: false, solicitud }));

  it("sin matrícula ni solicitud, se le ofrece pedir entrar", () => {
    expect(invitado()).toEqual({ allowed: false, reason: "needs_approval" });
    expect(invitado(null)).toEqual({ allowed: false, reason: "needs_approval" });
  });

  it("con solicitud pendiente, espera", () => {
    expect(invitado("pending")).toEqual({ allowed: false, reason: "awaiting_approval" });
  });

  it("rechazado, se le dice que lo rechazaron", () => {
    // Distinguir los tres momentos importa: a la persona hay que decirle cosas
    // distintas en cada uno.
    expect(invitado("denied")).toEqual({ allowed: false, reason: "denied" });
  });

  it("aprobado, entra como ALUMNO y nunca como docente", () => {
    const d = invitado("approved");
    expect(d.allowed).toBe(true);
    if (!d.allowed) return;
    expect(d.role).toBe("student");
    // Un invitado con roomAdmin podría silenciar o sacar a los alumnos de casa.
    expect(d.grant.roomAdmin).toBeUndefined();
    expect(d.grant.room).toBe("clase-ses-1");
  });

  it("el invitado aprobado SIGUE atado a la ventana de la sala", () => {
    // Aprobar no es una llave permanente: si la clase terminó hace horas, no
    // entra, igual que cualquier alumno.
    const d = decideRoomAccess(
      input({
        hasActiveEnrollment: false,
        isStaff: false,
        solicitud: "approved",
        now: new Date("2026-08-07T10:00:00Z"),
      }),
    );
    expect(d).toEqual({ allowed: false, reason: "outside_window" });
  });

  it("quien SÍ tiene matrícula no pasa por la espera aunque tenga solicitud", () => {
    const d = decideRoomAccess(input({ hasActiveEnrollment: true, solicitud: "denied" }));
    expect(d.allowed).toBe(true);
  });

  it("el staff tampoco pasa por la espera", () => {
    const d = decideRoomAccess(
      input({ hasActiveEnrollment: false, isStaff: true, solicitud: "pending" }),
    );
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.role).toBe("teacher");
  });
});
