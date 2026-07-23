import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks de los bordes externos -------------------------------------------
//
// `notifyLessonComment` habla con tres cosas fuera de sí mismo: el cliente
// admin de Supabase (tablas `lesson_comments`, `conversation_notifications`,
// `profiles`), `getProgramStaffIds` y `sendConversacionNotificationEmail`.
// Se mockean los tres bordes; el módulo bajo prueba corre real.

const mockGetProgramStaffIds = vi.fn();
const mockSendConversacionNotificationEmail = vi.fn();

vi.mock("@/lib/profiles/program-staff", () => ({
  getProgramStaffIds: (...args: unknown[]) => mockGetProgramStaffIds(...args),
}));

vi.mock("@/lib/email/conversacion-notification", () => ({
  sendConversacionNotificationEmail: (...args: unknown[]) =>
    mockSendConversacionNotificationEmail(...args),
}));

interface AdminConfig {
  /** Resultado de `lesson_comments.select("author_id").eq("id", parentId).maybeSingle()`. */
  parentComment?: { data: unknown; error?: unknown };
  /**
   * Cola de `count` para cada chequeo de cooldown, en el mismo orden en que
   * `notifyLessonComment` arma el array `recipients` (reply primero, luego
   * staff en el orden de iteración del Set).
   */
  cooldownCounts?: Array<number | undefined | null>;
  /** Resultado de `profiles.select(...).in("id", ids)`. */
  profilesResult?: { data: unknown; error?: unknown };
}

let adminConfig: AdminConfig;
let insertCalls: unknown[][];
let cooldownFilterCalls: unknown[][];
let profilesInCalls: unknown[][];
let lessonCommentsCallCount: number;

