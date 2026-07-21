import { describe, expect, it } from "vitest";
import {
  createImageDrawingStroke,
  imageDrawingPointFromClient,
} from "@/features/builder/image-drawing";

describe("image drawing helpers", () => {
  it("maps pointer coordinates into the production 2048 by 1536 canvas", () => {
    expect(
      imageDrawingPointFromClient(512, 384, {
        left: 0,
        top: 0,
        width: 1024,
        height: 768,
      }),
    ).toEqual({ x: 1024, y: 768 });
  });

  it("uses a wider translucent stroke for the highlighter", () => {
    const pen = createImageDrawingStroke(
      "pen",
      "#2563eb",
      8,
      1024,
      { x: 0, y: 0 },
    );
    const highlighter = createImageDrawingStroke(
      "highlighter",
      "#2563eb",
      8,
      1024,
      { x: 0, y: 0 },
    );

    expect(pen.size).toBe(16);
    expect(pen.opacity).toBe(1);
    expect(highlighter.size).toBe(64);
    expect(highlighter.opacity).toBe(0.35);
  });
});
