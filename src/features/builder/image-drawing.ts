import type { BuilderAsset } from "./schema";

export const IMAGE_DRAWING_WIDTH = 2048;
export const IMAGE_DRAWING_HEIGHT = 1536;

export type ImageDrawingMode = "pen" | "highlighter";

export type ImageDrawingPoint = {
  x: number;
  y: number;
};

export type ImageDrawingStroke = {
  mode: ImageDrawingMode;
  color: string;
  size: number;
  opacity: number;
  points: ImageDrawingPoint[];
};

export function imageDrawingPointFromClient(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): ImageDrawingPoint {
  const scale = Math.max(
    0.0001,
    Math.min(
      rect.width / IMAGE_DRAWING_WIDTH,
      rect.height / IMAGE_DRAWING_HEIGHT,
    ),
  );
  const viewportWidth = IMAGE_DRAWING_WIDTH * scale;
  const viewportHeight = IMAGE_DRAWING_HEIGHT * scale;
  const left = rect.left + (rect.width - viewportWidth) / 2;
  const top = rect.top + (rect.height - viewportHeight) / 2;
  return {
    x: clamp((clientX - left) / scale, 0, IMAGE_DRAWING_WIDTH),
    y: clamp((clientY - top) / scale, 0, IMAGE_DRAWING_HEIGHT),
  };
}

export function createImageDrawingStroke(
  mode: ImageDrawingMode,
  color: string,
  size: number,
  displayWidth: number,
  point: ImageDrawingPoint,
): ImageDrawingStroke {
  const baseWidth = Math.max(
    1,
    (coerceImageDrawingSize(size) / Math.max(1, displayWidth)) *
      IMAGE_DRAWING_WIDTH,
  );
  return {
    mode,
    color,
    size: mode === "highlighter" ? Math.max(18, baseWidth * 4) : baseWidth,
    opacity: mode === "highlighter" ? 0.35 : 1,
    points: [point],
  };
}

export function drawImageEditorCanvas(
  canvas: HTMLCanvasElement,
  background: CanvasImageSource | null,
  strokes: readonly ImageDrawingStroke[],
) {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;
  context.save();
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (background) {
    const dimensions = imageSourceDimensions(background);
    const rect = containedImageRect(
      dimensions.width,
      dimensions.height,
      canvas.width,
      canvas.height,
    );
    context.drawImage(background, rect.x, rect.y, rect.width, rect.height);
  }
  strokes.forEach((stroke) => drawImageDrawingStroke(context, stroke));
  context.restore();
}

export async function resolveImageDrawingBackground(
  asset: BuilderAsset | null | undefined,
) {
  const source = asset?.dataUrl?.trim() ?? "";
  if (!source || source.startsWith("data:")) return source;
  const response = await fetch(source, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not fetch the existing image.");
  return blobToDataUrl(await response.blob());
}

export async function loadImageDrawingBackground(dataUrl: string) {
  if (!dataUrl) return null;
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Could not load the existing image."));
    image.src = dataUrl;
  });
}

export function drawingCanvasToAsset(
  canvas: HTMLCanvasElement,
  sourceAsset: BuilderAsset | null | undefined,
) {
  const dataUrl = canvas.toDataURL("image/png");
  const blob = dataUrlToBlob(dataUrl);
  const baseName =
    sourceAsset?.name?.replace(/\.[^.]+$/, "").trim() || "pen-drawing";
  const name = `${baseName}-drawing.png`;
  return {
    asset: {
      name,
      type: "image/png",
      size: blob.size,
      dataUrl,
    } satisfies BuilderAsset,
    file: new File([blob], name, { type: "image/png" }),
  };
}

function drawImageDrawingStroke(
  context: CanvasRenderingContext2D,
  stroke: ImageDrawingStroke,
) {
  if (!stroke.points.length) return;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = stroke.color || "#2563eb";
  context.fillStyle = stroke.color || "#2563eb";
  context.lineWidth = stroke.size || 8;
  if (stroke.mode === "highlighter") {
    context.globalAlpha = clamp(stroke.opacity || 0.35, 0.1, 1);
    context.globalCompositeOperation = "multiply";
  }
  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    context.beginPath();
    context.arc(point.x, point.y, Math.max(1, context.lineWidth / 2), 0, Math.PI * 2);
    context.fill();
  } else if (stroke.points.length === 2) {
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    context.lineTo(stroke.points[1].x, stroke.points[1].y);
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let index = 1; index < stroke.points.length - 1; index += 1) {
      const current = stroke.points[index];
      const next = stroke.points[index + 1];
      context.quadraticCurveTo(
        current.x,
        current.y,
        (current.x + next.x) / 2,
        (current.y + next.y) / 2,
      );
    }
    const last = stroke.points[stroke.points.length - 1];
    context.lineTo(last.x, last.y);
    context.stroke();
  }
  context.restore();
}

function imageSourceDimensions(source: CanvasImageSource) {
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }
  return {
    width: "width" in source ? Number(source.width) : IMAGE_DRAWING_WIDTH,
    height: "height" in source ? Number(source.height) : IMAGE_DRAWING_HEIGHT,
  };
}

function containedImageRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  const width = Math.max(1, sourceWidth || targetWidth);
  const height = Math.max(1, sourceHeight || targetHeight);
  const scale = Math.min(targetWidth / width, targetHeight / height);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  return {
    x: (targetWidth - drawWidth) / 2,
    y: (targetHeight - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(reader.error || new Error("Could not read the existing image."));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string) {
  const [metadata, encoded = ""] = dataUrl.split(",", 2);
  const type = metadata.match(/^data:([^;,]+)/)?.[1] || "image/png";
  const binary = metadata.includes(";base64")
    ? atob(encoded)
    : decodeURIComponent(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type });
}

function coerceImageDrawingSize(value: number) {
  return Number.isFinite(value) ? clamp(value, 2, 24) : 8;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
