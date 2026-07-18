import type { BuilderAsset, BuilderSlide } from "./schema";
import { createBuilderId } from "./schema";

export const PDF_RENDER_WIDTHS = [1400, 1800, 2200] as const;

export type PdfRenderWidth = (typeof PDF_RENDER_WIDTHS)[number];

export type PdfViewportLike = {
  width: number;
  height: number;
};

export type PdfPageLike = {
  getViewport: (options: { scale: number }) => PdfViewportLike;
  render: (options: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewportLike;
  }) => { promise: Promise<unknown> };
};

export type PdfDocumentLike = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageLike>;
  destroy?: () => Promise<void>;
};

type RenderPdfPageOptions = {
  document: PdfDocumentLike;
  pageNumber: number;
  sourceName: string;
  renderWidth: PdfRenderWidth;
  createCanvas?: () => HTMLCanvasElement;
  id?: string;
  createdAt?: string;
};

let pdfJsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

export function isPdfFile(file: Pick<File, "name" | "type"> | null | undefined) {
  if (!file) return false;
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function coercePdfRenderWidth(
  value: unknown,
  fallback: PdfRenderWidth = 1800,
): PdfRenderWidth {
  const width = Number(value);
  return PDF_RENDER_WIDTHS.includes(width as PdfRenderWidth)
    ? (width as PdfRenderWidth)
    : fallback;
}

export function sanitizePdfFilePart(value: string) {
  return String(value || "lesson")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "lesson";
}

export function pdfPageAsset(
  sourceName: string,
  pageNumber: number,
  dataUrl: string,
): BuilderAsset {
  return {
    name: `${sanitizePdfFilePart(sourceName || "pdf")}-page-${pageNumber}.png`,
    type: "image/png",
    size: Math.round((dataUrl.length * 3) / 4),
    dataUrl,
  };
}

export async function loadPdfDocument(file: File): Promise<PdfDocumentLike> {
  if (typeof window === "undefined") {
    throw new Error("PDF rendering is only available in the browser.");
  }

  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return pdfjs;
    });
  }

  const pdfjs = await pdfJsPromise;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  return (await loadingTask.promise) as unknown as PdfDocumentLike;
}

export async function renderPdfPageToSlide({
  document: pdf,
  pageNumber,
  sourceName,
  renderWidth,
  createCanvas = () => document.createElement("canvas"),
  id = createBuilderId("slide"),
  createdAt = new Date().toISOString(),
}: RenderPdfPageOptions): Promise<BuilderSlide> {
  const page = await pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = renderWidth / Math.max(1, baseViewport.width);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas();
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser could not create a PDF canvas.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;

  const dataUrl = canvas.toDataURL("image/png");
  const aspect = canvas.width / Math.max(1, canvas.height);
  const safeSourceName = sourceName || "PDF";
  return {
    id,
    type: "pdf-page",
    title: `${safeSourceName} page ${pageNumber}`,
    sourceName: safeSourceName,
    pageNumber,
    pageCount: pdf.numPages,
    orientation: aspect >= 1 ? "landscape" : "portrait",
    width: canvas.width,
    height: canvas.height,
    aspect,
    image: pdfPageAsset(safeSourceName, pageNumber, dataUrl),
    createdAt,
  };
}

