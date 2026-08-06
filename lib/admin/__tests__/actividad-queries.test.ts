import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks controlables del cliente de Supabase
// ---------------------------------------------------------------------------
const mockCohortSingle = vi.fn();
const mockEnrollments = vi.fn();
const mockActivity = vi.fn();
// Segunda consulta: la última fecha con actividad ANTERIOR a la ventana, solo
// para las matrículas que no aparecen dentro del rango.
const mockPriorActivity = vi.fn();
const activityFilters: Array<{ column: string; value: unknown }> = [];
const priorFilters: Array<{ column: string; value: unknown }> = [];
/** Ventanas `.range()` pedidas, para verificar el paginado. */
const activityRanges: Array<[number, number]> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === "cohorts") {
        return {
          select: () => ({ eq: () => ({ single: mockCohortSingle }) }),
        };
      }
      if (table === "enrollments") {
        return {
          select: () => ({ eq: () => ({ eq: mockEnrollments }) }),
        };
      }
      if (table === "student_activity_daily") {
        const chain = {
          select: () => chain,
          in: (column: string, value: unknown) => {
            activityFilters.push({ column, value });
            return chain;
          },
          gte: (column: string, value: unknown) => {
            activityFilters.push({ column, value });
            return chain;
          },
          // Cadena de la consulta del historial: .gt().lt().order()
          gt: (column: string, value: unknown) => {
            priorFilters.push({ column, value });
            return chain;
          },
          lt: (column: string, value: unknown) => {
            priorFilters.push({ column, value });
            return chain;
          },
          order: () => chain,
          // Terminal de la consulta paginada del rango.
          range: (from: number, to: number) => {
            activityRanges.push([from, to]);
            return mockActivity();
          },
          // La del historial termina en .order() y se espera directamente: el
          // builder real de Supabase es thenable.
          then: (resolve: (v: unknown) => unknown) => mockPriorActivity().then(resolve),
        };
        return chain;
      }
      return {};
    },
  })),
}));

const {
  buildActivityRows,
  summarizeActivity,
  getCohortActivityReport,
  isStaffEnrollment,
} = await import("@/lib/admin/actividad-queries");

const TODAY = "2026-08-05";

function enr(id: string, name: string | null = "Ana Pérez") {
  return {
    enrollment_id: id,
    student_id: `student-${id}`,
    full_name: name,
    email: `${id}@example.cl`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  activityFilters.length = 0;
  priorFilters.length = 0;
  activityRanges.length = 0;
  // Por defecto no hay historial anterior: cada test que lo necesite lo declara.
  mockPriorActivity.mockResolvedValue({ data: [] });
});

// ===========================================================================
describe("isStaffEnrollment", () => {
  it("reconoce como staff los mismos roles que is_platform_staff() en la base", () => {
    expect(isStaffEnrollment("ops")).toBe(true);
    expect(isStaffEnrollment("admin")).toBe(true);
  });

  it("trata como alumno el rol de usuario común", () => {
    expect(isStaffEnrollment("user")).toBe(false);
  });

  it("ante un rol ausente prefiere mostrar de más", () => {
    // Esconder a alguien por un dato faltante es peor que mostrarlo: el panel
    // existe justamente para encontrar a quien no aparece.
    expect(isStaffEnrollment(null)).toBe(false);
    expect(isStaffEnrollment(undefined)).toBe(false);
  });

  it("no confunde el rol legacy de docente con staff de plataforma", () => {
    // `profiles.role` es la columna legacy y tiene 'teacher'; el permiso real
    // vive en `system_role`, que solo conoce user/ops/admin.
    expect(isStaffEnrollment("teacher")).toBe(false);
    expect(isStaffEnrollment("student")).toBe(false);
  });
});

