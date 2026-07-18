import { describe, expect, it } from "vitest";
import {
  compareRetrievalItems,
  getDueRetrievalItems,
  getVisibleRetrievalItems,
  incrementRetrievalImageSlot,
  normalizeImageSlots,
} from "@/features/builder/retrieval";
import type { RetrievalItem } from "@/features/builder/schema";

describe("retrieval authoring utilities", () => {
  it("filters by the active class while retaining shared items", () => {
    const items = [
      retrievalItem({ id: "year-9", className: " Year 9 " }),
      retrievalItem({ id: "shared", className: "" }),
      retrievalItem({ id: "year-10", className: "Year 10" }),
    ];

    expect(
      getVisibleRetrievalItems(items, "year   9").map((item) => item.id),
    ).toEqual(["year-9", "shared"]);
  });

  it("selects and orders due items before future items", () => {
    const due = retrievalItem({
      id: "due",
      lo: "101a: Due",
      lastTaught: "2026-01-01",
      seenCount: 1,
    });
    const future = retrievalItem({
      id: "future",
      lo: "102a: Future",
      lastTaught: "2026-07-17",
      seenCount: 2,
    });

    expect(getDueRetrievalItems([future, due], "", "2026-07-18")).toEqual([
      due,
    ]);
    expect(compareRetrievalItems(due, future, "2026-07-18")).toBeLessThan(0);
  });

  it("normalizes eight image slots and wraps the image pointer", () => {
    expect(normalizeImageSlots(["first"])).toEqual([
      "first",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(incrementRetrievalImageSlot(8)).toBe(1);
    expect(incrementRetrievalImageSlot(3)).toBe(4);
  });
});

function retrievalItem(
  overrides: Partial<RetrievalItem> = {},
): RetrievalItem {
  return {
    id: "item",
    lo: "100a: Default learning objective",
    className: "",
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
