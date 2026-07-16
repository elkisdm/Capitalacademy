import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;
type TableData = Record<string, Row[]>;

let currentFrom: ReturnType<typeof makeFrom>;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => currentFrom(table) }),
}));

const { getStudentsAtAbsenceThreshold } = await import("@/lib/asistencia/queries");

/**
 * Mock mínimo del query builder de supabase-js: cada filtro (`eq`/`neq`/`in`/`lt`)
 * reduce de verdad las filas en memoria, así el resultado final refleja el
 * comportamiento real de la consulta encadenada en vez de solo registrar llamadas.
 */
function makeFrom(data: TableData) {
  const calls: Record<string, string[]> = {};
  const from = vi.fn((table: string) => {
    calls[table] = calls[table] ?? [];
    let rows = [...(data[table] ?? [])];
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return chain;
      }),
      neq: vi.fn((col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] !== val);
        return chain;
      }),
      lt: vi.fn((col: string, val: unknown) => {
        rows = rows.filter((r) => (r[col] as string) < (val as string));
        return chain;
      }),
      in: vi.fn((col: string, vals: unknown[]) => {
        rows = rows.filter((r) => vals.includes(r[col]));
        return chain;
      }),
      then: (resolve: (v: { data: Row[] }) => void) => resolve({ data: rows }),
    };
    return chain;
  });
  return Object.assign(from, { calls });
}

const DIP_ID = "program-dip";
const CAPCI_ID = "program-capci";
const COHORT_DIP = "cohort-dip";
const COHORT_CAPCI = "cohort-capci";

describe("getStudentsAtAbsenceThreshold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sin programas con attendance_alerts_enabled devuelve [] y no consulta cohorts", async () => {
    currentFrom = makeFrom({ programs: [] });

    const result = await getStudentsAtAbsenceThreshold(2);

    expect(result).toEqual([]);
    expect(currentFrom).toHaveBeenCalledWith("programs");
    expect(currentFrom).not.toHaveBeenCalledWith("cohorts");
  });

  it("con DIP-VENTAS activado, una cohorte de un programa SIN opt-in no aparece (regresión C5)", async () => {
    const pastEndsAt = new Date(Date.now() - 60 * 60_000).toISOString(); // cerrada hace 1h
    const enrolledAt = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

    currentFrom = makeFrom({
      programs: [
        { id: DIP_ID, attendance_alerts_enabled: true },
        { id: CAPCI_ID, attendance_alerts_enabled: false },
      ],
      cohorts: [
        { id: COHORT_DIP, program_id: DIP_ID, name: "Diplomado G4", status: "active" },
        { id: COHORT_CAPCI, program_id: CAPCI_ID, name: "CAP-CI G1", status: "active" },
      ],
      class_sessions: [
        {
          id: "s-dip-1",
          cohort_id: COHORT_DIP,
          audience: "all",
          ends_at: pastEndsAt,
          modality: "live_online",
          status: "scheduled",
        },
        {
          id: "s-dip-2",
          cohort_id: COHORT_DIP,
          audience: "all",
          ends_at: pastEndsAt,
          modality: "live_online",
          status: "scheduled",
        },
        {
          id: "s-capci-1",
          cohort_id: COHORT_CAPCI,
          audience: "all",
          ends_at: pastEndsAt,
          modality: "live_online",
          status: "scheduled",
        },
        {
          id: "s-capci-2",
          cohort_id: COHORT_CAPCI,
          audience: "all",
          ends_at: pastEndsAt,
          modality: "live_online",
          status: "scheduled",
        },
      ],
      enrollments: [
        {
          student_id: "alumno-dip",
          cohort_id: COHORT_DIP,
          segment: null,
          enrolled_at: enrolledAt,
          status: "active",
          profiles: { email: "dip@example.com", full_name: "Alumno Dip" },
        },
        {
          student_id: "alumno-capci",
          cohort_id: COHORT_CAPCI,
          segment: null,
          enrolled_at: enrolledAt,
          status: "active",
          profiles: { email: "capci@example.com", full_name: "Alumno CapCI" },
        },
      ],
      session_attendance: [],
    });

    const result = await getStudentsAtAbsenceThreshold(2);

    expect(result.map((r) => r.studentId)).toEqual(["alumno-dip"]);
    expect(result.find((r) => r.studentId === "alumno-capci")).toBeUndefined();
  });

  it("una sesión anterior a la matrícula del alumno no cuenta como inasistencia", async () => {
    const pastEndsAt = new Date(Date.now() - 60 * 60_000).toISOString();
    const enrolledAfterSession = new Date(Date.now() + 60_000).toISOString(); // se matriculó DESPUÉS

    currentFrom = makeFrom({
      programs: [{ id: DIP_ID, attendance_alerts_enabled: true }],
      cohorts: [{ id: COHORT_DIP, program_id: DIP_ID, name: "Diplomado G4", status: "active" }],
      class_sessions: [
        {
          id: "s-dip-1",
          cohort_id: COHORT_DIP,
          audience: "all",
          ends_at: pastEndsAt,
          modality: "live_online",
          status: "scheduled",
        },
        {
          id: "s-dip-2",
          cohort_id: COHORT_DIP,
          audience: "all",
          ends_at: pastEndsAt,
          modality: "live_online",
          status: "scheduled",
        },
      ],
      enrollments: [
        {
          student_id: "alumno-tardio",
          cohort_id: COHORT_DIP,
          segment: null,
          enrolled_at: enrolledAfterSession,
          status: "active",
          profiles: { email: "tardio@example.com", full_name: "Alumno Tardío" },
        },
      ],
      session_attendance: [],
    });

    const result = await getStudentsAtAbsenceThreshold(2);

    expect(result).toEqual([]);
  });

  it("una sesión audience='capital_inteligente' solo cuenta para alumnos con ese segmento", async () => {
    const pastEndsAt = new Date(Date.now() - 60 * 60_000).toISOString();
    const enrolledAt = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

    currentFrom = makeFrom({
      programs: [{ id: DIP_ID, attendance_alerts_enabled: true }],
      cohorts: [{ id: COHORT_DIP, program_id: DIP_ID, name: "Diplomado G4", status: "active" }],
      class_sessions: [
        {
          id: "s-ci-1",
          cohort_id: COHORT_DIP,
          audience: "capital_inteligente",
          ends_at: pastEndsAt,
          modality: "live_online",
          status: "scheduled",
        },
        {
          id: "s-ci-2",
          cohort_id: COHORT_DIP,
          audience: "capital_inteligente",
          ends_at: pastEndsAt,
          modality: "live_online",
          status: "scheduled",
        },
      ],
      enrollments: [
        {
          student_id: "alumno-sin-segmento",
          cohort_id: COHORT_DIP,
          segment: null,
          enrolled_at: enrolledAt,
          status: "active",
          profiles: { email: "sinsegmento@example.com", full_name: "Sin Segmento" },
        },
        {
          student_id: "alumno-ci",
          cohort_id: COHORT_DIP,
          segment: "capital_inteligente",
          enrolled_at: enrolledAt,
          status: "active",
          profiles: { email: "ci@example.com", full_name: "Alumno CI" },
        },
      ],
      session_attendance: [],
    });

    const result = await getStudentsAtAbsenceThreshold(2);

    expect(result.map((r) => r.studentId)).toEqual(["alumno-ci"]);
  });
});
