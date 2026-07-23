import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

const FAKE_USER = { id: "u-11111111-1111-1111-1111-111111111111" };
const ID_1 = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const ID_2 = "a2b2c3d4-e5f6-7890-abcd-ef1234567890";
const THREAD_ID = "b1b2c3d4-e5f6-7890-abcd-ef1234567890";
const THREAD_ID_2 = "b2b2c3d4-e5f6-7890-abcd-ef1234567890";
const LESSON_ID = "c1b2c3d4-e5f6-7890-abcd-ef1234567890";
const LESSON_ID_2 = "c2b2c3d4-e5f6-7890-abcd-ef1234567890";
const ACTOR_ID = "d1b2c3d4-e5f6-7890-abcd-ef1234567890";
const ACTOR_ID_UNKNOWN = "d2b2c3d4-e5f6-7890-abcd-ef1234567890";

function makeRequest(method: string, body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request("http://localhost/api/classroom/conversaciones/notifications", init);
}

function makeRawRequest(method: string, rawBody: string) {
  return new Request("http://localhost/api/classroom/conversaciones/notifications", {
    method,
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

// ── Estado mutable de los mocks ──────────────────────────────
// Captura los argumentos de `.in()` / `.is()` / `.eq()` de la mutación POST y
// alimenta las respuestas de las 3 tablas consultadas por GET
// (conversation_notifications x2, conversation_threads, lessons).

const mockState = {
  user: FAKE_USER as { id: string } | null,
  inArgs: null as [string, unknown[]] | null,
  isArgs: null as [string, unknown] | null,
  eqArgs: null as [string, unknown] | null,
  updateError: null as unknown,
  notificationRows: [] as unknown[],
  unreadCount: 0 as number | null,
  threads: [] as Array<{ id: string; title: string }>,
  lessons: [] as Array<{ id: string; title: string }>,
  threadsQueried: false,
  lessonsQueried: false,
};

type SelectOpts = { count?: string; head?: boolean } | undefined;

function createQueryBuilder(table: string) {
  const session: { isUpdate: boolean; selectOpts: SelectOpts } = {
    isUpdate: false,
    selectOpts: undefined,
  };

  const resolve = (): unknown => {
    if (session.isUpdate) {
      return { error: mockState.updateError };
    }
    if (table === "conversation_notifications") {
      if (session.selectOpts?.count) {
        return { count: mockState.unreadCount };
      }
      return { data: mockState.notificationRows };
    }
    if (table === "conversation_threads") {
      mockState.threadsQueried = true;
      return { data: mockState.threads };
    }
    if (table === "lessons") {
      mockState.lessonsQueried = true;
      return { data: mockState.lessons };
    }
    return { data: null };
  };

  const make = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            return (res: (v: unknown) => void) => res(resolve());
          }
          if (prop === "select") {
            return (_arg: unknown, opts?: SelectOpts) => {
              session.selectOpts = opts;
              return make();
            };
          }
          if (prop === "update") {
            return (_payload: unknown) => {
              session.isUpdate = true;
              return make();
            };
          }
          if (prop === "in") {
            return (col: string, vals: unknown[]) => {
              mockState.inArgs = [col, vals];
              return make();
            };
          }
          if (prop === "is") {
            return (col: string, val: unknown) => {
              mockState.isArgs = [col, val];
              return make();
            };
          }
          if (prop === "eq") {
            return (col: string, val: unknown) => {
              mockState.eqArgs = [col, val];
              return make();
            };
          }
          if (["order", "limit"].includes(prop)) {
            return (..._args: unknown[]) => make();
          }
          return undefined;
        },
      },
    );
  return make();
}

// ── Module mocks (hoisted by vitest) ─────────────────────────

const mockGetPublicAuthorsMap = vi.fn(async (..._args: unknown[]) => new Map());

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockState.user } }),
    },
    from: (table: string) => createQueryBuilder(table),
  })),
}));

vi.mock("@/lib/profiles/public-authors", () => ({
  getPublicAuthorsMap: (...args: unknown[]) => mockGetPublicAuthorsMap(...args),
}));

// ── Import handlers (AFTER mocks) ────────────────────────────

const { GET, POST } = await import("@/app/api/classroom/conversaciones/notifications/route");

// ── Reset state before each test ─────────────────────────────

beforeEach(() => {
  mockState.user = FAKE_USER;
  mockState.inArgs = null;
  mockState.isArgs = null;
  mockState.eqArgs = null;
  mockState.updateError = null;
  mockState.notificationRows = [];
  mockState.unreadCount = 0;
  mockState.threads = [];
  mockState.lessons = [];
  mockState.threadsQueried = false;
  mockState.lessonsQueried = false;
  mockGetPublicAuthorsMap.mockReset();
  mockGetPublicAuthorsMap.mockResolvedValue(new Map());
});

// ── GET ──────────────────────────────────────────────────────

