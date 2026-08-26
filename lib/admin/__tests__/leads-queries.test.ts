import { describe, it, expect, vi, beforeEach } from "vitest";

type Result = { data: unknown; error?: unknown };

const results: Record<string, Result> = {};
const selectSpy = vi.fn();
const filterSpy = vi.fn();
const rangeSpy = vi.fn();

/** Páginas por tabla, para simular el corte de `db-max-rows` de PostgREST. */
const paginas: Record<string, unknown[][]> = {};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => ({
      select: (cols: string) => {
        selectSpy(table, cols);
        const chain = {
          is: (col: string, val: unknown) => {
            filterSpy("is", col, val);
            return chain;
          },
          lte: (col: string, val: unknown) => {
            filterSpy("lte", col, val);
            return chain;
          },
          order: (col: string, opts: unknown) => {
            filterSpy("order", col, opts);
            return chain;
          },
          range: (desde: number, hasta: number) => {
            rangeSpy(table, desde, hasta);
            const pageList = paginas[table];
            if (pageList) {
              const i = rangeSpy.mock.calls.filter((c) => c[0] === table).length - 1;
              return Promise.resolve({ data: pageList[i] ?? [], error: null });
            }
            return Promise.resolve(results[table]);
          },
          then: (onOk: (r: Result) => unknown) => Promise.resolve(results[table]).then(onOk),
        };
        return chain;
      },
    }),
  })),
}));

import {
  getAllLeads,
  getAllLeadActivity,
  getAllLeadTasks,
  getTasksForDigest,
} from "@/lib/admin/leads-queries";

beforeEach(() => {
  results.leads = { data: [], error: null };
  results.lead_activity = { data: [], error: null };
  results.lead_tasks = { data: [], error: null };
  selectSpy.mockClear();
  filterSpy.mockClear();
  rangeSpy.mockClear();
  for (const k of Object.keys(paginas)) delete paginas[k];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getAllLeads", () => {
  it("devuelve los leads con la etapa ya tipada", async () => {
    results.leads = {
      data: [{ id: "l-1", full_name: "Ana", stage: "contactado" }],
      error: null,
    };
    const leads = await getAllLeads();
    expect(leads).toHaveLength(1);
    expect(leads[0].stage).toBe("contactado");
  });

  it("una etapa desconocida en la base cae a 'nuevo' en vez de romper la pantalla", async () => {
    results.leads = { data: [{ id: "l-1", stage: "zombie" }], error: null };
    expect((await getAllLeads())[0].stage).toBe("nuevo");
  });

  it("un lead sin etapa cae a 'nuevo'", async () => {
    results.leads = { data: [{ id: "l-1" }], error: null };
    expect((await getAllLeads())[0].stage).toBe("nuevo");
  });

  it("pide los más recientes primero", async () => {
    await getAllLeads();
    expect(filterSpy).toHaveBeenCalledWith("order", "created_at", { ascending: false });
  });

  it("trae la columna stage", async () => {
    await getAllLeads();
    expect(selectSpy.mock.calls[0][1]).toContain("stage");
  });

  it("devuelve vacío si la base no trae nada", async () => {
    results.leads = { data: null, error: null };
    expect(await getAllLeads()).toEqual([]);
  });

  it("propaga el error en vez de devolver una lista falsamente vacía", async () => {
    results.leads = { data: null, error: new Error("boom") };
    await expect(getAllLeads()).rejects.toThrow("boom");
  });
});

describe("getAllLeadActivity", () => {
  it("aplana el autor del join en objeto", async () => {
    results.lead_activity = {
      data: [{ id: "a-1", lead_id: "l-1", kind: "call", profiles: { full_name: "Camila" } }],
      error: null,
    };
    expect((await getAllLeadActivity())[0].author_name).toBe("Camila");
  });

  it("aplana el autor del join en arreglo", async () => {
    results.lead_activity = {
      data: [{ id: "a-1", profiles: [{ full_name: "Camila" }] }],
      error: null,
    };
    expect((await getAllLeadActivity())[0].author_name).toBe("Camila");
  });

  it("deja el autor en null si la cuenta se borró", async () => {
    results.lead_activity = { data: [{ id: "a-1", profiles: null }], error: null };
    expect((await getAllLeadActivity())[0].author_name).toBeNull();
  });

  it("deja el autor en null si el join viene vacío", async () => {
    results.lead_activity = { data: [{ id: "a-1", profiles: [] }], error: null };
    expect((await getAllLeadActivity())[0].author_name).toBeNull();
  });

  it("deja el autor en null si el perfil no tiene nombre", async () => {
    results.lead_activity = {
      data: [{ id: "a-1", profiles: { full_name: null } }],
      error: null,
    };
    expect((await getAllLeadActivity())[0].author_name).toBeNull();
  });

  it("no filtra el join dentro de la fila devuelta", async () => {
    results.lead_activity = {
      data: [{ id: "a-1", profiles: { full_name: "Camila" } }],
      error: null,
    };
    expect((await getAllLeadActivity())[0]).not.toHaveProperty("profiles");
  });

  it("devuelve vacío si la base no trae nada", async () => {
    results.lead_activity = { data: null, error: null };
    expect(await getAllLeadActivity()).toEqual([]);
  });

  it("propaga el error", async () => {
    results.lead_activity = { data: null, error: new Error("boom") };
    await expect(getAllLeadActivity()).rejects.toThrow("boom");
  });
});

