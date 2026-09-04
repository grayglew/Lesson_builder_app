import { describe, expect, it, vi } from "vitest";
import {
  createAdditionalSheetGlueChooser,
  createAdditionalSheetGlueWindowChooser,
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

  it("rejects a handout before asset preparation when the overall lesson LO is blank", async () => {
    const document = currentHandoutDocument();
    document.overallLessonLo = "   ";
    const prepareDocument = vi.fn();

    await expect(
      prepareCurrentA4Handout(document, { prepareDocument }),
    ).rejects.toThrow("Add an overall lesson LO before creating a handout.");

    expect(prepareDocument).not.toHaveBeenCalled();
  });

  it("describes the exact duplex sheet count when offering additional-sheet glue margins", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const chooseAdditionalSheetGlue = createAdditionalSheetGlueChooser(
      async (request) => {
        requests.push(request);
        return true;
      },
    );

    await expect(chooseAdditionalSheetGlue(3)).resolves.toBe(true);

    expect(requests).toEqual([
      {
        title: "Add glue margins for additional sheets?",
        description:
          "This handout has 3 A4 pages, which uses 2 physical sheets when printed double-sided and flipped on the long edge. Glue margins begin on the second sheet.",
        confirmLabel: "Add glue margins",
        cancelLabel: "No margins",
      },
    ]);
  });

  it("renders the glue-margin choice in the reserved handout window", async () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const previewWindow = frame.contentWindow;
    expect(previewWindow).not.toBeNull();
    if (!previewWindow) return;

    try {
      const decision = createAdditionalSheetGlueWindowChooser(previewWindow)(4);
      const dialog = previewWindow.document.querySelector<HTMLElement>(
        '[role="dialog"]',
      );

      expect(dialog).toHaveAccessibleName(
        "Add glue margins for additional sheets?",
      );
      expect(dialog).toHaveTextContent(
        "This handout has 4 A4 pages, which uses 2 physical sheets when printed double-sided and flipped on the long edge. Glue margins begin on the second sheet.",
      );
      const addButton = Array.from(
        previewWindow.document.querySelectorAll("button"),
      ).find((button) => button.textContent === "Add glue margins");
      expect(addButton?.tagName).toBe("BUTTON");
      addButton?.click();
      await expect(decision).resolves.toBe(true);
    } finally {
      frame.remove();
    }
  });

  it.each(["Escape", "close button"])(
    "treats %s dismissal in the reserved handout window as No margins",
    async (dismissal) => {
      const frame = document.createElement("iframe");
      document.body.append(frame);
      const previewWindow = frame.contentWindow;
      expect(previewWindow).not.toBeNull();
      if (!previewWindow) return;

      try {
        const decision = createAdditionalSheetGlueWindowChooser(previewWindow)(
          3,
        );
        if (dismissal === "Escape") {
          previewWindow.document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape" }),
          );
        } else {
          previewWindow.document
            .querySelector<HTMLButtonElement>(
              'button[aria-label="Close notification"]',
            )
            ?.click();
        }
        await expect(decision).resolves.toBe(false);
      } finally {
        frame.remove();
      }
    },
  );

  it("forwards the optional glue-margin chooser after preparing selected handout slides", async () => {
    const document = currentHandoutDocument();
    document.slides.push(
      {
        id: "example-2",
        type: "example",
        title: "Example 2",
        lo: "102a: Factorise",
        image1: null,
        image2: null,
        answerImage1: null,
        answerImage2: null,
      },
      {
        id: "example-3",
        type: "example",
        title: "Example 3",
        lo: "103a: Expand",
        image1: null,
        image2: null,
        answerImage1: null,
        answerImage2: null,
      },
    );
    document.handoutSlideIds = ["starter", "example", "example-2", "example-3"];
    const pageCounts: number[] = [];

    const result = await prepareCurrentA4Handout(document, {
      prepareDocument: async (prepared) => prepared,
      chooseAdditionalSheetGlue: async (pageCount) => {
        pageCounts.push(pageCount);
        return true;
      },
    });

    expect(pageCounts).toEqual([3]);
    expect(result.html).toContain("handout-with-additional-sheet-glue");
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
  document.overallLessonLo = "Expand and simplify expressions";
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
