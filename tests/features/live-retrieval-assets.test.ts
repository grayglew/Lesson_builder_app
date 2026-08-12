import { describe, expect, it, vi } from "vitest";
import { hydrateLiveRetrievalAssets } from "@/features/builder/live-retrieval-assets";
import {
  createInitialBuilderDocument,
  type BuilderAsset,
  type BuilderSlide,
  type RetrievalItem,
  type StarterSlot,
} from "@/features/builder/schema";

describe("live retrieval asset hydration", () => {
  it("refreshes expired revision pairs before presenter export", async () => {
    const document = createInitialBuilderDocument();
    document.className = "Year 7";
    document.retrievalItems = [retrievalItem("item-1", "101a: Expand", 3)];
    document.slides = [
      {
        id: "revision-1",
        type: "revision",
        title: "Revision",
        items: [
          {
            lo: "101a: Expand",
            seenCount: 3,
            retrievalItemId: "item-1",
            image: remoteAsset("expired-question"),
            answerImage: remoteAsset("expired-answer"),
          },
        ],
      },
    ];
    const resolver = vi.fn(async (items: RetrievalItem[], mode: "current" | "seen" | "all") => {
      expect(mode).toBe("seen");
      expect(items[0]).toMatchObject({ id: "item-1", seenCount: 3 });
      return [
        {
          requestKey: "request-0",
          itemId: "item-1",
          contentId: "content-1",
          currentImageSlot: 3,
          questionImage: embeddedAsset("fresh-question"),
          answerImage: embeddedAsset("fresh-answer"),
        },
      ];
    });
    const sourceDocument = structuredClone(document);

    const hydrated = await hydrateLiveRetrievalAssets(
      document,
      document.retrievalItems,
      resolver,
    );

    const items = revisionItems(hydrated.slides[0]);
    expect(hydrated.slides[0]).not.toBe(document.slides[0]);
    expect(items[0]?.seenCount).toBe(3);
    expect(items[0]?.image?.dataUrl).toContain("fresh-question");
    expect(items[0]?.answerImage?.dataUrl).toContain("fresh-answer");
    expect(revisionItems(document.slides[0])[0]?.image?.dataUrl).toContain(
      "expired-question",
    );
    expect(revisionItems(document.slides[0])[0]?.answerImage?.dataUrl).toContain(
      "expired-answer",
    );
    expect(document).toEqual(sourceDocument);
  });

  it("refreshes a revision item by its exact id even when it came from another class", async () => {
    const document = createInitialBuilderDocument();
    document.className = "10Ma1";
    document.slides = [
      {
        id: "revision-1",
        type: "revision",
        title: "Revision copied from another class",
        items: [
          {
            lo: "501b: Expand using Pascal's triangle",
            seenCount: 2,
            retrievalItemId: "9l2fm-item",
            image: remoteAsset("expired-cross-class-question"),
            answerImage: remoteAsset("expired-cross-class-answer"),
          },
        ],
      },
    ];
    const source = retrievalItem(
      "9l2fm-item",
      "501b: Expand using Pascal's triangle",
      2,
    );
    source.className = "9L2FM";
    const resolver = vi.fn(async (items: RetrievalItem[]) => {
      expect(items).toEqual([
        expect.objectContaining({
          id: "9l2fm-item",
          className: "9L2FM",
          seenCount: 2,
        }),
      ]);
      return [
        {
          requestKey: "request-0",
          itemId: "9l2fm-item",
          currentImageSlot: 2,
          questionImage: embeddedAsset("fresh-cross-class-question"),
          answerImage: embeddedAsset("fresh-cross-class-answer"),
        },
      ];
    });

    const hydrated = await hydrateLiveRetrievalAssets(
      document,
      [source],
      resolver,
    );

    const item = revisionItems(hydrated.slides[0])[0];
    expect(resolver).toHaveBeenCalledOnce();
    expect(item?.image?.dataUrl).toContain("fresh-cross-class-question");
    expect(item?.answerImage?.dataUrl).toContain("fresh-cross-class-answer");
  });

  it("refreshes a saved revision by its exact id when the browser catalogue is missing it", async () => {
    const document = createInitialBuilderDocument();
    document.className = "10Ma1";
    document.slides = [
      {
        id: "revision-1",
        type: "revision",
        title: "Revision copied from another class",
        items: [
          {
            lo: "501b: Expand using Pascal's triangle",
            seenCount: 2,
            retrievalItemId: "88968498-c80e-47ed-980c-e58d27985a2b",
            className: "9L2FM",
            image: remoteAsset("expired-missing-catalogue-question"),
            answerImage: remoteAsset("expired-missing-catalogue-answer"),
          },
        ],
      },
    ];
    const resolver = vi.fn(async (items: RetrievalItem[]) => {
      expect(items).toEqual([
        expect.objectContaining({
          id: "88968498-c80e-47ed-980c-e58d27985a2b",
          className: "9L2FM",
          seenCount: 2,
        }),
      ]);
      return [
        {
          requestKey: "request-0",
          itemId: "88968498-c80e-47ed-980c-e58d27985a2b",
          currentImageSlot: 2,
          questionImage: embeddedAsset("fresh-missing-catalogue-question"),
          answerImage: embeddedAsset("fresh-missing-catalogue-answer"),
        },
      ];
    });

    const hydrated = await hydrateLiveRetrievalAssets(document, [], resolver);

    expect(resolver).toHaveBeenCalledOnce();
    expect(revisionItems(hydrated.slides[0])[0]?.image?.dataUrl).toContain(
      "fresh-missing-catalogue-question",
    );
  });

  it("recovers the exact retrieval id from a legacy managed asset path", async () => {
    const document = createInitialBuilderDocument();
    document.className = "10Ma1";
    document.slides = [
      {
        id: "revision-1",
        type: "revision",
        title: "Legacy revision copied from another class",
        items: [
          {
            lo: "501b: Expand using Pascal's triangle",
            seenCount: 2,
            retrievalItemId: "11111111-1111-4111-8111-111111111111",
            className: "9L2FM",
            image: {
              ...remoteAsset("expired-legacy-question"),
              storagePath:
                "225f2092-e96f-4065-bf8f-0d68d7c3cf78/retrieval/88968498-c80e-47ed-980c-e58d27985a2b/question-2-964dd7c595869acb89b3c3bd.png",
            },
            answerImage: {
              ...remoteAsset("expired-legacy-answer"),
              storagePath:
                "225f2092-e96f-4065-bf8f-0d68d7c3cf78/retrieval/88968498-c80e-47ed-980c-e58d27985a2b/answer-2-c6b5ec8a.png",
            },
          },
        ],
      },
    ];
    const resolver = vi.fn(async (items: RetrievalItem[]) => {
      expect(items).toEqual([
        expect.objectContaining({
          id: "88968498-c80e-47ed-980c-e58d27985a2b",
          className: "9L2FM",
          seenCount: 2,
        }),
      ]);
      return [
        {
          requestKey: "request-0",
          itemId: "88968498-c80e-47ed-980c-e58d27985a2b",
          currentImageSlot: 2,
          questionImage: embeddedAsset("fresh-legacy-question"),
          answerImage: embeddedAsset("fresh-legacy-answer"),
        },
      ];
    });

    const hydrated = await hydrateLiveRetrievalAssets(document, [], resolver);

    expect(resolver).toHaveBeenCalledOnce();
    expect(revisionItems(hydrated.slides[0])[0]?.image?.dataUrl).toContain(
      "fresh-legacy-question",
    );
  });

  it("does not match another class by LO wording alone", async () => {
    const document = createInitialBuilderDocument();
    document.className = "10Ma1";
    document.slides = [
      {
        id: "revision-1",
        type: "revision",
        title: "Revision",
        items: [
          {
            lo: "501b: Expand using Pascal's triangle",
            seenCount: 2,
            image: remoteAsset("expired-unlinked-question"),
          },
        ],
      },
    ];
    const otherClass = retrievalItem(
      "9l2fm-item",
      "501b: Expand using Pascal's triangle",
      2,
    );
    otherClass.className = "9L2FM";
    const resolver = vi.fn();

    const hydrated = await hydrateLiveRetrievalAssets(
      document,
      [otherClass],
      resolver,
    );

    expect(resolver).not.toHaveBeenCalled();
    expect(revisionItems(hydrated.slides[0])[0]?.image?.dataUrl).toContain(
      "expired-unlinked-question",
    );
  });

  it("recovers a legacy revision link from a unique class-scoped asset identity", async () => {
    const document = createInitialBuilderDocument();
    document.className = "Year 7";
    const legacyImage = {
      ...remoteAsset("legacy-question"),
      storagePath: "retrieval/year-7/legacy-question.png",
    };
    document.slides = [
      {
        id: "revision-1",
        type: "revision",
        title: "Revision",
        items: [
          {
            lo: "101a: Expand",
            seenCount: 4,
            image: legacyImage,
          },
        ],
      },
    ];
    const matching = retrievalItem("current-item", "101a: Expand", 4);
    matching.images = [
      {
        ...embeddedAsset("stored-question"),
        storagePath: "retrieval/year-7/legacy-question.png",
      },
    ];
    const wrongClass = retrievalItem("wrong-class", "101a: Expand", 2);
    wrongClass.className = "Year 8";
    wrongClass.images = [legacyImage];
    const resolver = vi.fn(async (items: RetrievalItem[], mode: "current" | "seen" | "all") => {
      expect(mode).toBe("seen");
      expect(items).toEqual([expect.objectContaining({ id: "current-item", seenCount: 4 })]);
      return [
        {
          requestKey: "request-0",
          itemId: "current-item",
          contentId: "content-1",
          currentImageSlot: 4,
          questionImage: embeddedAsset("fresh-legacy-question"),
          answerImage: embeddedAsset("fresh-legacy-answer"),
        },
      ];
    });

    const hydrated = await hydrateLiveRetrievalAssets(
      document,
      [wrongClass, matching],
      resolver,
    );

    const item = revisionItems(hydrated.slides[0])[0];
    expect(item?.retrievalItemId).toBe("current-item");
    expect(item?.currentImageSlot).toBe(4);
    expect(item?.image?.dataUrl).toContain("fresh-legacy-question");
  });

  it("does not guess when a legacy revision asset identity matches multiple items", async () => {
    const document = createInitialBuilderDocument();
    document.className = "Year 7";
    const sharedImage = {
      ...remoteAsset("shared-question"),
      storagePath: "retrieval/year-7/shared-question.png",
    };
    document.slides = [
      {
        id: "revision-1",
        type: "revision",
        title: "Revision",
        items: [{ lo: "", seenCount: 1, image: sharedImage }],
      },
    ];
    const first = retrievalItem("first", "101a: Expand", 1);
    const second = retrievalItem("second", "102a: Factorise", 1);
    first.images = [sharedImage];
    second.images = [sharedImage];
    const resolver = vi.fn();

    const hydrated = await hydrateLiveRetrievalAssets(
      document,
      [first, second],
      resolver,
    );

    expect(resolver).not.toHaveBeenCalled();
    expect(revisionItems(hydrated.slides[0])[0]).toMatchObject({
      lo: "",
      seenCount: 1,
      image: sharedImage,
    });
    expect(revisionItems(hydrated.slides[0])[0]?.retrievalItemId).toBeUndefined();
    expect(revisionItems(hydrated.slides[0])[0]?.currentImageSlot).toBeUndefined();
  });

  it("hydrates starter and revision assets in their respective live modes", async () => {
    const document = createInitialBuilderDocument();
    document.className = "Year 7";
    document.slides = [
      {
        id: "starter-1",
        type: "starter",
        title: "Starter",
        slots: [{ lo: "101a: Expand", retrievalItemId: "starter-item" }],
      },
      {
        id: "revision-1",
        type: "revision",
        title: "Revision",
        items: [{ lo: "102a: Factorise", seenCount: 2, retrievalItemId: "revision-item" }],
      },
    ];
    const starter = retrievalItem("starter-item", "101a: Expand", 1);
    const revision = retrievalItem("revision-item", "102a: Factorise", 2);
    const resolver = vi.fn(async (items: RetrievalItem[], mode: "current" | "seen" | "all") => {
      const item = items[0];
      return [
        {
          requestKey: "request-0",
          itemId: item.id,
          contentId: `${item.id}-content`,
          currentImageSlot: item.currentImageSlot,
          questionImage: embeddedAsset(`${mode}-${item.id}-question`),
          answerImage: embeddedAsset(`${mode}-${item.id}-answer`),
        },
      ];
    });

    const hydrated = await hydrateLiveRetrievalAssets(
      document,
      [starter, revision],
      resolver,
    );

    expect(resolver.mock.calls.map(([, mode]) => mode)).toEqual(["current", "seen"]);
    expect(starterSlots(hydrated.slides[0])[0]?.image?.dataUrl).toContain(
      "current-starter-item-question",
    );
    expect(starterSlots(hydrated.slides[0])[0]?.answerImage?.dataUrl).toContain(
      "current-starter-item-answer",
    );
    expect(revisionItems(hydrated.slides[1])[0]?.image?.dataUrl).toContain(
      "seen-revision-item-question",
    );
    expect(revisionItems(hydrated.slides[1])[0]?.answerImage?.dataUrl).toContain(
      "seen-revision-item-answer",
    );
  });

  it("does not shift a later revision result onto an earlier item when a resolver response is partial", async () => {
    const document = createInitialBuilderDocument();
    document.className = "Year 7";
    const firstExisting = embeddedAsset("first-existing");
    document.slides = [
      {
        id: "revision-1",
        type: "revision",
        title: "Revision",
        items: [
          {
            lo: "101a: Expand",
            seenCount: 1,
            retrievalItemId: "first",
            image: firstExisting,
          },
          {
            lo: "102a: Factorise",
            seenCount: 2,
            retrievalItemId: "second",
          },
        ],
      },
    ];
    const resolver = vi.fn(async () => [
      {
        requestKey: "request-1",
        itemId: "second",
        contentId: "content-2",
        currentImageSlot: 2,
        questionImage: embeddedAsset("second-fresh-question"),
        answerImage: embeddedAsset("second-fresh-answer"),
      },
    ]);

    const hydrated = await hydrateLiveRetrievalAssets(
      document,
      [
        retrievalItem("first", "101a: Expand", 1),
        retrievalItem("second", "102a: Factorise", 2),
      ],
      resolver,
    );

    const items = revisionItems(hydrated.slides[0]);
    expect(items[0]?.image).toEqual(firstExisting);
    expect(items[1]?.image?.dataUrl).toContain("second-fresh-question");
  });

  it("uses request keys when a partial revision result has no other unique identity", async () => {
    const document = createInitialBuilderDocument();
    document.className = "Year 7";
    const firstExistingQuestion = embeddedAsset("first-shared-question");
    const firstExistingAnswer = embeddedAsset("first-shared-answer");
    const secondExistingQuestion = embeddedAsset("second-shared-question");
    const secondExistingAnswer = embeddedAsset("second-shared-answer");
    document.slides = [
      {
        id: "revision-1",
        type: "revision",
        title: "Revision",
        items: [
          {
            lo: "101a: Expand",
            seenCount: 1,
            retrievalItemId: "shared-item",
            contentId: "content-1",
            currentImageSlot: 1,
            image: firstExistingQuestion,
            answerImage: firstExistingAnswer,
          },
          {
            lo: "101a: Expand",
            seenCount: 1,
            retrievalItemId: "shared-item",
            contentId: "content-1",
            currentImageSlot: 1,
            image: secondExistingQuestion,
            answerImage: secondExistingAnswer,
          },
        ],
      },
    ];
    const shared = retrievalItem("shared-item", "101a: Expand", 1);
    shared.contentId = "content-1";
    const resolver = vi.fn(async (items: RetrievalItem[]) => {
      expect(items).toEqual([
        expect.objectContaining({
          id: "shared-item",
          contentId: "content-1",
          lo: "101a: Expand",
          className: "Year 7",
          seenCount: 1,
          currentImageSlot: 1,
        }),
        expect.objectContaining({
          id: "shared-item",
          contentId: "content-1",
          lo: "101a: Expand",
          className: "Year 7",
          seenCount: 1,
          currentImageSlot: 1,
        }),
      ]);
      return [
        {
          requestKey: "request-1",
          itemId: "shared-item",
          contentId: "content-1",
          currentImageSlot: 1,
          questionImage: embeddedAsset("second-shared-fresh-question"),
          answerImage: embeddedAsset("second-shared-fresh-answer"),
        },
      ];
    });

    const hydrated = await hydrateLiveRetrievalAssets(document, [shared], resolver);

    const items = revisionItems(hydrated.slides[0]);
    expect(items[0]?.image).toEqual(firstExistingQuestion);
    expect(items[0]?.answerImage).toEqual(firstExistingAnswer);
    expect(items[1]?.image?.dataUrl).toContain("second-shared-fresh-question");
    expect(items[1]?.answerImage?.dataUrl).toContain("second-shared-fresh-answer");
  });

  it("never falls back by position when a full revision response contains mixed duplicate request keys", async () => {
    const document = createInitialBuilderDocument();
    document.className = "Year 7";
    document.slides = [
      {
        id: "revision-1",
        type: "revision",
        title: "Revision",
        items: [
          {
            lo: "101a: Expand",
            seenCount: 1,
            retrievalItemId: "first",
            image: embeddedAsset("first-existing"),
          },
          {
            lo: "102a: Factorise",
            seenCount: 2,
            retrievalItemId: "second",
            image: embeddedAsset("second-existing"),
          },
          {
            lo: "103a: Simplify",
            seenCount: 3,
            retrievalItemId: "third",
            image: embeddedAsset("third-existing"),
          },
        ],
      },
    ];
    const resolver = vi.fn(async () => [
      {
        requestKey: "request-2",
        itemId: "third",
        currentImageSlot: 3,
        questionImage: embeddedAsset("third-fresh"),
        answerImage: embeddedAsset("third-fresh-answer"),
      },
      {
        requestKey: "request-2",
        itemId: "third-duplicate",
        currentImageSlot: 3,
        questionImage: embeddedAsset("duplicate-must-not-drift"),
        answerImage: null,
      },
      {
        itemId: "keyless-must-not-drift",
        currentImageSlot: 1,
        questionImage: embeddedAsset("keyless-must-not-drift"),
        answerImage: null,
      },
    ]);

    const hydrated = await hydrateLiveRetrievalAssets(
      document,
      [
        retrievalItem("first", "101a: Expand", 1),
        retrievalItem("second", "102a: Factorise", 2),
        retrievalItem("third", "103a: Simplify", 3),
      ],
      resolver,
    );

    const items = revisionItems(hydrated.slides[0]);
    expect(items[0]?.image?.dataUrl).toContain("first-existing");
    expect(items[1]?.image?.dataUrl).toContain("second-existing");
    expect(items[2]?.image?.dataUrl).toContain("third-fresh");
  });

  it("keeps renderable Starter pairs when combined hydration returns metadata-only assets", async () => {
    const document = createInitialBuilderDocument();
    document.className = "Year 7";
    const existingQuestion = embeddedAsset("starter-existing-question");
    const existingAnswer = embeddedAsset("starter-existing-answer");
    document.slides = [
      {
        id: "starter-1",
        type: "starter",
        title: "Starter",
        slots: [
          {
            lo: "101a: Expand",
            retrievalItemId: "starter-item",
            image: existingQuestion,
            answerImage: existingAnswer,
          },
        ],
      },
    ];
    const starter = retrievalItem("starter-item", "101a: Expand", 1);
    const resolver = vi.fn(async () => [
      {
        requestKey: "request-0",
        itemId: "starter-item",
        currentImageSlot: 1,
        questionImage: metadataAsset("metadata-question"),
        answerImage: metadataAsset("metadata-answer"),
      },
    ]);

    const hydrated = await hydrateLiveRetrievalAssets(
      document,
      [starter],
      resolver,
    );

    expect(starterSlots(hydrated.slides[0])[0]?.image).toEqual(existingQuestion);
    expect(starterSlots(hydrated.slides[0])[0]?.answerImage).toEqual(existingAnswer);
  });
});

function revisionItems(slide: BuilderSlide | undefined) {
  const items = (slide as { items?: unknown } | undefined)?.items;
  return Array.isArray(items)
    ? (items as Array<{
        lo?: string;
        seenCount?: number;
        retrievalItemId?: string;
        currentImageSlot?: number;
        image?: BuilderAsset | null;
        answerImage?: BuilderAsset | null;
      }>)
    : [];
}

function starterSlots(slide: BuilderSlide | undefined) {
  const slots = (slide as { slots?: unknown } | undefined)?.slots;
  return Array.isArray(slots) ? (slots as StarterSlot[]) : [];
}

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

function embeddedAsset(name: string): BuilderAsset {
  return {
    name: `${name}.png`,
    type: "image/png",
    size: 4,
    dataUrl: `data:image/png;base64,${name}`,
  };
}

function remoteAsset(name: string): BuilderAsset {
  return {
    name: `${name}.png`,
    type: "image/png",
    size: 4,
    dataUrl: `https://storage.example/${name}.png?token=expired`,
  };
}

function metadataAsset(name: string): BuilderAsset {
  return {
    name: `${name}.png`,
    type: "image/png",
    size: 4,
    dataUrl: "",
    storagePath: `retrieval/${name}.png`,
  };
}