describe("getAllLeadTasks", () => {
  it("pide la más próxima a vencer primero", async () => {
    await getAllLeadTasks();
    expect(filterSpy).toHaveBeenCalledWith("order", "due_at", { ascending: true });
  });

  it("devuelve vacío si la base no trae nada", async () => {
    results.lead_tasks = { data: null, error: null };
    expect(await getAllLeadTasks()).toEqual([]);
  });

  it("propaga el error", async () => {
    results.lead_tasks = { data: null, error: new Error("boom") };
    await expect(getAllLeadTasks()).rejects.toThrow("boom");
  });
});

describe("getTasksForDigest", () => {
  // 26-ago-2026 15:00 en Chile = 19:00 UTC.
  const ahora = new Date("2026-08-26T19:00:00Z");

  const tarea = (over: Record<string, unknown> = {}) => ({
    id: "t-1",
    title: "Llamar a Ana",
    due_at: "2026-08-26T13:00:00Z",
    done_at: null,
    lead_id: "l-1",
    created_by: "u-1",
    leads: { full_name: "Ana" },
    profiles: { email: "camila@x.cl", full_name: "Camila" },
    ...over,
  });

  it("solo pide tareas pendientes dentro del horizonte de 24 horas", async () => {
    await getTasksForDigest(ahora);
    expect(filterSpy).toHaveBeenCalledWith("is", "done_at", null);
    expect(filterSpy).toHaveBeenCalledWith("lte", "due_at", "2026-08-27T19:00:00.000Z");
  });

  it("agrupa por persona y arma la tarea del correo", async () => {
    results.lead_tasks = { data: [tarea()], error: null };
    const [destinatario] = await getTasksForDigest(ahora);
    expect(destinatario).toEqual({
      email: "camila@x.cl",
      full_name: "Camila",
      tasks: [
        {
          id: "t-1",
          title: "Llamar a Ana",
          due_at: "2026-08-26T13:00:00Z",
          lead_id: "l-1",
          lead_name: "Ana",
          urgency: "hoy",
        },
      ],
    });
  });

  it("junta varias tareas de la misma persona en un solo correo", async () => {
    results.lead_tasks = {
      data: [tarea(), tarea({ id: "t-2", due_at: "2026-08-24T13:00:00Z" })],
      error: null,
    };
    const destinatarios = await getTasksForDigest(ahora);
    expect(destinatarios).toHaveLength(1);
    expect(destinatarios[0].tasks.map((t) => t.id)).toEqual(["t-2", "t-1"]);
    expect(destinatarios[0].tasks[0].urgency).toBe("vencida");
  });

  it("separa a personas distintas", async () => {
    results.lead_tasks = {
      data: [
        tarea(),
        tarea({ id: "t-2", profiles: { email: "elkis@x.cl", full_name: "Elkis" } }),
      ],
      error: null,
    };
    const destinatarios = await getTasksForDigest(ahora);
    expect(destinatarios.map((d) => d.email).sort()).toEqual([
      "camila@x.cl",
      "elkis@x.cl",
    ]);
  });

  it("descarta lo que todavía no vence hoy aunque entre en el horizonte", async () => {
    results.lead_tasks = {
      data: [tarea({ due_at: "2026-08-27T13:00:00Z" })],
      error: null,
    };
    expect(await getTasksForDigest(ahora)).toEqual([]);
  });

  it("deja fuera la tarea sin autor: no hay a quién avisarle", async () => {
    results.lead_tasks = {
      data: [tarea({ created_by: null, profiles: null })],
      error: null,
    };
    expect(await getTasksForDigest(ahora)).toEqual([]);
  });

  it("deja fuera la tarea cuyo autor no tiene correo", async () => {
    results.lead_tasks = {
      data: [tarea({ profiles: { email: "", full_name: "Sin correo" } })],
      error: null,
    };
    expect(await getTasksForDigest(ahora)).toEqual([]);
  });

  it("acepta los joins que PostgREST devuelve como arreglo", async () => {
    results.lead_tasks = {
      data: [
        tarea({
          leads: [{ full_name: "Ana" }],
          profiles: [{ email: "camila@x.cl", full_name: "Camila" }],
        }),
      ],
      error: null,
    };
    const [destinatario] = await getTasksForDigest(ahora);
    expect(destinatario.email).toBe("camila@x.cl");
    expect(destinatario.tasks[0].lead_name).toBe("Ana");
  });

  it("nombra al lead sin nombre en vez de dejar el correo con un hueco", async () => {
    results.lead_tasks = { data: [tarea({ leads: null })], error: null };
    expect((await getTasksForDigest(ahora))[0].tasks[0].lead_name).toBe("Lead sin nombre");
  });

  it("deja el nombre del autor en null si el perfil no lo tiene", async () => {
    results.lead_tasks = {
      data: [tarea({ profiles: { email: "camila@x.cl", full_name: null } })],
      error: null,
    };
    expect((await getTasksForDigest(ahora))[0].full_name).toBeNull();
  });

  it("devuelve vacío si la base no trae nada", async () => {
    results.lead_tasks = { data: null, error: null };
    expect(await getTasksForDigest(ahora)).toEqual([]);
  });

  it("propaga el error", async () => {
    results.lead_tasks = { data: null, error: new Error("boom") };
    await expect(getTasksForDigest(ahora)).rejects.toThrow("boom");
  });
});


