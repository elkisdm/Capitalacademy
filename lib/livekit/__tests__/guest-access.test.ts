import { describe, it, expect } from "vitest";
import {
  decideGuestAccess,
  sanitizeGuestName,
  guestIdentity,
  guestDisplayName,
  GUEST_SUFFIX,
  type GuestAccessInput,
} from "../guest-access";
import { roomNameForSession, type RoomSession } from "../access";

/**
 * Frontera de acceso de quien NO tiene cuenta (0099). Es la superficie más
 * expuesta del producto: cualquiera con el enlace llega hasta acá.
 */

function session(overrides: Partial<RoomSession> = {}): RoomSession {
  return {
    id: "ses-1",
    cohort_id: "cohorte-1",
    starts_at: "2026-08-18T15:00:00Z",
    ends_at: "2026-08-18T17:00:00Z",
    modality: "live_online",
    ...overrides,
  };
}

/** Invitado aprobado, en plena clase, salvo que el test diga otra cosa. */
function input(overrides: Partial<GuestAccessInput> = {}): GuestAccessInput {
  return {
    session: session(),
    guestAccess: true,
    guest: { id: "inv-1", display_name: "Diego", status: "approved" },
    now: new Date("2026-08-18T15:30:00Z"),
    ...overrides,
  };
}

describe("sanitizeGuestName", () => {
  it("acepta un nombre corriente y lo deja tal cual", () => {
    expect(sanitizeGuestName("Diego de La Prida")).toBe("Diego de La Prida");
  });

  it("colapsa los espacios y recorta los extremos", () => {
    expect(sanitizeGuestName("  Diego    Pérez  ")).toBe("Diego Pérez");
  });

  it("rechaza lo demasiado corto y lo demasiado largo", () => {
    expect(sanitizeGuestName("D")).toBeNull();
    expect(sanitizeGuestName("x".repeat(41))).toBeNull();
    expect(sanitizeGuestName("   ")).toBeNull();
  });

  it("rechaza lo que no es texto", () => {
    expect(sanitizeGuestName(null)).toBeNull();
    expect(sanitizeGuestName(undefined)).toBeNull();
    expect(sanitizeGuestName(42 as unknown as string)).toBeNull();
  });

  it("quita caracteres invisibles con los que se maquilla un nombre", () => {
    // Espacio de ancho cero en medio y marca bidi al inicio: a la vista, "Paola".
    expect(sanitizeGuestName("‮Pa​ola")).toBe("Paola");
  });

  it("no deja pasar un nombre que SOLO tiene caracteres invisibles", () => {
    expect(sanitizeGuestName("​​​")).toBeNull();
  });
});

describe("identidad y nombre visible", () => {
  it("prefija la identidad para que no colisione con la de un usuario real", () => {
    expect(guestIdentity("inv-1")).toBe("guest-inv-1");
  });

  it("marca SIEMPRE el nombre visible como invitado", () => {
    expect(guestDisplayName("Diego")).toBe(`Diego${GUEST_SUFFIX}`);
  });
});

describe("decideGuestAccess", () => {
  it("deja entrar al invitado aprobado, dentro de la ventana", () => {
    const d = decideGuestAccess(input());
    expect(d.allowed).toBe(true);
    if (!d.allowed) return;
    expect(d.grant.room).toBe(roomNameForSession("ses-1"));
    expect(d.identity).toBe("guest-inv-1");
    expect(d.name).toBe("Diego (invitado)");
  });

  it("le da micrófono, cámara y chat — pero NUNCA moderación", () => {
    const d = decideGuestAccess(input());
    expect(d.allowed).toBe(true);
    if (!d.allowed) return;
    expect(d.grant.canPublish).toBe(true);
    expect(d.grant.canSubscribe).toBe(true);
    expect(d.grant.canPublishData).toBe(true);
    expect(d.grant.roomAdmin).toBeUndefined();
    expect(d.grant.roomCreate).toBeUndefined();
    expect(d.grant.roomRecord).toBeUndefined();
  });

  it("niega si la sala no admite invitados, aunque esté aprobado", () => {
    // El caso del enlace filtrado a una clase real: el flag es la defensa.
    const d = decideGuestAccess(input({ guestAccess: false }));
    expect(d).toEqual({ allowed: false, reason: "guests_not_allowed" });
  });

  it("niega si la clase no es en vivo", () => {
    const d = decideGuestAccess(input({ session: session({ modality: "recorded" }) }));
    expect(d).toEqual({ allowed: false, reason: "not_live" });
  });

  it("niega antes de que la sala abra y después de que cierre", () => {
    // Abre 30 min antes: 14:29 todavía no.
    expect(decideGuestAccess(input({ now: new Date("2026-08-18T14:29:00Z") }))).toEqual({
      allowed: false,
      reason: "outside_window",
    });
    // Cierra 120 min después del fin: 19:01 ya no.
    expect(decideGuestAccess(input({ now: new Date("2026-08-18T19:01:00Z") }))).toEqual({
      allowed: false,
      reason: "outside_window",
    });
  });

  it("deja entrar en los bordes exactos de la ventana", () => {
    expect(decideGuestAccess(input({ now: new Date("2026-08-18T14:30:00Z") })).allowed).toBe(
      true,
    );
    expect(decideGuestAccess(input({ now: new Date("2026-08-18T19:00:00Z") })).allowed).toBe(
      true,
    );
  });

  it("no emite token mientras el docente no decide", () => {
    const d = decideGuestAccess(
      input({ guest: { id: "inv-1", display_name: "Diego", status: "pending" } }),
    );
    expect(d).toEqual({ allowed: false, reason: "awaiting_approval" });
  });

  it("mantiene fuera a quien fue rechazado", () => {
    const d = decideGuestAccess(
      input({ guest: { id: "inv-1", display_name: "Diego", status: "denied" } }),
    );
    expect(d).toEqual({ allowed: false, reason: "denied" });
  });

  it("niega a quien no tiene solicitud (sin cookie o cookie de otra clase)", () => {
    const d = decideGuestAccess(input({ guest: null }));
    expect(d).toEqual({ allowed: false, reason: "no_request" });
  });

  it("evalúa la sala y el horario ANTES que el estado de la solicitud", () => {
    // Un aprobado de una clase que ya cerró no entra: el motivo correcto es el
    // horario, no su permiso.
    const d = decideGuestAccess(input({ now: new Date("2026-08-19T00:00:00Z") }));
    expect(d).toEqual({ allowed: false, reason: "outside_window" });
  });
});
