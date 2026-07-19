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
