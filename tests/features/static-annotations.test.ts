import { describe, expect, it } from "vitest";
import { renderStaticAnnotationSvg } from "@/features/builder/static-annotations";

describe("static annotation SVG", () => {
  it("renders normalized pen and highlighter strokes with presenter geometry", () => {
    const html = renderStaticAnnotationSvg([
      {
        id: "pen-1",
        mode: "pen",
        color: "#dc2626",
        width: 6,
        points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
      },
      {
        id: "highlighter-1",
        mode: "highlighter",
        color: "#facc15",
        width: 24,
        opacity: 0.35,
        points: [{ x: 50, y: 60 }],
      },
    ]);

    expect(html).toContain('viewBox="0 0 1600 1000"');
    expect(html).toContain('d="M10 20 L30 40"');
    expect(html).toContain('stroke="#dc2626"');
    expect(html).toContain('stroke-width="6"');
    expect(html).toContain('d="M50 60 l0.1 0"');
    expect(html).toContain('stroke-opacity="0.35"');
  });

  it("omits empty and invalid annotation arrays", () => {
    expect(renderStaticAnnotationSvg([])).toBe("");
    expect(renderStaticAnnotationSvg([{}])).toBe("");
  });

  it("escapes persisted stroke attributes", () => {
    const html = renderStaticAnnotationSvg([
      {
        id: 'stroke" onload="alert(1)',
        color: 'red" onload="alert(1)',
        points: [{ x: 1, y: 2 }],
      },
    ]);

    expect(html).toContain('id="stroke&quot; onload=&quot;alert(1)"');
    expect(html).toContain('stroke="red&quot; onload=&quot;alert(1)"');
    expect(html).not.toContain('" onload="');
  });
});
