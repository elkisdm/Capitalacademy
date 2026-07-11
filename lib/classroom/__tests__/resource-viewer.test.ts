import { describe, it, expect } from "vitest";
import { detectViewerKind, officeEmbedUrl } from "../resource-viewer";

describe("detectViewerKind", () => {
  it("detecta pdf por extensión de storage_path", () => {
    expect(
      detectViewerKind({ storagePath: "cohort/lesson/guia.pdf", url: null, type: "pdf" }),
    ).toBe("pdf");
  });

  it("detecta office para pptx", () => {
    expect(
      detectViewerKind({ storagePath: "cohort/lesson/slides.pptx", url: null, type: "document" }),
    ).toBe("office");
  });

  it("detecta office para docx", () => {
    expect(
      detectViewerKind({ storagePath: "cohort/lesson/informe.docx", url: null, type: "document" }),
    ).toBe("office");
  });

  it("detecta office para xlsx", () => {
    expect(
      detectViewerKind({ storagePath: "cohort/lesson/planilla.xlsx", url: null, type: "template" }),
    ).toBe("office");
  });

  it("detecta image para png", () => {
    expect(
      detectViewerKind({ storagePath: "cohort/lesson/diagrama.png", url: null, type: "other" }),
    ).toBe("image");
  });

  it("degrada svg a download (invariante: nunca inline)", () => {
    expect(
      detectViewerKind({ storagePath: "cohort/lesson/logo.svg", url: null, type: "other" }),
    ).toBe("download");
  });

  it("degrada zip a download", () => {
    expect(
      detectViewerKind({ storagePath: "cohort/lesson/paquete.zip", url: null, type: "other" }),
    ).toBe("download");
  });

  it("clasifica un link externo como external", () => {
    expect(
      detectViewerKind({ storagePath: null, url: "https://ejemplo.com/recurso", type: "link" }),
    ).toBe("external");
  });

  it("clasifica un recurso sin storage_path ni extensión reconocible como external", () => {
    expect(
      detectViewerKind({ storagePath: null, url: "https://ejemplo.com/recurso", type: "other" }),
    ).toBe("external");
  });
});

describe("officeEmbedUrl", () => {
  it("encodea la signed URL completa, incluyendo el token del querystring", () => {
    const viewUrl =
      "https://igatsyghbadccbrjiurl.supabase.co/storage/v1/object/sign/lesson-resources/slides.pptx?token=abc.def-ghi&exp=123";
    const embed = officeEmbedUrl(viewUrl);
    expect(embed).toBe(
      `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(viewUrl)}`,
    );
    // El token no debe filtrarse como parte separada del querystring del embed.
    expect(embed).not.toContain("&token=");
    expect(embed).toContain(encodeURIComponent("token=abc.def-ghi"));
  });
});
