import type {
  PresenterAnnotations,
  PresenterPoint,
  PresenterStroke,
  PresenterStrokeMode,
} from "./types";

const DEFAULT_COLOR = "#2563eb";

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizePresenterPoint(value: unknown): PresenterPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Partial<PresenterPoint>;
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export function normalizePresenterStroke(
  value: unknown,
  fallbackId: string,
): PresenterStroke | null {
  if (!value || typeof value !== "object") return null;
  const stroke = value as Partial<PresenterStroke>;
  const points = Array.isArray(stroke.points)
    ? stroke.points
        .map(normalizePresenterPoint)
        .filter((point): point is PresenterPoint => point !== null)
    : [];
  if (!points.length) return null;

  const mode: PresenterStrokeMode =
    stroke.mode === "highlighter" ? "highlighter" : "pen";
  return {
    id: typeof stroke.id === "string" && stroke.id ? stroke.id : fallbackId,
    mode,
    color:
      typeof stroke.color === "string" && stroke.color
        ? stroke.color
        : DEFAULT_COLOR,
    width: Math.max(0.5, finiteNumber(stroke.width, 6)),
    opacity:
      mode === "highlighter"
        ? clamp(finiteNumber(stroke.opacity, 0.35), 0.1, 1)
        : 1,
    createdAt: Math.max(0, finiteNumber(stroke.createdAt, Date.now())),
    points,
  };
}

export function normalizePresenterAnnotations(
  value: unknown,
): PresenterAnnotations {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: PresenterAnnotations = {};
  Object.entries(value).forEach(([slideIndex, strokes]) => {
    if (!Array.isArray(strokes)) return;
    const normalized = strokes
      .map((stroke, index) =>
        normalizePresenterStroke(stroke, `stroke_${slideIndex}_${index}`),
      )
      .filter((stroke): stroke is PresenterStroke => stroke !== null);
    if (normalized.length) result[slideIndex] = normalized;
  });
  return result;
}

export function clonePresenterAnnotations(
  annotations: PresenterAnnotations,
): PresenterAnnotations {
  return Object.fromEntries(
    Object.entries(annotations).map(([slideIndex, strokes]) => [
      slideIndex,
      strokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((point) => ({ ...point })),
      })),
    ]),
  );
}

function roundPathValue(value: number): number {
  return Math.round(value * 10) / 10;
}

export function presenterPathFromPoints(points: PresenterPoint[]): string {
  if (!points.length) return "";
  if (points.length === 1) {
    return `M${roundPathValue(points[0].x)} ${roundPathValue(points[0].y)} l0.1 0`;
  }
  if (points.length === 2) {
    return `M${roundPathValue(points[0].x)} ${roundPathValue(points[0].y)} L${roundPathValue(points[1].x)} ${roundPathValue(points[1].y)}`;
  }

  let path = `M${roundPathValue(points[0].x)} ${roundPathValue(points[0].y)}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const next = points[index + 1];
    const midpoint = {
      x: (points[index].x + next.x) / 2,
      y: (points[index].y + next.y) / 2,
    };
    path += ` Q${roundPathValue(points[index].x)} ${roundPathValue(points[index].y)} ${roundPathValue(midpoint.x)} ${roundPathValue(midpoint.y)}`;
  }
  const last = points[points.length - 1];
  return `${path} L${roundPathValue(last.x)} ${roundPathValue(last.y)}`;
}

function squaredDistanceToSegment(
  point: PresenterPoint,
  start: PresenterPoint,
  end: PresenterPoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (!dx && !dy) {
    return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
  }
  const ratio = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) /
      (dx * dx + dy * dy),
    0,
    1,
  );
  const nearestX = start.x + ratio * dx;
  const nearestY = start.y + ratio * dy;
  return (point.x - nearestX) ** 2 + (point.y - nearestY) ** 2;
}

export function presenterStrokeIntersectsPoint(
  stroke: PresenterStroke,
  point: PresenterPoint,
  threshold: number,
): boolean {
  const effectiveThreshold = Math.max(threshold, stroke.width / 2);
  const maximumDistance = effectiveThreshold * effectiveThreshold;
  if (stroke.points.length === 1) {
    return (
      squaredDistanceToSegment(point, stroke.points[0], stroke.points[0]) <=
      maximumDistance
    );
  }
  for (let index = 1; index < stroke.points.length; index += 1) {
    if (
      squaredDistanceToSegment(
        point,
        stroke.points[index - 1],
        stroke.points[index],
      ) <= maximumDistance
    ) {
      return true;
    }
  }
  return false;
}
