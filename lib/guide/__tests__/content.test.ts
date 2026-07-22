import { describe, it, expect } from "vitest";
import { ARTICLES, articlesByAudience, CATEGORIES_BY_AUDIENCE, type Audience } from "@/lib/guide/content";
import { visibleAudiences } from "@/lib/guide/audience";

const AUDIENCES: Audience[] = ["student", "teacher", "team"];

describe("ARTICLES", () => {
  it("tiene slugs únicos", () => {
    const slugs = ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("cada artículo tiene una categoría válida para su audiencia", () => {
    for (const a of ARTICLES) {
      expect(CATEGORIES_BY_AUDIENCE[a.audience]).toContain(a.category);
    }
  });

  it("ninguna audiencia queda vacía", () => {
    for (const audience of AUDIENCES) {
      expect(articlesByAudience(audience).length).toBeGreaterThan(0);
    }
  });

  it("articlesByAudience particiona sin solapes y sin faltantes", () => {
    for (const audience of AUDIENCES) {
      const items = articlesByAudience(audience);
      expect(items.every((a) => a.audience === audience)).toBe(true);
    }
    const total = AUDIENCES.reduce((n, audience) => n + articlesByAudience(audience).length, 0);
    expect(total).toBe(ARTICLES.length);
  });

  it("las rutas devuelven null o un string que empieza con '/'", () => {
    const contexts = [
      { cohortSlug: null, adminCohortId: null },
      { cohortSlug: "cohorte-1", adminCohortId: "admin-cohorte-1" },
    ];
    for (const a of ARTICLES) {
      if (!a.route) continue;
      for (const ctx of contexts) {
        const href = a.route(ctx);
        if (href !== null) {
          expect(href.startsWith("/")).toBe(true);
        }
      }
    }
  });

  it("todo artículo tiene title, summary, overview y al menos un paso", () => {
    for (const a of ARTICLES) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.summary.length).toBeGreaterThan(0);
      expect(a.overview.length).toBeGreaterThan(0);
      expect(a.steps.length).toBeGreaterThan(0);
    }
  });
});

describe("visibleAudiences", () => {
  it("alumno sin más roles ve solo 'student'", () => {
    expect(visibleAudiences({ isStaff: false, isTeacher: false })).toEqual(["student"]);
  });

  it("docente puro ve 'teacher' y 'student', nunca 'team'", () => {
    const result = visibleAudiences({ isStaff: false, isTeacher: true });
    expect(result).toContain("teacher");
    expect(result).toContain("student");
    expect(result).not.toContain("team");
  });

  it("staff ve las tres pestañas y la primera sigue siendo 'student'", () => {
    const result = visibleAudiences({ isStaff: true, isTeacher: false });
    expect(result).toEqual(expect.arrayContaining(["student", "team", "teacher"]));
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("student");
  });
});