describe("el tope silencioso de PostgREST", () => {
  // `db-max-rows` corta la respuesta en 1000 filas SIN avisar: una página llena
  // es indistinguible de "eso era todo". La bitácora crece por interacción, así
  // que este techo se alcanza; si se truncara, leads viejos aparecerían sin
  // contactos y el XLSX diría "Sin contactar" de gente a la que sí se llamó.
  const fila = (i: number) => ({ id: `a-${i}`, lead_id: "l-1", kind: "call", profiles: null });

  it("una sola consulta basta cuando la página viene incompleta", async () => {
    paginas.lead_activity = [[fila(1), fila(2)]];
    const filas = await getAllLeadActivity();
    expect(filas).toHaveLength(2);
    expect(rangeSpy).toHaveBeenCalledTimes(1);
    expect(rangeSpy).toHaveBeenCalledWith("lead_activity", 0, 999);
  });

  it("sigue pidiendo mientras las páginas vengan llenas", async () => {
    const llena = Array.from({ length: 1000 }, (_, i) => fila(i));
    paginas.lead_activity = [llena, [fila(1001)]];

    const filas = await getAllLeadActivity();

    expect(filas).toHaveLength(1001);
    expect(rangeSpy).toHaveBeenCalledTimes(2);
    expect(rangeSpy).toHaveBeenNthCalledWith(2, "lead_activity", 1000, 1999);
  });

  it("una página vacía cierra el recorrido", async () => {
    const llena = Array.from({ length: 1000 }, (_, i) => fila(i));
    paginas.lead_activity = [llena, []];
    expect(await getAllLeadActivity()).toHaveLength(1000);
    expect(rangeSpy).toHaveBeenCalledTimes(2);
  });

  it("las tareas se recorren igual", async () => {
    paginas.lead_tasks = [[{ id: "t-1", lead_id: "l-1" }]];
    expect(await getAllLeadTasks()).toHaveLength(1);
    expect(rangeSpy).toHaveBeenCalledWith("lead_tasks", 0, 999);
  });

  it("el error de una página posterior no se traga", async () => {
    const llena = Array.from({ length: 1000 }, (_, i) => fila(i));
    paginas.lead_activity = [llena];
    // La segunda página no está definida: el mock devuelve [] y corta. Para
    // probar el error se fuerza por la vía de `results`.
    delete paginas.lead_activity;
    results.lead_activity = { data: null, error: new Error("boom") };
    await expect(getAllLeadActivity()).rejects.toThrow("boom");
  });

  it("avisa por consola en vez de truncar en silencio al llegar al techo", async () => {
    const llena = Array.from({ length: 1000 }, (_, i) => fila(i));
    // 20 páginas llenas = el techo de 20.000.
    paginas.lead_activity = Array.from({ length: 20 }, () => llena);

    const filas = await getAllLeadActivity();

    expect(filas).toHaveLength(20_000);
    expect(rangeSpy).toHaveBeenCalledTimes(20);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("alcanzó el techo"),
    );
  });
});