describe("GET /api/classroom/conversaciones/notifications", () => {
  it("responde 401 si no hay usuario autenticado", async () => {
    mockState.user = null;
    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("No autenticado");
  });

  it("responde 200 con lista vacía y unread 0 cuando no hay filas", async () => {
    mockState.notificationRows = [];
    mockState.unreadCount = 0;
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notifications).toEqual([]);
    expect(json.unread).toBe(0);
    // Sin thread_id ni lesson_id en ninguna fila, no debe consultar esas tablas.
    expect(mockState.threadsQueried).toBe(false);
    expect(mockState.lessonsQueried).toBe(false);
  });

  it("usa unread: 0 cuando el conteo viene null", async () => {
    mockState.unreadCount = null;
    const res = await GET();
    const json = await res.json();
    expect(json.unread).toBe(0);
  });

  it("arma href/title para notificación de hilo, resuelve autor y read=false", async () => {
    mockState.notificationRows = [
      {
        id: "n1",
        type: "reply",
        actor_id: ACTOR_ID,
        thread_id: THREAD_ID,
        lesson_id: null,
        read_at: null,
        created_at: "2026-07-20T00:00:00.000Z",
      },
    ];
    mockState.threads = [{ id: THREAD_ID, title: "Título del hilo" }];
    mockGetPublicAuthorsMap.mockResolvedValueOnce(
      new Map([[ACTOR_ID, { id: ACTOR_ID, full_name: "Juan Pérez", avatar_url: null, is_staff: false }]]),
    );

    const res = await GET();
    const json = await res.json();
    expect(json.notifications).toEqual([
      {
        id: "n1",
        type: "reply",
        actorName: "Juan Pérez",
        title: "Título del hilo",
        href: `/classroom/go/thread/${THREAD_ID}`,
        read: false,
        createdAt: "2026-07-20T00:00:00.000Z",
      },
    ]);
    expect(mockState.threadsQueried).toBe(true);
    expect(mockState.lessonsQueried).toBe(false);
  });

  it("arma href/title para notificación de lección y read=true cuando read_at no es null", async () => {
    mockState.notificationRows = [
      {
        id: "n2",
        type: "class_comment",
        actor_id: ACTOR_ID,
        thread_id: null,
        lesson_id: LESSON_ID,
        read_at: "2026-07-21T00:00:00.000Z",
        created_at: "2026-07-20T00:00:00.000Z",
      },
    ];
    mockState.lessons = [{ id: LESSON_ID, title: "Lección 1" }];
    mockGetPublicAuthorsMap.mockResolvedValueOnce(
      new Map([[ACTOR_ID, { id: ACTOR_ID, full_name: "Ana", avatar_url: null, is_staff: false }]]),
    );

    const res = await GET();
    const json = await res.json();
    expect(json.notifications[0]).toEqual({
      id: "n2",
      type: "class_comment",
      actorName: "Ana",
      title: "Lección 1",
      href: `/classroom/go/lesson/${LESSON_ID}`,
      read: true,
      createdAt: "2026-07-20T00:00:00.000Z",
    });
    expect(mockState.lessonsQueried).toBe(true);
    expect(mockState.threadsQueried).toBe(false);
  });

  it("href y title son null cuando la notificación no tiene thread_id ni lesson_id", async () => {
    mockState.notificationRows = [
      {
        id: "n3",
        type: "system",
        actor_id: null,
        thread_id: null,
        lesson_id: null,
        read_at: null,
        created_at: "2026-07-20T00:00:00.000Z",
      },
    ];

    const res = await GET();
    const json = await res.json();
    expect(json.notifications[0].href).toBeNull();
    expect(json.notifications[0].title).toBeNull();
    // actor_id null -> fallback "Usuario" sin consultar el mapa de autores por ese id.
    expect(json.notifications[0].actorName).toBe("Usuario");
  });

  it("usa 'Usuario' cuando actor_id existe pero no está en el mapa de autores", async () => {
    mockState.notificationRows = [
      {
        id: "n4",
        type: "reply",
        actor_id: ACTOR_ID_UNKNOWN,
        thread_id: null,
        lesson_id: null,
        read_at: null,
        created_at: "2026-07-20T00:00:00.000Z",
      },
    ];
    mockGetPublicAuthorsMap.mockResolvedValueOnce(new Map());

    const res = await GET();
    const json = await res.json();
    expect(json.notifications[0].actorName).toBe("Usuario");
  });

  it("title queda null si el thread_id no aparece en la tabla de hilos (borrado/inaccesible)", async () => {
    mockState.notificationRows = [
      {
        id: "n5",
        type: "reply",
        actor_id: null,
        thread_id: THREAD_ID,
        lesson_id: null,
        read_at: null,
        created_at: "2026-07-20T00:00:00.000Z",
      },
    ];
    mockState.threads = []; // no matchea THREAD_ID

    const res = await GET();
    const json = await res.json();
    expect(json.notifications[0].href).toBe(`/classroom/go/thread/${THREAD_ID}`);
    expect(json.notifications[0].title).toBeNull();
  });

  it("title queda null si el lesson_id no aparece en la tabla de lecciones", async () => {
    mockState.notificationRows = [
      {
        id: "n6",
        type: "class_comment",
        actor_id: null,
        thread_id: null,
        lesson_id: LESSON_ID,
        read_at: null,
        created_at: "2026-07-20T00:00:00.000Z",
      },
    ];
    mockState.lessons = []; // no matchea LESSON_ID

    const res = await GET();
    const json = await res.json();
    expect(json.notifications[0].href).toBe(`/classroom/go/lesson/${LESSON_ID}`);
    expect(json.notifications[0].title).toBeNull();
  });

  it("deduplica thread_id/lesson_id repetidos antes de consultar y resuelve varias filas", async () => {
    mockState.notificationRows = [
      {
        id: "n7",
        type: "reply",
        actor_id: ACTOR_ID,
        thread_id: THREAD_ID,
        lesson_id: null,
        read_at: null,
        created_at: "2026-07-20T00:00:00.000Z",
      },
      {
        id: "n8",
        type: "reply",
        actor_id: ACTOR_ID,
        thread_id: THREAD_ID,
        lesson_id: null,
        read_at: null,
        created_at: "2026-07-19T00:00:00.000Z",
      },
      {
        id: "n9",
        type: "class_comment",
        actor_id: ACTOR_ID,
        thread_id: null,
        lesson_id: LESSON_ID_2,
        read_at: null,
        created_at: "2026-07-18T00:00:00.000Z",
      },
    ];
    mockState.threads = [{ id: THREAD_ID, title: "Hilo repetido" }];
    mockState.lessons = [{ id: LESSON_ID_2, title: "Otra lección" }];
    mockState.unreadCount = 3;

    const res = await GET();
    const json = await res.json();
    expect(json.notifications).toHaveLength(3);
    expect(json.notifications[0].title).toBe("Hilo repetido");
    expect(json.notifications[1].title).toBe("Hilo repetido");
    expect(json.notifications[2].title).toBe("Otra lección");
    expect(json.unread).toBe(3);
  });
});

