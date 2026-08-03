import { describe, expect, it, vi } from "vitest";
import {
  prepareCurrentA4Handout,
  prepareCurrentOutputDocument,
} from "@/features/builder/useLessonExportActions";
import {
  createInitialBuilderDocument,
  type BuilderDocument,
} from "@/features/builder/schema";

describe("current lesson output preparation wiring", () => {
  it("prepares the current presenter/HTML/PDF document exactly once", async () => {
    const document = createInitialBuilderDocument();
    const prepared = structuredClone(document);
    const prepareDocument = vi.fn().mockResolvedValue(prepared);

    await expect(
      prepareCurrentOutputDocument(document, { prepareDocument }),
    ).resolves.toBe(prepared);
    expect(prepareDocument).toHaveBeenCalledOnce();
    expect(prepareDocument).toHaveBeenCalledWith(
      document,
      document.retrievalItems,
    );
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
    expect(result.html).toContain('aria-label="Handout page 1"');
  });
});

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