function makeAdmin() {
  return {
    from(table: string) {
      if (table === "lesson_comments") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => {
                lessonCommentsCallCount++;
                return Promise.resolve(
                  adminConfig.parentComment ?? { data: null, error: null },
                );
              },
            }),
          }),
        };
      }
      if (table === "conversation_notifications") {
        return {
          select: () => {
            const filters: unknown[] = [];
            const chain = {
              eq: (...args: unknown[]) => {
                filters.push(["eq", ...args]);
                return chain;
              },
              gte: (...args: unknown[]) => {
                filters.push(["gte", ...args]);
                cooldownFilterCalls.push(filters);
                const idx = cooldownFilterCalls.length - 1;
                const count = (adminConfig.cooldownCounts ?? [])[idx];
                return Promise.resolve({ count: count ?? null, error: null });
              },
            };
            return chain;
          },
          insert: (rows: unknown[]) => {
            insertCalls.push(rows);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            in: (_col: string, ids: unknown[]) => {
              profilesInCalls.push(ids);
              return Promise.resolve(
                adminConfig.profilesResult ?? { data: [], error: null },
              );
            },
          }),
        };
      }
      throw new Error(`tabla no mockeada en el test: ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => makeAdmin(),
}));

const { notifyLessonComment } = await import("@/lib/notifications/lesson-comment");

function baseParams(overrides: Partial<Parameters<typeof notifyLessonComment>[0]> = {}) {
  return {
    lessonId: "lesson-1",
    lessonTitle: "Clase 1: Introducción",
    commentId: "comment-1",
    parentId: null,
    actorId: "actor-1",
    actorName: "Actor Uno",
    programId: "prog-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  adminConfig = {};
  insertCalls = [];
  cooldownFilterCalls = [];
  profilesInCalls = [];
  lessonCommentsCallCount = 0;
  mockGetProgramStaffIds.mockResolvedValue(new Set());
  mockSendConversacionNotificationEmail.mockResolvedValue({ success: true });
});

describe("notifyLessonComment — armado de destinatarios", () => {
  it("sin parentId: no consulta lesson_comments y notifica solo al staff, excluyendo al actor", async () => {
    mockGetProgramStaffIds.mockResolvedValue(new Set(["staff-1", "staff-2", "actor-1"]));
    adminConfig.profilesResult = {
      data: [
        { id: "staff-1", full_name: "Staff Uno", email: "s1@test.cl" },
        { id: "staff-2", full_name: "Staff Dos", email: "s2@test.cl" },
      ],
      error: null,
    };

    await notifyLessonComment(baseParams({ parentId: null }));

    expect(lessonCommentsCallCount).toBe(0);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toEqual([
      { user_id: "staff-1", actor_id: "actor-1", type: "lesson_comment_new", lesson_id: "lesson-1", lesson_comment_id: "comment-1" },
      { user_id: "staff-2", actor_id: "actor-1", type: "lesson_comment_new", lesson_id: "lesson-1", lesson_comment_id: "comment-1" },
    ]);
    expect(mockSendConversacionNotificationEmail).toHaveBeenCalledTimes(2);
  });

  it("con parentId cuyo autor difiere del actor: agrega destinatario lesson_reply y lo excluye del loop de staff (dedupe)", async () => {
    adminConfig.parentComment = { data: { author_id: "parent-author" }, error: null };
    mockGetProgramStaffIds.mockResolvedValue(new Set(["parent-author", "staff-2"]));
    adminConfig.profilesResult = {
      data: [
        { id: "parent-author", full_name: "Autor Padre", email: "pa@test.cl" },
        { id: "staff-2", full_name: "Staff Dos", email: "s2@test.cl" },
      ],
      error: null,
    };

    await notifyLessonComment(baseParams({ parentId: "parent-comment-1" }));

    expect(lessonCommentsCallCount).toBe(1);
    expect(insertCalls[0]).toEqual([
      { user_id: "parent-author", actor_id: "actor-1", type: "lesson_reply", lesson_id: "lesson-1", lesson_comment_id: "comment-1" },
      { user_id: "staff-2", actor_id: "actor-1", type: "lesson_comment_new", lesson_id: "lesson-1", lesson_comment_id: "comment-1" },
    ]);
  });

  it("con parentId cuyo autor es el propio actor (auto-respuesta): no genera lesson_reply", async () => {
    adminConfig.parentComment = { data: { author_id: "actor-1" }, error: null };
    mockGetProgramStaffIds.mockResolvedValue(new Set());

    await notifyLessonComment(baseParams({ parentId: "parent-comment-1", actorId: "actor-1" }));

    // Sin staff y sin reply recipient -> recipients vacío -> retorno temprano.
    expect(insertCalls).toHaveLength(0);
    expect(cooldownFilterCalls).toHaveLength(0);
    expect(mockSendConversacionNotificationEmail).not.toHaveBeenCalled();
  });

  it("con parentId cuyo comentario padre no existe (borrado): no genera lesson_reply pero sigue con el staff", async () => {
    adminConfig.parentComment = { data: null, error: null };
    mockGetProgramStaffIds.mockResolvedValue(new Set(["staff-3"]));
    adminConfig.profilesResult = {
      data: [{ id: "staff-3", full_name: "Staff Tres", email: "s3@test.cl" }],
      error: null,
    };

    await notifyLessonComment(baseParams({ parentId: "parent-comment-missing" }));

    expect(insertCalls[0]).toEqual([
      { user_id: "staff-3", actor_id: "actor-1", type: "lesson_comment_new", lesson_id: "lesson-1", lesson_comment_id: "comment-1" },
    ]);
  });

  it("recipients vacíos (sin parentId y sin staff): retorna temprano sin tocar conversation_notifications ni profiles", async () => {
    mockGetProgramStaffIds.mockResolvedValue(new Set());

    await notifyLessonComment(baseParams({ parentId: null }));

    expect(insertCalls).toHaveLength(0);
    expect(profilesInCalls).toHaveLength(0);
    expect(mockSendConversacionNotificationEmail).not.toHaveBeenCalled();
  });
});

describe("notifyLessonComment — cooldown de correo por (usuario, tipo, lección)", () => {
  it("destinatario con notificación previa en la última hora: recibe la campana pero no el correo", async () => {
    mockGetProgramStaffIds.mockResolvedValue(new Set(["staff-1", "staff-2"]));
    adminConfig.cooldownCounts = [1, 0];
    adminConfig.profilesResult = {
      data: [{ id: "staff-2", full_name: "Staff Dos", email: "s2@test.cl" }],
      error: null,
    };

    await notifyLessonComment(baseParams({ parentId: null }));

    // La campana in-app se inserta para ambos, sin importar el cooldown.
    expect(insertCalls[0]).toHaveLength(2);
    // Pero solo se consulta el perfil / se manda correo al que no está en cooldown.
    expect(profilesInCalls[0]).toEqual(["staff-2"]);
    expect(mockSendConversacionNotificationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendConversacionNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "s2@test.cl" }),
    );
  });

  it("todos los destinatarios dentro de la ventana de cooldown: inserta las notificaciones pero no consulta perfiles ni envía correos", async () => {
    mockGetProgramStaffIds.mockResolvedValue(new Set(["staff-1", "staff-2"]));
    adminConfig.cooldownCounts = [1, 1];

    await notifyLessonComment(baseParams({ parentId: null }));

    expect(insertCalls).toHaveLength(1);
    expect(profilesInCalls).toHaveLength(0);
    expect(mockSendConversacionNotificationEmail).not.toHaveBeenCalled();
  });

  it("count ausente/null en la respuesta del cooldown (p.ej. error de la consulta) se trata como 0 (no en cooldown)", async () => {
    mockGetProgramStaffIds.mockResolvedValue(new Set(["staff-1"]));
    adminConfig.cooldownCounts = [null];
    adminConfig.profilesResult = {
      data: [{ id: "staff-1", full_name: "Staff Uno", email: "s1@test.cl" }],
      error: null,
    };

    await notifyLessonComment(baseParams({ parentId: null }));

    expect(mockSendConversacionNotificationEmail).toHaveBeenCalledTimes(1);
  });

  it("consulta el cooldown filtrando por user_id, type y lesson_id, con gte sobre la última hora", async () => {
    mockGetProgramStaffIds.mockResolvedValue(new Set(["staff-1"]));
    adminConfig.cooldownCounts = [0];
    adminConfig.profilesResult = { data: [], error: null };

    const before = Date.now();
    await notifyLessonComment(baseParams({ parentId: null, lessonId: "lesson-42" }));

    const filters = cooldownFilterCalls[0];
    expect(filters).toContainEqual(["eq", "user_id", "staff-1"]);
    expect(filters).toContainEqual(["eq", "type", "lesson_comment_new"]);
    expect(filters).toContainEqual(["eq", "lesson_id", "lesson-42"]);
    const gteFilter = filters.find((f) => (f as unknown[])[0] === "gte") as [string, string, string];
    expect(gteFilter[1]).toBe("created_at");
    const sinceMs = new Date(gteFilter[2]).getTime();
    // sinceMs debe ser ~1h antes del momento de la llamada (cooldown de 1h).
    expect(before - sinceMs).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000);
    expect(before - sinceMs).toBeLessThanOrEqual(60 * 60 * 1000 + 5000);
  });
});

describe("notifyLessonComment — resolución de perfiles y envío de correo", () => {
  it("destinatario sin perfil (no matchea en profiles): no envía correo pero no interrumpe a los demás", async () => {
    mockGetProgramStaffIds.mockResolvedValue(new Set(["staff-1", "staff-2"]));
    adminConfig.profilesResult = {
      data: [{ id: "staff-2", full_name: "Staff Dos", email: "s2@test.cl" }],
      error: null,
    };

    await notifyLessonComment(baseParams({ parentId: null }));

    expect(mockSendConversacionNotificationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendConversacionNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "s2@test.cl" }),
    );
  });

  it("perfil con email vacío: no envía correo aunque el perfil exista", async () => {
    mockGetProgramStaffIds.mockResolvedValue(new Set(["staff-1"]));
    adminConfig.profilesResult = {
      data: [{ id: "staff-1", full_name: "Staff Uno", email: "" }],
      error: null,
    };

    await notifyLessonComment(baseParams({ parentId: null }));

    expect(mockSendConversacionNotificationEmail).not.toHaveBeenCalled();
  });

  it("perfil sin full_name: usa cadena vacía como recipientName", async () => {
    mockGetProgramStaffIds.mockResolvedValue(new Set(["staff-1"]));
    adminConfig.profilesResult = {
      data: [{ id: "staff-1", full_name: null, email: "s1@test.cl" }],
      error: null,
    };

    await notifyLessonComment(baseParams({ parentId: null }));

    expect(mockSendConversacionNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipientName: "" }),
    );
  });

  it("consulta profiles cuando falla (error): profileMap queda vacío y no se envía ningún correo, sin lanzar", async () => {
    mockGetProgramStaffIds.mockResolvedValue(new Set(["staff-1"]));
    adminConfig.profilesResult = { data: null, error: { message: "timeout" } };

    await expect(notifyLessonComment(baseParams({ parentId: null }))).resolves.toBeUndefined();

    expect(mockSendConversacionNotificationEmail).not.toHaveBeenCalled();
  });

  it("arma el correo con actorName, title=lessonTitle, kind del destinatario y la URL de la lección (BASE_URL por defecto)", async () => {
    mockGetProgramStaffIds.mockResolvedValue(new Set(["staff-1"]));
    adminConfig.profilesResult = {
      data: [{ id: "staff-1", full_name: "Staff Uno", email: "s1@test.cl" }],
      error: null,
    };

    await notifyLessonComment(
      baseParams({
        parentId: null,
        lessonId: "lesson-99",
        lessonTitle: "Clase 9: Cierre",
        actorName: "María Actora",
      }),
    );

    expect(mockSendConversacionNotificationEmail).toHaveBeenCalledWith({
      to: "s1@test.cl",
      recipientName: "Staff Uno",
      actorName: "María Actora",
      title: "Clase 9: Cierre",
      kind: "lesson_comment_new",
      url: "https://capitalacademy.cl/classroom/go/lesson/lesson-99",
    });
  });

  it("un correo que rechaza su promesa no interrumpe el envío al resto (Promise.allSettled)", async () => {
    mockGetProgramStaffIds.mockResolvedValue(new Set(["staff-1", "staff-2"]));
    adminConfig.profilesResult = {
      data: [
        { id: "staff-1", full_name: "Staff Uno", email: "s1@test.cl" },
        { id: "staff-2", full_name: "Staff Dos", email: "s2@test.cl" },
      ],
      error: null,
    };
    mockSendConversacionNotificationEmail
      .mockRejectedValueOnce(new Error("resend caído"))
      .mockResolvedValueOnce({ success: true });

    await expect(notifyLessonComment(baseParams({ parentId: null }))).resolves.toBeUndefined();

    expect(mockSendConversacionNotificationEmail).toHaveBeenCalledTimes(2);
  });

  it("insert de conversation_notifications no lanza aunque falle (best-effort): igual continúa hacia el envío de correo", async () => {
    mockGetProgramStaffIds.mockResolvedValue(new Set(["staff-1"]));
    adminConfig.profilesResult = {
      data: [{ id: "staff-1", full_name: "Staff Uno", email: "s1@test.cl" }],
      error: null,
    };

    await expect(notifyLessonComment(baseParams({ parentId: null }))).resolves.toBeUndefined();

    expect(mockSendConversacionNotificationEmail).toHaveBeenCalledTimes(1);
  });
});