// ===========================================================================
describe("buildActivityRows", () => {
  it("suma los segundos del rango y cuenta los días en que entró", () => {
    const rows = buildActivityRows(
      [enr("e1")],
      [
        { enrollment_id: "e1", activity_date: "2026-08-01", active_seconds: 1800 },
        { enrollment_id: "e1", activity_date: "2026-08-03", active_seconds: 3600 },
      ],
      TODAY,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].total_seconds).toBe(5400);
    expect(rows[0].active_days).toBe(2);
    expect(rows[0].avg_seconds_per_active_day).toBe(2700);
  });

  it("no cuenta como día activo un día con cero segundos", () => {
    // Abrir y cerrar sin quedarse NO es haber usado la plataforma; si contara,
    // el promedio por día se hundiría y "días que entró" mentiría.
    const rows = buildActivityRows(
      [enr("e1")],
      [
        { enrollment_id: "e1", activity_date: "2026-08-01", active_seconds: 0 },
        { enrollment_id: "e1", activity_date: "2026-08-04", active_seconds: 600 },
      ],
      TODAY,
    );

    expect(rows[0].active_days).toBe(1);
    expect(rows[0].total_seconds).toBe(600);
    expect(rows[0].last_active_date).toBe("2026-08-04");
    expect(rows[0].days_since_last_active).toBe(1);
  });

  it("toma el último día con tiempo, no el último día con fila", () => {
    const rows = buildActivityRows(
      [enr("e1")],
      [
        { enrollment_id: "e1", activity_date: "2026-08-02", active_seconds: 900 },
        { enrollment_id: "e1", activity_date: "2026-08-05", active_seconds: 0 },
      ],
      TODAY,
    );

    expect(rows[0].last_active_date).toBe("2026-08-02");
    expect(rows[0].days_since_last_active).toBe(3);
  });

  it("deja en null y en riesgo a quien nunca apareció", () => {
    const rows = buildActivityRows([enr("e1")], [], TODAY);

    expect(rows[0].total_seconds).toBe(0);
    expect(rows[0].active_days).toBe(0);
    expect(rows[0].avg_seconds_per_active_day).toBe(0);
    expect(rows[0].last_active_date).toBeNull();
    expect(rows[0].days_since_last_active).toBeNull();
    expect(rows[0].risk).toBe("risk");
  });

  // El panel existe para responder "quién lleva días sin aparecer". Si la
  // última fecha se derivara solo de la ventana del rango, con el rango en 7
  // días un alumno que entró hace 10 saldría como "Nunca" y como inactivo de
  // 14+ días: las dos cosas falsas.
  it("usa el historial anterior a la ventana para la última actividad", () => {
    const rows = buildActivityRows(
      [enr("e1")],
      [],
      TODAY,
      new Map([["e1", "2026-07-26"]]),
    );

    expect(rows[0].last_active_date).toBe("2026-07-26");
    expect(rows[0].days_since_last_active).toBe(10);
    expect(rows[0].risk).not.toBe("risk");
  });

  it("los agregados siguen siendo del rango aunque haya historial anterior", () => {
    const rows = buildActivityRows(
      [enr("e1")],
      [],
      TODAY,
      new Map([["e1", "2026-07-26"]]),
    );

    expect(rows[0].total_seconds).toBe(0);
    expect(rows[0].active_days).toBe(0);
  });

  it("la actividad dentro de la ventana le gana al historial anterior", () => {
    const rows = buildActivityRows(
      [enr("e1")],
      [{ enrollment_id: "e1", activity_date: "2026-08-04", active_seconds: 600 }],
      TODAY,
      new Map([["e1", "2026-07-26"]]),
    );

    expect(rows[0].last_active_date).toBe("2026-08-04");
    expect(rows[0].days_since_last_active).toBe(1);
  });

  it("sigue en null quien no aparece ni en la ventana ni en el historial", () => {
    const rows = buildActivityRows([enr("e1")], [], TODAY, new Map());

    expect(rows[0].last_active_date).toBeNull();
    expect(rows[0].risk).toBe("risk");
  });

  it("no mezcla las filas de una matrícula con las de otra", () => {
    const rows = buildActivityRows(
      [enr("e1"), enr("e2")],
      [
        { enrollment_id: "e1", activity_date: "2026-08-01", active_seconds: 100 },
        { enrollment_id: "e2", activity_date: "2026-08-01", active_seconds: 900 },
      ],
      TODAY,
    );

    const e1 = rows.find((r) => r.enrollment_id === "e1")!;
    const e2 = rows.find((r) => r.enrollment_id === "e2")!;
    expect(e1.total_seconds).toBe(100);
    expect(e2.total_seconds).toBe(900);
  });

  it("ordena de más tiempo a menos, dejando al final a quien no entró", () => {
    const rows = buildActivityRows(
      [enr("e1"), enr("e2"), enr("e3")],
      [
        { enrollment_id: "e1", activity_date: "2026-08-01", active_seconds: 100 },
        { enrollment_id: "e3", activity_date: "2026-08-01", active_seconds: 5000 },
      ],
      TODAY,
    );

    expect(rows.map((r) => r.enrollment_id)).toEqual(["e3", "e1", "e2"]);
  });

  it("cae al correo cuando no hay nombre y arma las iniciales", () => {
    const rows = buildActivityRows([enr("e1", null)], [], TODAY);
    expect(rows[0].full_name).toBe("e1@example.cl");

    const conNombre = buildActivityRows([enr("e2", "Ana Pérez")], [], TODAY);
    expect(conNombre[0].initials).toBe("AP");
  });

  it("tolera segundos que llegan como string desde Postgres", () => {
    const rows = buildActivityRows(
      [enr("e1")],
      [
        {
          enrollment_id: "e1",
          activity_date: "2026-08-01",
          active_seconds: "1200" as unknown as number,
        },
      ],
      TODAY,
    );
    expect(rows[0].total_seconds).toBe(1200);
  });
});

