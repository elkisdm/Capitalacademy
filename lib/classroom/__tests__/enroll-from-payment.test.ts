import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
const mockGenerateLink = vi.fn();
const mockSendDiplomadoInvitationEmail = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
    auth: { admin: { generateLink: (...args: unknown[]) => mockGenerateLink(...args) } },
  })),
}));

vi.mock("@/lib/email/diplomado-invitation", () => ({
  sendDiplomadoInvitationEmail: (...args: unknown[]) =>
    mockSendDiplomadoInvitationEmail(...args),
}));

vi.mock("@/lib/email/invitation", () => ({
  sendInvitationEmail: vi.fn(async () => ({ success: true })),
}));

const { enrollBuyer } = await import("@/lib/classroom/enroll-from-payment");

const EXISTING_USER_ID = "user-admin-1";

type ProfileRow = { id: string; email: string; full_name: string; role: string };

/**
 * Mini simulación del comportamiento real de Postgres para
 * `upsert(..., { onConflict: "id", ignoreDuplicates: true })`:
 * INSERT ... ON CONFLICT (id) DO NOTHING. Si el id ya existe, la fila
 * NO se toca (ninguna columna, incluido `role`); si no existe, se inserta tal
 * cual. Esto permite verificar el efecto real del fix, no solo los
 * argumentos con los que se llamó al upsert.
 */
function makeFromMock(profilesTable: Map<string, ProfileRow>) {
  return (table: string) => {
    if (table === "cohorts") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: "cohort-1", name: "G4" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        upsert: (row: ProfileRow, options: { ignoreDuplicates?: boolean }) => {
          const exists = profilesTable.has(row.id);
          if (!(exists && options?.ignoreDuplicates)) {
            profilesTable.set(row.id, row);
          }
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === "enrollments") {
      return {
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    if (table === "invitation_log") {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    throw new Error(`tabla no mockeada: ${table}`);
  };
}

describe("enrollBuyer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateLink.mockResolvedValue({
      data: {
        properties: { hashed_token: "hashed-token", verification_type: "invite" },
        user: { id: EXISTING_USER_ID },
      },
      error: null,
    });
    mockSendDiplomadoInvitationEmail.mockResolvedValue({ success: true });
  });

  it("un perfil existente con rol admin conserva su rol y su full_name al comprar de nuevo", async () => {
    const profilesTable = new Map<string, ProfileRow>([
      [
        EXISTING_USER_ID,
        {
          id: EXISTING_USER_ID,
          email: "admin@test.com",
          full_name: "Admin Real",
          role: "admin",
        },
      ],
    ]);
    mockFrom.mockImplementation(makeFromMock(profilesTable));

    const result = await enrollBuyer({
      email: "admin@test.com",
      firstname: "Nombre",
      lastname: "Del Checkout",
      plan: "contado",
    });

    expect(result.ok).toBe(true);
    const profileAfter = profilesTable.get(EXISTING_USER_ID);
    expect(profileAfter?.role).toBe("admin");
    expect(profileAfter?.full_name).toBe("Admin Real");
  });

  it("un comprador nuevo sí obtiene un perfil con role student", async () => {
    const profilesTable = new Map<string, ProfileRow>();
    mockFrom.mockImplementation(makeFromMock(profilesTable));

    const result = await enrollBuyer({
      email: "nuevo@test.com",
      firstname: "Nombre",
      lastname: "Nuevo",
      plan: "contado",
    });

    expect(result.ok).toBe(true);
    const profileAfter = profilesTable.get(EXISTING_USER_ID);
    expect(profileAfter?.role).toBe("student");
    expect(profileAfter?.full_name).toBe("Nombre Nuevo");
  });
});
