import { describe, expect, it, vi } from "vitest";
import {
  hydrateLiveStarterSlots,
  type LiveStarterImageResolver,
} from "@/features/builder/live-starter";
import { buildStandaloneLessonHtml } from "@/features/builder/lesson-export";
import {
  createInitialBuilderDocument,
  type BuilderAsset,
  type RetrievalItem,
  type StarterSlot,
} from "@/features/builder/schema";

describe("live starter hydration", () => {
  it("hydrates all four presenter quadrants from the global retrieval bank", async () => {
    const document = createInitialBuilderDocument();
    document.className = "Year 7";
    document.slides = [
      {
        id: "starter",
        type: "starter",
        title: "Starter",
        slots: [
          {
            lo: "",
            retrievalItemId: "item-1",
            currentImageSlot: 2,
            lockImageSlot: true,
          },
          { lo: " 102a:   Factorise ", currentImageSlot: 1 },
          { lo: "", retrievalItemId: "legacy-3", currentImageSlot: 1 },
          { lo: "", retrievalItemId: "item-4", currentImageSlot: 1 },
        ],
      },
    ];
    const retrievalItems = [
      retrievalItem("item-1", "101a: Expand", 6),
      retrievalItem("item-2", "102a: Factorise", 4),
      retrievalItem("item-3", "103a: Simplify", 3),
      retrievalItem("item-4", "104a: Solve", 8),
    ];
    retrievalItems[2].legacyJsonId = "legacy-3";
    const resolver = vi.fn(
      async (items: RetrievalItem[]) =>
        items.map((item) => ({
          itemId: item.id,
          currentImageSlot: item.currentImageSlot,
          questionImage: asset(`${item.id}-question.png`),
          answerImage: asset(`${item.id}-answer.png`),
        })),
    );

    const hydrated = await hydrateLiveStarterSlots(
      document,
      retrievalItems,
      resolver as LiveStarterImageResolver,
    );

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver.mock.calls[0]?.[0].map((item) => item.currentImageSlot)).toEqual([
      2,
      4,
      3,
      8,
    ]);
    const starter = hydrated.slides[0];
    expect(starter.type).toBe("starter");
    if (starter.type !== "starter") throw new Error("Expected starter slide.");
    const slots = (starter as { slots: StarterSlot[] }).slots;
    expect(slots.map((slot) => slot.lo)).toEqual([
      "101a: Expand",
      "102a:   Factorise",
      "103a: Simplify",
      "104a: Solve",
    ]);
    expect(slots.map((slot) => slot.retrievalItemId)).toEqual([
      "item-1",
      "item-2",
      "item-3",
      "item-4",
    ]);
    expect(slots[0].image?.name).toBe("item-1-question.png");

    const html = buildStandaloneLessonHtml(hydrated, {
      liveRetrieval: {
        enabled: true,
        endpoint: "/api/presenter/retrieval-log",
        nextEndpoint: "/api/presenter/retrieval-next",
        lessonId: "lesson-id",
        className: "Year 7",
        teachingDate: "2026-07-19",
      },
    });
    expect(html.match(/aria-label="Seen \+1"/g)).toHaveLength(4);
    expect(html.match(/aria-label="Seen -1"/g)).toHaveLength(4);
    expect(html.match(/aria-label="Next retrieval question"/g)).toHaveLength(4);
  });

  it("keeps the existing starter usable when current-image resolution fails", async () => {
    const document = createInitialBuilderDocument();
    const existingImage = asset("existing.png");
    document.slides = [
      {
        id: "starter",
        type: "starter",
        title: "Starter",
        slots: [
          {
            lo: "",
            retrievalItemId: "item-1",
            image: existingImage,
          },
        ],
      },
    ];
    const resolver = vi.fn(async () => {
      throw new Error("offline");
    });

    const hydrated = await hydrateLiveStarterSlots(
      document,
      [retrievalItem("item-1", "101a: Expand", 3)],
      resolver as LiveStarterImageResolver,
    );
    const starter = hydrated.slides[0];
    expect(starter.type).toBe("starter");
    if (starter.type !== "starter") throw new Error("Expected starter slide.");
    const slots = (starter as { slots: StarterSlot[] }).slots;
    expect(slots[0].lo).toBe("101a: Expand");
    expect(slots[0].image).toEqual(existingImage);
    expect(document.slides[0]).not.toBe(starter);
  });

  it("recovers a legacy starter link from a unique class-scoped image identity", async () => {
    const document = createInitialBuilderDocument();
    document.className = "Year 7";
    const legacyImage = {
      ...asset("legacy-question.png"),
      assetId: "asset-question-1",
      storagePath: "retrieval/year-7/question-1.png",
      checksum: "ABC123",
    };
    document.slides = [
      {
        id: "starter",
        type: "starter",
        title: "Starter",
        slots: [
          {
            lo: "",
            retrievalItemId: "retired-json-id",
            image: legacyImage,
          },
        ],
      },
    ];
    const matching = retrievalItem("current-item", "101a: Expand", 4);
    matching.images = [
      {
        ...asset("current-question.png"),
        assetId: "ASSET-QUESTION-1",
        storagePath: "retrieval/year-7/question-1.png",
        checksum: "abc123",
      },
    ];
    const wrongClass = retrievalItem("wrong-class", "201a: Fractions", 2);
    wrongClass.className = "Year 8";
    wrongClass.images = [legacyImage];
    const resolver = vi.fn(async (items: RetrievalItem[]) =>
      items.map((item) => ({
        itemId: item.id,
        currentImageSlot: item.currentImageSlot,
        questionImage: item.images[0] || null,
        answerImage: null,
      })),
    );

    const hydrated = await hydrateLiveStarterSlots(
      document,
      [wrongClass, matching],
      resolver as LiveStarterImageResolver,
    );
    const starter = hydrated.slides[0];
    expect(starter.type).toBe("starter");
    if (starter.type !== "starter") throw new Error("Expected starter slide.");
    const slot = (starter as { slots: StarterSlot[] }).slots[0];
    expect(slot.lo).toBe("101a: Expand");
    expect(slot.retrievalItemId).toBe("current-item");
    expect(slot.currentImageSlot).toBe(4);
    expect(resolver).toHaveBeenCalledWith([matching], "current");

    const html = buildStandaloneLessonHtml(hydrated, {
      liveRetrieval: {
        enabled: true,
        endpoint: "/api/presenter/retrieval-log",
        nextEndpoint: "/api/presenter/retrieval-next",
        lessonId: "lesson-id",
        className: "Year 7",
        teachingDate: "2026-07-19",
      },
    });
    expect(html).toContain('aria-label="Seen +1"');
    expect(html).toContain('aria-label="Seen -1"');
    expect(html).toContain('aria-label="Next retrieval question"');
  });

  it("does not guess when an image identity matches multiple retrieval items", async () => {
    const document = createInitialBuilderDocument();
    document.className = "Year 7";
    const sharedImage = {
      ...asset("shared.png"),
      storagePath: "retrieval/year-7/shared.png",
    };
    document.slides = [
      {
        id: "starter",
        type: "starter",
        title: "Starter",
        slots: [{ lo: "", image: sharedImage }],
      },
    ];
    const first = retrievalItem("first", "101a: Expand", 1);
    const second = retrievalItem("second", "102a: Factorise", 1);
    first.images = [sharedImage];
    second.images = [sharedImage];
    const resolver = vi.fn();

    const hydrated = await hydrateLiveStarterSlots(
      document,
      [first, second],
      resolver as LiveStarterImageResolver,
    );
    const starter = hydrated.slides[0];
    expect(starter.type).toBe("starter");
    if (starter.type !== "starter") throw new Error("Expected starter slide.");
    expect((starter as { slots: StarterSlot[] }).slots[0].lo).toBe("");
    expect(resolver).not.toHaveBeenCalled();
  });
});

function retrievalItem(
  id: string,
  lo: string,
  currentImageSlot: number,
): RetrievalItem {
  return {
    id,
    lo,
    className: "Year 7",
    spacingFactor: 1.3,
    currentImageSlot,
    seenCount: 0,
    selected: false,
    images: [],
    answerImages: [],
  };
}

function asset(name: string): BuilderAsset {
  return {
    name,
    type: "image/png",
    size: 4,
    dataUrl: "data:image/png;base64,dGVzdA==",
  };
}
