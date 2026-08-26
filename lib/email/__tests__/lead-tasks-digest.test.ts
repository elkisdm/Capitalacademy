import { describe, it, expect } from "vitest";
import {
  buildLeadTasksDigest,
  digestSubject,
} from "@/lib/email/lead-tasks-digest";
import type { DigestRecipient, DigestTask } from "@/lib/admin/leads-queries";

const tarea = (over: Partial<DigestTask> = {}): DigestTask => ({
  id: "t-1",
  title: "Llamar a Ana",
  due_at: "2026-08-26T13:00:00Z",
  lead_id: "l-1",
  lead_name: "Ana Pérez",
  urgency: "hoy",
  ...over,
});

const persona = (tasks: DigestTask[], full_name: string | null = "Camila Soto"): DigestRecipient => ({
  email: "camila@x.cl",
  full_name,
  tasks,
});

describe("digestSubject", () => {
  it("una sola tarea va en singular", () => {
    expect(digestSubject([tarea()])).toBe("Leads · 1 seguimiento pendiente");
  });

  it("varias van en plural", () => {
    expect(digestSubject([tarea(), tarea({ id: "t-2" })])).toBe(
      "Leads · 2 seguimientos pendientes",
    );
  });

  it("nombra las atrasadas para poder decidir sin abrir el correo", () => {
    expect(digestSubject([tarea({ urgency: "vencida" }), tarea({ id: "t-2" })])).toBe(
      "Leads · 2 seguimientos pendientes (1 atrasado)",
    );
  });

  it("pluraliza las atrasadas", () => {
    expect(
      digestSubject([
        tarea({ urgency: "vencida" }),
        tarea({ id: "t-2", urgency: "vencida" }),
      ]),
    ).toBe("Leads · 2 seguimientos pendientes (2 atrasados)");
  });
});

describe("buildLeadTasksDigest", () => {
  it("nombra la tarea y su lead", () => {
    const { html, text } = buildLeadTasksDigest(persona([tarea()]));
    expect(html).toContain("Llamar a Ana");
    expect(html).toContain("Ana Pérez");
    expect(text).toContain("Llamar a Ana");
    expect(text).toContain("Ana Pérez");
  });

  it("marca visiblemente lo atrasado", () => {
    const { html, text } = buildLeadTasksDigest(persona([tarea({ urgency: "vencida" })]));
    expect(html).toContain("Atrasada");
    expect(text).toContain("[ATRASADA]");
  });

  it("no marca como atrasado lo que vence hoy", () => {
    const { html, text } = buildLeadTasksDigest(persona([tarea()]));
    expect(html).not.toContain("Atrasada");
    expect(text).not.toContain("[ATRASADA]");
  });

  it("saluda por el nombre de pila", () => {
    expect(buildLeadTasksDigest(persona([tarea()])).text).toContain("Hola Camila,");
  });

  it("saluda igual si no hay nombre", () => {
    const { text } = buildLeadTasksDigest(persona([tarea()], null));
    expect(text).toContain("Hola,");
  });

  it("lista todas las tareas", () => {
    const { text } = buildLeadTasksDigest(
      persona([tarea(), tarea({ id: "t-2", title: "Mandar propuesta" })]),
    );
    expect(text).toContain("Llamar a Ana");
    expect(text).toContain("Mandar propuesta");
  });

  it("escapa el HTML del título y del nombre del lead", () => {
    const { html } = buildLeadTasksDigest(
      persona([tarea({ title: "<script>x</script>", lead_name: "A & B" })]),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&amp;");
  });

  it("muestra la hora de Chile, no la UTC", () => {
    // 13:00 UTC = 09:00 en Chile (UTC-4 en agosto).
    expect(buildLeadTasksDigest(persona([tarea()])).text).toContain("09:00");
  });

  it("no revienta con una fecha ilegible", () => {
    const { text } = buildLeadTasksDigest(persona([tarea({ due_at: "no-es-fecha" })]));
    expect(text).toContain("sin fecha");
  });

  it("lleva al panel de leads", () => {
    const { html, text } = buildLeadTasksDigest(persona([tarea()]));
    expect(html).toContain("/admin/leads");
    expect(text).toContain("/admin/leads");
  });
});
