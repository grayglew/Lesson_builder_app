import { describe, expect, it } from "vitest";
import {
  createDrawingStroke,
  normalizeDrawingPoint,
  parseDrawingResolution,
} from "@/features/builder/drawing";

describe("drawing helpers", () => {
  it("normalizes and clamps pointer coordinates", () => {
    expect(
      normalizeDrawingPoint(150, 125, {
        left: 100,
        top: 100,
        width: 200,
        height: 100,
      }),
    ).toEqual({ x: 0.25, y: 0.25 });
    expect(
      normalizeDrawingPoint(500, 0, {
        left: 100,
        top: 100,
        width: 200,
        height: 100,
      }),
    ).toEqual({ x: 1, y: 0 });
  });

  it("accepts only supported high-resolution canvas sizes", () => {
    expect(parseDrawingResolution("1600x1000")).toEqual({
      width: 1600,
      height: 1000,
    });
    expect(parseDrawingResolution("800x500")).toBeNull();
    expect(parseDrawingResolution("invalid")).toBeNull();
  });

  it("stores pen width relative to the canvas height", () => {
    expect(
      createDrawingStroke("eraser", "#ffffff", 4, 1600, { x: 0.5, y: 0.5 }),
    ).toEqual({
      mode: "eraser",
      color: "#ffffff",
      sizeRatio: 0.0025,
      points: [{ x: 0.5, y: 0.5 }],
    });
  });
});
