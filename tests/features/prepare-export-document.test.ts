import { describe, expect, it, vi } from "vitest";
import { prepareBuilderDocumentForExport } from "@/features/builder/prepare-export-document";
import { hydrateLiveRetrievalAssets } from "@/features/builder/live-retrieval-assets";
import {
  createInitialBuilderDocument,
  type BuilderAsset,
  type RetrievalItem,
} from "@/features/builder/schema";

describe("builder output preparation", () => {
  it("hydrates then embeds exactly once without mutating the source", async () => {
    const source = createInitialBuilderDocument("2026-08-03T00:00:00.000Z");
    source.slides = [revisionSlide("https://expired.test/question.png")];
    const hydrated = structuredClone(source);
    const item = hydrated.slides[0];
    if (item.type !== "revision") throw new Error("Expected revision slide");
    revisionItems(item)[0].image!.dataUrl = "https://fresh.test/question.png";
    revisionItems(item)[0].answerImage!.dataUrl = "https://fresh.test/answer.png";
    const embedded = structuredClone(hydrated);
    const embeddedItem = embedded.slides[0];
    if (embeddedItem.type !== "revision") throw new Error("Expected revision slide");
    revisionItems(embeddedItem)[0].image!.dataUrl = "data:image/png;base64,ZnJlc2gtcQ==";
    revisionItems(embeddedItem)[0].answerImage!.dataUrl = "data:image/png;base64,ZnJlc2gtYQ==";
    const order: string[] = [];
    const hydrate = vi.fn(async (document) => {
      order.push("hydrate");
      expect(document).toBe(source);
      return hydrated;
    });
    const embed = vi.fn(async (document, options) => {
      order.push("embed");
      expect(document).toBe(hydrated);
      expect(options).toEqual({
        managedAssetFailure: "throw",
        traversalScope: "slides",
      });
      return embedded;
    });

    const result = await prepareBuilderDocumentForExport(
      source,
      source.retrievalItems,
      { hydrate, embed },
    );

    expect(order).toEqual(["hydrate", "embed"]);
    expect(hydrate).toHaveBeenCalledOnce();
    expect(embed).toHaveBeenCalledOnce();
    expect(result).toBe(embedded);
    const original = source.slides[0];
    if (original.type !== "revision") throw new Error("Expected revision slide");
    expect(revisionItems(original)[0].image?.dataUrl).toBe(
      "https://expired.test/question.png",
    );
  });

  it("uses real revision hydration and embedding to produce a self-contained pair", async () => {
    const source = createInitialBuilderDocument("2026-08-03T03:00:00.000Z");
    source.className = "Year 7";
    source.retrievalItems = [retrievalItem()];
    source.slides = [revisionSlide("https://expired.test/question.png")];
    const original = structuredClone(source);
    const resolver = vi.fn(async () => [
      {
        requestKey: "request-0",
        itemId: "item-1",
        contentId: "content-1",
        currentImageSlot: 2,
        questionImage: managedAsset(
          "https://fresh.test/question.png",
          "fresh-question",
        ),
        answerImage: managedAsset(
          "https://fresh.test/answer.png",
          "fresh-answer",
        ),
      },
    ]);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      new Response(String(input).includes("answer") ? "answer" : "question", {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    const prepared = await prepareBuilderDocumentForExport(
      source,
      source.retrievalItems,
      {
        hydrate: (document, items) =>
          hydrateLiveRetrievalAssets(document, items, resolver),
      },
    );

    const pair = revisionItems(prepared.slides[0])[0];
    expect(pair.image?.dataUrl).toBe(
      "data:image/png;base64,cXVlc3Rpb24=",
    );
    expect(pair.answerImage?.dataUrl).toBe(
      "data:image/png;base64,YW5zd2Vy",
    );
    expect(JSON.stringify(prepared)).not.toContain("expired.test");
    expect(source).toEqual(original);
  });
});

function revisionSlide(questionUrl: string) {
  return {
    id: "revision",
    type: "revision" as const,
    title: "Revision",
    items: [
      {
        lo: "101a: Expand",
        seenCount: 2,
        retrievalItemId: "item-1",
        image: managedAsset(questionUrl, "question"),
        answerImage: managedAsset("https://expired.test/answer.png", "answer"),
      },
    ],
  };
}

function managedAsset(url: string, name: string) {
  return {
    name: `${name}.png`,
    type: "image/png",
    size: 1,
    dataUrl: url,
    assetId: `${name}-asset`,
    storagePath: `global/${name}.png`,
  };
}

function retrievalItem(): RetrievalItem {
  return {
    id: "item-1",
    contentId: "content-1",
    lo: "101a: Expand",
    className: "Year 7",
    spacingFactor: 1,
    seenCount: 2,
    currentImageSlot: 2,
    selected: false,
    images: [],
    answerImages: [],
  };
}

function revisionItems(slide: unknown) {
  return (slide as { items: unknown }).items as Array<{
    image: BuilderAsset | null;
    answerImage: BuilderAsset | null;
  }>;
}