// ===========================================================================
describe("summarizeActivity", () => {
  it("resume una cohorte vacía sin dividir por cero", () => {
    expect(summarizeActivity([])).toEqual({
      total_students: 0,
      used_platform: 0,
      active_last_7: 0,
      at_risk: 0,
      total_seconds: 0,
      avg_seconds_per_student: 0,
    });
  });

  it("cuenta uso, vistos en la semana, riesgo y promedio por alumno", () => {
    const students = buildActivityRows(
      [enr("e1"), enr("e2"), enr("e3")],
      [
        // e1: entró hoy
        { enrollment_id: "e1", activity_date: "2026-08-05", active_seconds: 3600 },
        // e2: entró hace 20 días → en riesgo
        { enrollment_id: "e2", activity_date: "2026-07-16", active_seconds: 1800 },
        // e3: nunca entró → en riesgo
      ],
      TODAY,
    );

    const summary = summarizeActivity(students);

    expect(summary.total_students).toBe(3);
    expect(summary.used_platform).toBe(2);
    expect(summary.active_last_7).toBe(1);
    expect(summary.at_risk).toBe(2);
    expect(summary.total_seconds).toBe(5400);
    // El promedio reparte entre TODOS los matriculados, no solo entre los que
    // entraron: si no, una cohorte muerta con un alumno fanático se ve sana.
    expect(summary.avg_seconds_per_student).toBe(1800);
  });
});

