import { describe, expect, it } from "vitest";
import {
  coerceExampleSpacing,
  extractRetrievalLoCode,
  findExampleRetrievalItem,
  getExampleRetrievalBankStatus,
} from "@/features/builder/example";
import type { RetrievalItem } from "@/features/builder/schema";

describe("example authoring helpers", () => {
  it("extracts legacy LO codes and clamps spacing", () => {
    expect(extractRetrievalLoCode(" 101A: Expand brackets ")).toBe("101a");
    expect(extractRetrievalLoCode("Expand brackets")).toBe("");
    expect(coerceExampleSpacing(0.5)).toBe(1);
    expect(coerceExampleSpacing(1.36)).toBe(1.4);
    expect(coerceExampleSpacing(3)).toBe(2);
  });

  it("matches an active-class item by LO code", () => {
    const items = [
      retrievalItem({
        id: "year-8",
        lo: "101a: Earlier wording",
        className: "Year 8",
      }),
      retrievalItem({
        id: "year-9",
        lo: "101a: Earlier wording",
        className: "Year 9",
      }),
    ];

    expect(
      findExampleRetrievalItem(
        items,
        "101A: Updated wording",
        " year 9 ",
      )?.id,
    ).toBe("year-9");
  });

  it("distinguishes shared content from class tracking", () => {
    const items = [
      retrievalItem({
        id: "shared-row",
        lo: "101a: Expand brackets",
        className: "Year 8",
        contentId: "content-101a",
      }),
    ];

    expect(
      getExampleRetrievalBankStatus(
        items,
        "101a: Expand a single bracket",
        "Year 9",
      ),
    ).toMatchObject({
      state: "shared",
      code: "101a",
      sharedItem: { id: "shared-row" },
    });
    expect(
      getExampleRetrievalBankStatus(
        items,
        "101a: Expand a single bracket",
        "Year 8",
      ),
    ).toMatchObject({
      state: "tracked",
      trackedItem: { id: "shared-row" },
    });
  });

  it("falls back to normalized LO text when no code is available", () => {
    const item = retrievalItem({
      id: "wording",
      lo: "Expand   a single bracket",
      className: "",
    });

    expect(
      findExampleRetrievalItem(
        [item],
        " expand a single bracket ",
        "Year 9",
      )?.id,
    ).toBe("wording");
  });
});

function retrievalItem(
  overrides: Partial<RetrievalItem> = {},
): RetrievalItem {
  return {
    id: "item",
    lo: "100a: Default learning objective",
    className: "Year 9",
    spacingFactor: 1.3,
    seenCount: 0,
    currentImageSlot: 1,
    lastTaught: "2026-01-01",
    selected: false,
    images: [],
    answerImages: [],
    ...overrides,
  };
}