// ── POST ─────────────────────────────────────────────────────

describe("POST /api/classroom/conversaciones/notifications", () => {
  it("responde 401 si no hay usuario autenticado", async () => {
    mockState.user = null;
    const res = await POST(makeRequest("POST", { id: ID_1 }));
    expect(res.status).toBe(401);
  });

  it("responde 400 si el body no es JSON válido", async () => {
    const res = await POST(makeRawRequest("POST", "{esto no es json"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Body invalido");
  });

  it("responde 422 si el body no matchea ninguna variante del schema", async () => {
    const res = await POST(makeRequest("POST", { foo: "bar" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.issues).toBeDefined();
  });

  it("responde 422 si id no tiene formato UUID", async () => {
    const res = await POST(makeRequest("POST", { id: "no-es-un-uuid" }));
    expect(res.status).toBe(422);
  });

  it("responde 422 si ids es un arreglo vacío", async () => {
    const res = await POST(makeRequest("POST", { ids: [] }));
    expect(res.status).toBe(422);
  });

  it("responde 422 si ids supera 100 elementos", async () => {
    const ids = Array.from({ length: 101 }, () => ID_1);
    const res = await POST(makeRequest("POST", { ids }));
    expect(res.status).toBe(422);
  });

  it("marca leída solo la notificación de { id } vía .eq()", async () => {
    const res = await POST(makeRequest("POST", { id: ID_1 }));
    expect(res.status).toBe(200);
    expect(mockState.eqArgs).toEqual(["id", ID_1]);
    expect(mockState.inArgs).toBeNull();
    expect(mockState.isArgs).toBeNull();
  });

  it("marca leídas solo las notificaciones de { ids } (no todas)", async () => {
    const res = await POST(makeRequest("POST", { ids: [ID_1, ID_2] }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);

    // Rama `ids`: usa `.in("id", ids)`, no `.is("read_at", null)` (rama `all`)
    // ni `.eq("id", id)` (rama de una sola).
    expect(mockState.inArgs).toEqual(["id", [ID_1, ID_2]]);
    expect(mockState.isArgs).toBeNull();
    expect(mockState.eqArgs).toBeNull();
  });

  it("marca leídas todas las no-leídas con { all: true } vía .is()", async () => {
    const res = await POST(makeRequest("POST", { all: true }));
    expect(res.status).toBe(200);
    expect(mockState.isArgs).toEqual(["read_at", null]);
    expect(mockState.inArgs).toBeNull();
    expect(mockState.eqArgs).toBeNull();
  });

  it("responde 500 si la actualización falla en la base de datos", async () => {
    mockState.updateError = { message: "db down" };
    const res = await POST(makeRequest("POST", { id: ID_1 }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Error al marcar como leídas");
  });
});
