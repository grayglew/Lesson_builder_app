import { describe, expect, it } from "vitest";
import {
  fileToBuilderAsset,
  getRetrievalNextDueDate,
  isRetrievalItemDue,
  selectDueStarterItems,
} from "@/features/builder/starter";
import type { RetrievalItem } from "@/features/builder/schema";

describe("starter retrieval scheduling", () => {
  it("matches the legacy quadratic spacing calculation", () => {
    const item = retrievalItem({
      seenCount: 3,
      spacingFactor: 1.3,
      lastTaught: "2026-01-01",
    });

    expect(getRetrievalNextDueDate(item, "2026-02-01")).toBe("2026-01-09");
    expect(isRetrievalItemDue(item, "2026-01-08")).toBe(false);
    expect(isRetrievalItemDue(item, "2026-01-09")).toBe(true);
  });

  it("uses the teaching date when an item has never been taught", () => {
    const item = retrievalItem({
      seenCount: 0,
      lastTaught: "",
    });

    expect(getRetrievalNextDueDate(item, "2026-03-17")).toBe("2026-03-17");
    expect(isRetrievalItemDue(item, "2026-03-17")).toBe(true);
  });

  it("matches legacy spacing fallback and clamping", () => {
    expect(
      getRetrievalNextDueDate(
        retrievalItem({
          seenCount: 2,
          spacingFactor: 0,
          lastTaught: "2026-01-01",
        }),
        "2026-02-01",
      ),
    ).toBe("2026-01-05");
    expect(
      getRetrievalNextDueDate(
        retrievalItem({
          seenCount: 2,
          spacingFactor: 9,
          lastTaught: "2026-01-01",
        }),
        "2026-02-01",
      ),
    ).toBe("2026-01-07");
  });
});

describe("due starter selection", () => {
  it("keeps matching and unassigned classes while excluding other classes", () => {
    const items = [
      retrievalItem({ id: "matching", className: " Year   9 ", lo: "101a: Match" }),
      retrievalItem({ id: "shared", className: "", lo: "102a: Shared" }),
      retrievalItem({ id: "other", className: "Year 10", lo: "103a: Other" }),
    ];

    expect(
      selectDueStarterItems(items, "year 9", "2026-02-01").map((item) => item.id),
    ).toEqual(["matching", "shared"]);
  });

  it("prioritizes different numbered LO families before repeating one", () => {
    const items = [
      retrievalItem({ id: "101a", lo: "101a: First family", lastTaught: "2026-01-01" }),
      retrievalItem({ id: "101b", lo: "101b: Same family", lastTaught: "2026-01-02" }),
      retrievalItem({ id: "102a", lo: "102a: Second family", lastTaught: "2026-01-03" }),
      retrievalItem({ id: "103a", lo: "103a: Third family", lastTaught: "2026-01-04" }),
    ];

    expect(
      selectDueStarterItems(items, "", "2026-02-01", 3).map((item) => item.id),
    ).toEqual(["101a", "102a", "103a"]);
  });

  it("fills remaining spaces with repeated families after diverse choices", () => {
    const items = [
      retrievalItem({ id: "101a", lo: "101a: First", lastTaught: "2026-01-01" }),
      retrievalItem({ id: "101b", lo: "101b: Second", lastTaught: "2026-01-02" }),
      retrievalItem({ id: "102a", lo: "102a: Third", lastTaught: "2026-01-03" }),
    ];

    expect(
      selectDueStarterItems(items, "", "2026-02-01", 3).map((item) => item.id),
    ).toEqual(["101a", "102a", "101b"]);
  });

  it("sorts by next due date and never returns more than four", () => {
    const items = Array.from({ length: 7 }, (_, index) =>
      retrievalItem({
        id: `item-${index}`,
        lo: `${110 + index}a: Item ${index}`,
        lastTaught: `2026-01-${String(7 - index).padStart(2, "0")}`,
      }),
    );

    expect(
      selectDueStarterItems(items, "", "2026-02-01", 99).map((item) => item.id),
    ).toEqual(["item-6", "item-5", "item-4", "item-3"]);
  });

  it("excludes items due after the teaching date", () => {
    const items = [
      retrievalItem({ id: "due", lastTaught: "2026-01-01" }),
      retrievalItem({ id: "future", lastTaught: "2026-03-01" }),
    ];

    expect(
      selectDueStarterItems(items, "", "2026-02-01").map((item) => item.id),
    ).toEqual(["due"]);
  });
});

describe("starter image assets", () => {
  it("converts a browser File to the legacy-compatible asset shape", async () => {
    const file = new File(["starter-image"], "question.png", {
      type: "image/png",
    });

    await expect(fileToBuilderAsset(file)).resolves.toEqual({
      name: "question.png",
      type: "image/png",
      size: 13,
      dataUrl: "data:image/png;base64,c3RhcnRlci1pbWFnZQ==",
    });
  });
});

function retrievalItem(
  overrides: Partial<RetrievalItem> = {},
): RetrievalItem {
  return {
    id: "item",
    lo: "100a: Default learning objective",
    className: "",
    seenCount: 0,
    spacingFactor: 1.3,
    currentImageSlot: 1,
    lastTaught: "2026-01-01",
    ...overrides,
  };
}
