import { createA4BundleSheetDocuments } from "@/features/builder/a4-bundle-pdf";
import { describe, expect, it } from "vitest";

describe("A4 bundle sheet documents", () => {
  it.each([
    {
      slides: ["starter-slide"],
      sheets: [["starter-slide"]],
      orientations: ["portrait"],
    },
    {
      slides: ["starter-slide", "example-slide"],
      sheets: [["starter-slide", "example-slide"]],
      orientations: ["portrait"],
    },
    {
      slides: ["starter-slide", "example-slide", "revision-slide"],
      sheets: [["starter-slide", "example-slide"], ["revision-slide"]],
      orientations: ["portrait", "portrait"],
    },
    {
      slides: ["starter-slide", "pdf-page-slide portrait", "example-slide"],
      sheets: [
        ["starter-slide"],
        ["pdf-page-slide portrait"],
        ["example-slide"],
      ],
      orientations: ["portrait", "portrait", "portrait"],
    },
    {
      slides: ["pdf-page-slide landscape"],
      sheets: [["pdf-page-slide landscape"]],
      orientations: ["landscape"],
    },
  ])("groups $slides in document order", ({ slides, sheets, orientations }) => {
    const documents = createA4BundleSheetDocuments(createLessonHtml(slides));

    expect(documents.map((document) => document.orientation)).toEqual(
      orientations,
    );
    expect(documents.map((document) => sheetSlideClasses(document.html))).toEqual(
      sheets,
    );

    documents.forEach((document, index) => {
      const page = documentPage(document.html);
      const isFullPage = sheets[index][0]?.includes("pdf-page-slide");
      expect(page.querySelectorAll(".a4-bundle-slot")).toHaveLength(
        isFullPage ? 0 : 2,
      );
      expect(page.querySelectorAll(".a4-bundle-full-page")).toHaveLength(
        isFullPage ? 1 : 0,
      );
      if (!isFullPage && sheets[index].length === 1) {
        expect(page.querySelectorAll(".a4-bundle-slot")[1]?.innerHTML).toBe("");
      }
    });
  });

  it("uses data-slide-aspect to orient a full-page slide when no class is present", () => {
    const [document] = createA4BundleSheetDocuments(
      createLessonHtml(["pdf-page-slide"], ' data-slide-aspect="1.4"'),
    );

    expect(document.orientation).toBe("landscape");
    expect(document.html).toContain("@page{size:A4 landscape;margin:0}");
  });

  it("rejects a snapshot without lesson slides", () => {
    expect(() => createA4BundleSheetDocuments("<html><head></head><body></body></html>")).toThrow(
      "The A4 bundle snapshot does not contain any lesson slides.",
    );
  });
});

function createLessonHtml(slides: string[], attributes = "") {
  return `<!doctype html><html><head><style>.lesson-slide{color:#123}</style></head><body><main class="lesson-deck">${slides
    .map(
      (className) =>
        `<section class="lesson-slide ${className}"${attributes}>${className}</section>`,
    )
    .join("")}</main><script>window.runtime = true</script></body></html>`;
}

function documentPage(html: string) {
  return new DOMParser().parseFromString(html, "text/html");
}

function sheetSlideClasses(html: string) {
  return Array.from(documentPage(html).querySelectorAll(".lesson-slide")).map(
    (slide) =>
      Array.from(slide.classList)
        .filter((className) => className !== "lesson-slide")
        .join(" "),
  );
}
