import { describe, expect, it } from "vitest";
import { presenterStrokeWidth } from "@/features/presenter/annotations";

describe("presenter logical stroke width", () => {
  it.each([
    [2, 800, 1600, 4],
    [3, 1200, 1600, 4],
    [2, 800, 800, 2],
  ])("converts size %s from layout width %s into view box %s", (size, layout, viewBox, expected) => {
    expect(presenterStrokeWidth(size, layout, viewBox, "pen")).toBe(expected);
  });

  it("preserves the highlighter minimum and four-times pen multiplier", () => {
    expect(presenterStrokeWidth(2, 800, 1600, "highlighter")).toBe(18);
    expect(presenterStrokeWidth(4, 800, 1600, "highlighter")).toBe(32);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("uses one-to-one fallback for invalid layout width %s", (layout) => {
    expect(presenterStrokeWidth(2, layout, 1600, "pen")).toBe(2);
    expect(presenterStrokeWidth(2, layout, 1600, "highlighter")).toBe(18);
  });

  it("sanitizes invalid size and view-box dimensions", () => {
    expect(presenterStrokeWidth(Number.NaN, 800, 1600, "pen")).toBe(4);
    expect(presenterStrokeWidth(-2, 800, 1600, "pen")).toBe(1);
    expect(presenterStrokeWidth(2, 800, 0, "pen")).toBe(4);
    expect(presenterStrokeWidth(2, 800, Number.NaN, "pen")).toBe(4);
  });
});
