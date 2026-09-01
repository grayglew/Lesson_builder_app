import {
  normalizePresenterStroke,
  presenterPathFromPoints,
} from "@/features/presenter/annotations";
import type { PresenterStroke } from "@/features/presenter/types";

export function renderStaticAnnotationSvg(value: unknown): string {
  const strokes = Array.isArray(value)
    ? value
        .map((stroke, index) =>
          normalizePresenterStroke(stroke, `static-stroke-${index}`),
        )
        .filter((stroke): stroke is PresenterStroke => stroke !== null)
    : [];
  if (!strokes.length) return "";

  const paths = strokes.map(renderStrokePath).join("");
  return `<svg class="annotation-svg static-annotation-svg" viewBox="0 0 1600 1000" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>`;
}

function renderStrokePath(stroke: PresenterStroke): string {
  const opacity =
    stroke.mode === "highlighter"
      ? ` stroke-opacity="${escapeAttr(stroke.opacity)}"`
      : "";
  return `<path id="${escapeAttr(stroke.id)}" d="${escapeAttr(presenterPathFromPoints(stroke.points))}" fill="none" stroke="${escapeAttr(stroke.color)}" stroke-width="${escapeAttr(stroke.width)}" stroke-linecap="round" stroke-linejoin="round"${opacity}/>`;
}

function escapeAttr(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
