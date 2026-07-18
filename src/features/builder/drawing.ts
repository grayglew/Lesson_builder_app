import type { BuilderAsset } from "./schema";

export const DRAWING_RESOLUTIONS = [
  { width: 1600, height: 1000, label: "1600 x 1000" },
  { width: 2560, height: 1600, label: "2560 x 1600" },
  { width: 3840, height: 2400, label: "3840 x 2400" },
] as const;

export type DrawingResolution = {
  width: number;
  height: number;
};

export type DrawingPoint = {
  x: number;
  y: number;
};

export type DrawingStroke = {
  mode: "pen" | "eraser";
  color: string;
  sizeRatio: number;
  points: DrawingPoint[];
};

const MIN_PEN_SIZE = 0.5;

export function parseDrawingResolution(value: string): DrawingResolution | null {
  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (
    !DRAWING_RESOLUTIONS.some(
      (resolution) =>
        resolution.width === width && resolution.height === height,
    )
  ) {
    return null;
  }
  return { width, height };
}

export function normalizeDrawingPoint(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): DrawingPoint {
  const width = rect.width || 1;
  const height = rect.height || 1;
  return {
    x: clamp((clientX - rect.left) / width, 0, 1),
    y: clamp((clientY - rect.top) / height, 0, 1),
  };
}

export function createDrawingStroke(
  mode: DrawingStroke["mode"],
  color: string,
  penSize: number,
  canvasHeight: number,
  point: DrawingPoint,
): DrawingStroke {
  return {
    mode,
    color,
    sizeRatio: coercePenSize(penSize) / Math.max(1, canvasHeight),
    points: [point],
  };
}

export function redrawDrawingCanvas(
  canvas: HTMLCanvasElement,
  strokes: readonly DrawingStroke[],
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  strokes.forEach((stroke) => drawFullStroke(context, canvas, stroke));
}

export function drawStrokePoint(
  context: CanvasRenderingContext2D,
  canvas: Pick<HTMLCanvasElement, "width" | "height">,
  stroke: DrawingStroke,
  point: DrawingPoint,
) {
  applyStrokeStyle(context, canvas.height, stroke);
  const radius = Math.max(
    MIN_PEN_SIZE / 2,
    (stroke.sizeRatio * canvas.height) / 2,
  );
  context.beginPath();
  context.arc(
    point.x * canvas.width,
    point.y * canvas.height,
    radius,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.globalCompositeOperation = "source-over";
}

export function drawStrokeSegment(
  context: CanvasRenderingContext2D,
  canvas: Pick<HTMLCanvasElement, "width" | "height">,
  stroke: DrawingStroke,
  from: DrawingPoint,
  to: DrawingPoint,
) {
  applyStrokeStyle(context, canvas.height, stroke);
  context.beginPath();
  context.moveTo(from.x * canvas.width, from.y * canvas.height);
  context.lineTo(to.x * canvas.width, to.y * canvas.height);
  context.stroke();
  context.globalCompositeOperation = "source-over";
}

export function exportDrawingImage(
  source: HTMLCanvasElement,
): BuilderAsset | null {
  const output = document.createElement("canvas");
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(source, 0, 0);
  const dataUrl = output.toDataURL("image/png");
  return {
    name: `drawing-${output.width}x${output.height}.png`,
    type: "image/png",
    size: estimateDataUrlSize(dataUrl),
    dataUrl,
  };
}

function drawFullStroke(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  stroke: DrawingStroke,
) {
  if (!stroke.points.length) return;
  drawStrokePoint(context, canvas, stroke, stroke.points[0]);
  for (let index = 1; index < stroke.points.length; index += 1) {
    drawStrokeSegment(
      context,
      canvas,
      stroke,
      stroke.points[index - 1],
      stroke.points[index],
    );
  }
}

function applyStrokeStyle(
  context: CanvasRenderingContext2D,
  canvasHeight: number,
  stroke: DrawingStroke,
) {
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalCompositeOperation =
    stroke.mode === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = stroke.color || "#111827";
  context.fillStyle = stroke.color || "#111827";
  context.lineWidth = Math.max(
    MIN_PEN_SIZE,
    stroke.sizeRatio * canvasHeight,
  );
}

function coercePenSize(value: number) {
  return Number.isFinite(value) ? Math.max(MIN_PEN_SIZE, value) : 2;
}

function estimateDataUrlSize(dataUrl: string) {
  const encoded = dataUrl.split(",", 2)[1] ?? "";
  return Math.max(0, Math.floor((encoded.length * 3) / 4));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
