import { describe, expect, it, vi } from "vitest";
import {
  createCurrentLessonOutputService,
  prepareCurrentA4Handout,
} from "@/features/builder/useLessonExportActions";
import {
  createInitialBuilderDocument,
  type BuilderDocument,
} from "@/features/builder/schema";

describe("current lesson output preparation wiring", () => {
  it.each([
    ["presenter", (service: ReturnType<typeof createCurrentLessonOutputService>) => service.preparePresenterHtml("lesson-1", null)],
    ["HTML", (service: ReturnType<typeof createCurrentLessonOutputService>) => service.prepareDownloadHtml()],
  ])("prepares the %s output exactly once", async (_label, run) => {
    const document = createInitialBuilderDocument();
    document.title = "Original";
    const prepared = { ...structuredClone(document), title: "Prepared" };
    const dependencies = outputDependencies(prepared);
    const service = createCurrentLessonOutputService(document, dependencies);

    const html = await run(service);

    expect(dependencies.prepareDocument).toHaveBeenCalledOnce();
    expect(dependencies.prepareDocument).toHaveBeenCalledWith(
      document,
      document.retrievalItems,
    );
    expect(html).toContain("Prepared");
  });

  it("prepares PDF once while saving and syncing the original document", async () => {
    const document = createInitialBuilderDocument();
    document.title = "Original";
    const prepared = { ...structuredClone(document), title: "Prepared" };
    const dependencies = outputDependencies(prepared);
    const service = createCurrentLessonOutputService(document, dependencies);

    const result = await service.preparePdf();

    expect(dependencies.prepareDocument).toHaveBeenCalledOnce();
    expect(dependencies.saveLesson).toHaveBeenCalledOnce();
    expect(dependencies.saveLesson).toHaveBeenCalledWith(document);
    expect(dependencies.syncDocument).toHaveBeenCalledOnce();
    expect(dependencies.syncDocument).toHaveBeenCalledWith(document);
    expect(dependencies.downloadPdf).toHaveBeenCalledWith(
      "saved-lesson",
      expect.stringContaining("Prepared"),
    );
    expect(result.pdf).toBeInstanceOf(Blob);
  });

  it("exports JSON without preparing or changing the durable document", () => {
    const document = createInitialBuilderDocument();
    const dependencies = outputDependencies(structuredClone(document));
    const service = createCurrentLessonOutputService(document, dependencies);

    const payload = service.buildJsonPayload();

    expect(dependencies.prepareDocument).not.toHaveBeenCalled();
    expect(dependencies.saveLesson).not.toHaveBeenCalled();
    expect(dependencies.syncDocument).not.toHaveBeenCalled();
    expect(payload.lessonBuilder).toBe(document);
  });

  it("selects persisted handout slides before preparing exactly once", async () => {
    const document = currentHandoutDocument();
    const prepareDocument = vi.fn(async (selected: BuilderDocument) => {
      expect(selected.slides.map((slide) => slide.id)).toEqual([
        "starter",
        "example",
      ]);
      return selected;
    });

    const result = await prepareCurrentA4Handout(document, {
      prepareDocument,
    });

    expect(prepareDocument).toHaveBeenCalledOnce();
    expect(result.html).toContain('aria-label="Starter handout page"');
  });
});

function outputDependencies(prepared: BuilderDocument) {
  return {
    prepareDocument: vi.fn().mockResolvedValue(prepared),
    loadRuntimeAssets: vi.fn().mockResolvedValue({
      css: "/* runtime css */",
      javaScript: "window.runtime=true;",
    }),
    saveLesson: vi.fn().mockResolvedValue({
      id: "saved-lesson",
      title: "Original",
      className: "",
      teachingDate: "",
      updatedAt: "2026-08-03T00:00:00.000Z",
    }),
    syncDocument: vi.fn().mockResolvedValue(undefined),
    downloadPdf: vi.fn().mockResolvedValue(
      new Blob(["pdf"], { type: "application/pdf" }),
    ),
  };
}

function currentHandoutDocument() {
  const document = createInitialBuilderDocument();
  document.slides = [
    {
      id: "starter",
      type: "starter",
      title: "Starter",
      slots: [],
    },
    {
      id: "excluded",
      type: "blank",
      title: "Excluded",
    },
    {
      id: "example",
      type: "example",
      title: "Example",
      lo: "101a: Expand",
      image1: {
        name: "example.png",
        type: "image/png",
        size: 1,
        dataUrl: "data:image/png;base64,aW1hZ2U=",
      },
      image2: null,
      answerImage1: null,
      answerImage2: null,
    },
  ];
  document.handoutSlideIds = ["starter", "example"];
  return document;
}