// ===========================================================================
describe("getCohortActivityReport", () => {
  it("devuelve null cuando la cohorte no existe", async () => {
    mockCohortSingle.mockResolvedValue({ data: null });

    expect(await getCohortActivityReport("no-existe")).toBeNull();
  });

  it("no consulta la actividad cuando la cohorte no tiene matrículas activas", async () => {
    mockCohortSingle.mockResolvedValue({
      data: { id: "c1", name: "G4", program_id: "p1", programs: { id: "p1", name: "Diplomado" } },
    });
    mockEnrollments.mockResolvedValue({ data: [] });

    const report = await getCohortActivityReport("c1");

    expect(report!.students).toEqual([]);
    expect(report!.summary.total_students).toBe(0);
    expect(mockActivity).not.toHaveBeenCalled();
  });

  // En producción hay gente del equipo matriculada a propósito para ver el aula
  // como la ve el alumno. Contarla falsea el denominador y la mete en la lista
  // de inactivos, que es justo lo que el panel tiene que responder bien.
  it("deja fuera las matrículas del equipo y no las cuenta en el resumen", async () => {
    mockCohortSingle.mockResolvedValue({
      data: { id: "c1", name: "G4", program_id: "p1", programs: { id: "p1", name: "Diplomado" } },
    });
    mockEnrollments.mockResolvedValue({
      data: [
        {
          id: "e1",
          student_id: "s1",
          profiles: { full_name: "Ana Pérez", email: "ana@x.cl", system_role: "user" },
        },
        {
          id: "e2",
          student_id: "s2",
          profiles: { full_name: "Paola Ops", email: "paola@x.cl", system_role: "ops" },
        },
        {
          id: "e3",
          student_id: "s3",
          profiles: { full_name: "Elkis Admin", email: "elkis@x.cl", system_role: "admin" },
        },
      ],
    });
    mockActivity.mockResolvedValue({ data: [], error: null });

    const report = await getCohortActivityReport("c1", 7);

    expect(report!.students.map((s) => s.email)).toEqual(["ana@x.cl"]);
    expect(report!.summary.total_students).toBe(1);
    // Tampoco se pide su actividad: no tiene sentido traer filas que se
    // descartan igual.
    expect(activityFilters).toContainEqual({ column: "enrollment_id", value: ["e1"] });
  });

  it("no consulta la actividad cuando la cohorte solo tiene matrículas del equipo", async () => {
    mockCohortSingle.mockResolvedValue({
      data: { id: "c1", name: "G4", program_id: "p1", programs: { id: "p1", name: "Diplomado" } },
    });
    mockEnrollments.mockResolvedValue({
      data: [
        {
          id: "e1",
          student_id: "s1",
          profiles: { full_name: "Elkis Admin", email: "elkis@x.cl", system_role: "admin" },
        },
      ],
    });

    const report = await getCohortActivityReport("c1");

    expect(report!.students).toEqual([]);
    expect(mockActivity).not.toHaveBeenCalled();
  });

  it("acota la consulta al rango pedido y arma el reporte", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T15:00:00Z"));

    mockCohortSingle.mockResolvedValue({
      data: { id: "c1", name: "G4", program_id: "p1", programs: { id: "p1", name: "Diplomado" } },
    });
    mockEnrollments.mockResolvedValue({
      data: [
        { id: "e1", student_id: "s1", profiles: { full_name: "Ana Pérez", email: "ana@x.cl" } },
      ],
    });
    mockActivity.mockResolvedValue({
      data: [{ enrollment_id: "e1", activity_date: "2026-08-04", active_seconds: 2400 }],
      error: null,
    });

    const report = await getCohortActivityReport("c1", 7);

    expect(report!.rangeDays).toBe(7);
    expect(report!.toDate).toBe("2026-08-05");
    // 7 días incluyen hoy y los 6 anteriores.
    expect(report!.fromDate).toBe("2026-07-30");
    expect(activityFilters).toContainEqual({ column: "enrollment_id", value: ["e1"] });
    expect(activityFilters).toContainEqual({ column: "activity_date", value: "2026-07-30" });

    expect(report!.program.name).toBe("Diplomado");
    expect(report!.students[0].full_name).toBe("Ana Pérez");
    expect(report!.students[0].total_seconds).toBe(2400);
    expect(report!.students[0].days_since_last_active).toBe(1);

    vi.useRealTimers();
  });

  // PostgREST recorta al `max-rows` del proyecto SIN devolver error: sin
  // paginado el panel mostraría totales subestimados como si fueran correctos.
  it("pide páginas hasta que una viene incompleta", async () => {
    mockCohortSingle.mockResolvedValue({
      data: { id: "c1", name: "G4", program_id: "p1", programs: { id: "p1", name: "Diplomado" } },
    });
    mockEnrollments.mockResolvedValue({
      data: [
        { id: "e1", student_id: "s1", profiles: { full_name: "Ana Pérez", email: "ana@x.cl" } },
      ],
    });

    // Primera página llena (1000 filas de 1 segundo), segunda con una sola.
    const llena = Array.from({ length: 1000 }, () => ({
      enrollment_id: "e1",
      activity_date: "2026-08-01",
      active_seconds: 1,
    }));
    mockActivity
      .mockResolvedValueOnce({ data: llena, error: null })
      .mockResolvedValueOnce({
        data: [{ enrollment_id: "e1", activity_date: "2026-08-02", active_seconds: 5 }],
        error: null,
      });

    const report = await getCohortActivityReport("c1", 30);

    expect(activityRanges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    // 1000 × 1s de la primera página + 5s de la segunda: no se perdió nada.
    expect(report!.students[0].total_seconds).toBe(1005);
  });

  it("no pide una segunda página cuando la primera viene incompleta", async () => {
    mockCohortSingle.mockResolvedValue({
      data: { id: "c1", name: "G4", program_id: "p1", programs: { id: "p1", name: "Diplomado" } },
    });
    mockEnrollments.mockResolvedValue({
      data: [
        { id: "e1", student_id: "s1", profiles: { full_name: "Ana Pérez", email: "ana@x.cl" } },
      ],
    });
    mockActivity.mockResolvedValue({
      data: [{ enrollment_id: "e1", activity_date: "2026-08-04", active_seconds: 2400 }],
      error: null,
    });

    await getCohortActivityReport("c1", 7);

    expect(activityRanges).toEqual([[0, 999]]);
  });

  it("rescata del historial la última fecha de quien no aparece en la ventana", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T15:00:00Z"));

    mockCohortSingle.mockResolvedValue({
      data: { id: "c1", name: "G4", program_id: "p1", programs: { id: "p1", name: "Diplomado" } },
    });
    mockEnrollments.mockResolvedValue({
      data: [
        { id: "e1", student_id: "s1", profiles: { full_name: "Ana Pérez", email: "ana@x.cl" } },
      ],
    });
    // Nada dentro de los últimos 7 días...
    mockActivity.mockResolvedValue({ data: [], error: null });
    // ...pero sí entró hace 10.
    mockPriorActivity.mockResolvedValue({
      data: [{ enrollment_id: "e1", activity_date: "2026-07-26" }],
    });

    const report = await getCohortActivityReport("c1", 7);

    // El historial se pide acotado a lo anterior a la ventana.
    expect(priorFilters).toContainEqual({ column: "activity_date", value: "2026-07-30" });
    expect(report!.students[0].last_active_date).toBe("2026-07-26");
    expect(report!.students[0].days_since_last_active).toBe(10);
    // Y por lo tanto NO se le cuenta entre los de 14+ días sin entrar.
    expect(report!.summary.at_risk).toBe(0);

    vi.useRealTimers();
  });

  it("no consulta el historial cuando todos aparecieron en la ventana", async () => {
    mockCohortSingle.mockResolvedValue({
      data: { id: "c1", name: "G4", program_id: "p1", programs: { id: "p1", name: "Diplomado" } },
    });
    mockEnrollments.mockResolvedValue({
      data: [
        { id: "e1", student_id: "s1", profiles: { full_name: "Ana Pérez", email: "ana@x.cl" } },
      ],
    });
    mockActivity.mockResolvedValue({
      data: [{ enrollment_id: "e1", activity_date: "2026-08-04", active_seconds: 2400 }],
      error: null,
    });

    await getCohortActivityReport("c1", 7);

    expect(mockPriorActivity).not.toHaveBeenCalled();
  });

  it("propaga el error de la consulta de actividad en vez de reportar ceros", async () => {
    // Un fallo de lectura NO debe verse como "nadie usó la plataforma": eso
    // dispararía outreach sobre alumnos que sí estaban entrando.
    mockCohortSingle.mockResolvedValue({
      data: { id: "c1", name: "G4", program_id: "p1", programs: { id: "p1", name: "Diplomado" } },
    });
    mockEnrollments.mockResolvedValue({
      data: [{ id: "e1", student_id: "s1", profiles: { full_name: "Ana", email: "a@x.cl" } }],
    });
    mockActivity.mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" } });

    await expect(getCohortActivityReport("c1")).rejects.toMatchObject({ code: "57014" });
  });

  it("tolera una cohorte sin programa embebido", async () => {
    mockCohortSingle.mockResolvedValue({
      data: { id: "c1", name: "G4", program_id: "p1", programs: null },
    });
    mockEnrollments.mockResolvedValue({ data: [] });

    const report = await getCohortActivityReport("c1");
    expect(report!.program).toEqual({ id: "p1", name: "" });
  });

  it("tolera matrículas sin perfil embebido", async () => {
    mockCohortSingle.mockResolvedValue({
      data: { id: "c1", name: "G4", program_id: "p1", programs: { id: "p1", name: "D" } },
    });
    mockEnrollments.mockResolvedValue({
      data: [{ id: "e1", student_id: "s1", profiles: null }],
    });
    mockActivity.mockResolvedValue({ data: [], error: null });

    const report = await getCohortActivityReport("c1");
    expect(report!.students[0].full_name).toBe("Alumno");
    expect(report!.students[0].email).toBe("");
  });

  it("usa 30 días cuando no se pide rango", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T15:00:00Z"));

    mockCohortSingle.mockResolvedValue({
      data: { id: "c1", name: "G4", program_id: "p1", programs: { id: "p1", name: "D" } },
    });
    mockEnrollments.mockResolvedValue({ data: [] });

    const report = await getCohortActivityReport("c1");
    expect(report!.rangeDays).toBe(30);
    expect(report!.fromDate).toBe("2026-07-07");

    vi.useRealTimers();
  });
});
