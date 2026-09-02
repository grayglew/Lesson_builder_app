"use client";

import { buildStandaloneLessonHtml } from "./lesson-export";
import { prepareBuilderDocumentForExport } from "./prepare-export-document";
import {
  collectWorksheetFilesForBundle,
  createStaticExportDocument,
  describeStaticExportBehavior,
} from "./saved-lesson-parity";
import type { BuilderAsset, BuilderDocument, RetrievalItem } from "./schema";

export type PresenterStudentSession = {
  sessionId: string;
  code: string;
  viewerUrl: string;
  expiresAt: string;
};

export type RenderedSlide = {
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
  imageBytes: Uint8Array;
  dataUrl: string;
};

type PowerPointBundleDependencies = {
  renderSlides?: (html: string) => Promise<RenderedSlide[]>;
  buildPowerPoint?: (
    slides: readonly RenderedSlide[],
    title: string,
  ) => Promise<Blob>;
  retrievalItems?: RetrievalItem[];
  prepareDocument?: PrepareExportDocument;
};

export type BundleDependencies = {
  renderPdf: (html: string) => Promise<Blob>;
  retrievalItems?: RetrievalItem[];
  prepareDocument?: PrepareExportDocument;
};

type PrepareExportDocument = (
  document: BuilderDocument,
  retrievalItems?: readonly RetrievalItem[],
) => Promise<BuilderDocument>;

export async function prepareSavedLessonHtml(
  document: BuilderDocument,
  options: {
    lessonId?: string;
    studentSession?: PresenterStudentSession | null;
    retrievalItems?: RetrievalItem[];
    offlineCapabilities?: boolean;
    prepareDocument?: PrepareExportDocument;
  } = {},
) {
  const lessonId = options.lessonId || "";
  const prepareDocument =
    options.prepareDocument ?? prepareBuilderDocumentForExport;
  const [runtimeCss, runtimeJavaScript, embeddedDocument] = await Promise.all([
    fetchAssetText("/builder-v2-assets/presenter-runtime.css"),
    fetchAssetText("/builder-v2-assets/presenter-runtime.js"),
    prepareDocument(document, options.retrievalItems),
  ]);
  return buildStandaloneLessonHtml(embeddedDocument, {
    offlineCapabilities: options.offlineCapabilities,
    runtimeCss,
    runtimeJavaScript: runtimeJavaScript.replace(/<\/script/gi, "<\\/script"),
    liveRetrieval: lessonId
      ? {
          enabled: true,
          endpoint: appEndpoint("/api/presenter/retrieval-log"),
          nextEndpoint: appEndpoint("/api/presenter/retrieval-next"),
          lessonId,
          className: embeddedDocument.className,
          teachingDate: embeddedDocument.teachingDate,
        }
      : null,
    presenterConfig: lessonId
      ? {
          enabled: true,
          sourceLessonId: lessonId,
          originalTitle: embeddedDocument.title,
          className: embeddedDocument.className,
          teachingDate: embeddedDocument.teachingDate,
          uploadEndpoint: appEndpoint("/api/builder-lessons/upload-url"),
          completeEndpoint: appEndpoint("/api/builder-lessons/complete"),
          taughtEndpoint: appEndpoint("/api/builder-lessons/taught"),
          studentSession: options.studentSession || null,
          studentSessionUploadEndpoint: appEndpoint(
            "/api/presenter/student-session/upload-url",
          ),
          studentSessionCompleteEndpoint: appEndpoint(
            "/api/presenter/student-session/complete",
          ),
        }
      : null,
  });
}

export async function buildPowerPointBundleZip(
  document: BuilderDocument,
  dependencies: PowerPointBundleDependencies = {},
) {
  if (!document.slides.length) {
    throw new Error("This saved lesson has no slides to export.");
  }
  const prepareDocument =
    dependencies.prepareDocument ?? prepareBuilderDocumentForExport;
  const embeddedDocument = await prepareDocument(
    document,
    dependencies.retrievalItems,
  );
  const staticDocument = createStaticExportDocument(embeddedDocument);
  const html = buildStandaloneLessonHtml(staticDocument);
  const renderedSlides = await (
    dependencies.renderSlides || renderStandaloneSlidesToJpeg
  )(html);
  const buildPowerPoint =
    dependencies.buildPowerPoint || buildPowerPointBlob;
  const powerPoint = await buildPowerPoint(
    renderedSlides,
    embeddedDocument.title,
  );
  const pdf = buildPdfFromJpegPages(renderedSlides);
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const baseName = safeFileName(embeddedDocument.title);

  zip.file(`${baseName}.pptx`, powerPoint);
  zip.file(`${baseName}.pdf`, pdf);
  for (const entry of collectWorksheetFilesForBundle(embeddedDocument)) {
    const file = await builderAssetToBlob(entry.file);
    if (file) zip.file(entry.path, file);
  }
  zip.file(
    "README.txt",
    [
      `${embeddedDocument.title || "Lesson"} export bundle`,
      "",
      "This bundle was exported from Lesson Builder.",
      "The PowerPoint and PDF are static image-based versions of the lesson slides.",
      ...describeStaticExportBehavior(embeddedDocument),
      "Worksheet files are included in the worksheets/ folder.",
    ].join("\n"),
  );
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function buildLessonBundleZip(
  document: BuilderDocument,
  dependencies: BundleDependencies,
) {
  if (!document.slides.length) {
    throw new Error("This saved lesson has no slides to export.");
  }
  const embeddedDocument = await prepareLessonBundleDocument(
    document,
    dependencies.retrievalItems,
    dependencies.prepareDocument,
  );
  const staticDocument = createStaticExportDocument(embeddedDocument);
  const html = buildStandaloneLessonHtml(staticDocument, {
    staticAnnotations: true,
  });
  const [lessonPdf, worksheetFiles] = await Promise.all([
    dependencies.renderPdf(html),
    Promise.all(
      collectWorksheetFilesForBundle(embeddedDocument).map(async (entry) => ({
        path: entry.path,
        file: await builderAssetToBlobStrict(entry.file, entry.path),
      })),
    ),
  ]);
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const baseName = safeFileName(embeddedDocument.title);

  zip.file(`${baseName}.pdf`, lessonPdf);
  worksheetFiles.forEach(({ path, file }) => zip.file(path, file));
  zip.file(
    "README.txt",
    [
      `${embeddedDocument.title || "Lesson"} export bundle`,
      "",
      "This bundle was exported from Lesson Builder.",
      "The lesson PDF uses A4 pages. Ordinary lesson slides are arranged two per page; imported PDF pages use a full A4 page.",
      "Annotations saved to Lesson Builder are included.",
      ...describeStaticExportBehavior(embeddedDocument),
      "Worksheet and answer PDFs are included in the worksheets/ folder.",
    ].join("\n"),
  );
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

async function prepareLessonBundleDocument(
  document: BuilderDocument,
  retrievalItems: readonly RetrievalItem[] | undefined,
  prepareDocument?: PrepareExportDocument,
) {
  const { documentForPreparation, worksheetAssetsBySlideIndex } =
    separateWorksheetAssets(document);
  const prepare = prepareDocument ?? prepareBuilderDocumentForExport;
  const prepared = await prepare(documentForPreparation, retrievalItems);
  return restoreWorksheetAssets(prepared, worksheetAssetsBySlideIndex);
}

type WorksheetAssets = {
  worksheet?: BuilderAsset;
  answers?: BuilderAsset;
};

function separateWorksheetAssets(document: BuilderDocument) {
  const documentForPreparation = structuredCloneSafe(document);
  const worksheetAssetsBySlideIndex = new Map<number, WorksheetAssets>();
  documentForPreparation.slides.forEach((slide, slideIndex) => {
    if (slide.type !== "worksheet") return;
    const record = slide as unknown as Record<string, unknown>;
    const assets: WorksheetAssets = {};
    if (record.worksheet) assets.worksheet = record.worksheet as BuilderAsset;
    if (record.answers) assets.answers = record.answers as BuilderAsset;
    if (!assets.worksheet && !assets.answers) return;
    worksheetAssetsBySlideIndex.set(slideIndex, assets);
    delete record.worksheet;
    delete record.answers;
  });
  return { documentForPreparation, worksheetAssetsBySlideIndex };
}

function restoreWorksheetAssets(
  document: BuilderDocument,
  worksheetAssetsBySlideIndex: ReadonlyMap<number, WorksheetAssets>,
) {
  const restored = structuredCloneSafe(document);
  restored.slides.forEach((slide, slideIndex) => {
    if (slide.type !== "worksheet") return;
    const assets = worksheetAssetsBySlideIndex.get(slideIndex);
    if (!assets) return;
    const record = slide as unknown as Record<string, unknown>;
    if (assets.worksheet) {
      record.worksheet = structuredCloneSafe(assets.worksheet);
    }
    if (assets.answers) {
      record.answers = structuredCloneSafe(assets.answers);
    }
  });
  return restored;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function safeFileName(value: string) {
  return (
    String(value || "lesson")
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "lesson"
  );
}

async function renderStandaloneSlidesToJpeg(
  html: string,
): Promise<RenderedSlide[]> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;left:-20000px;top:0;width:1600px;height:1000px;border:0;visibility:hidden;";
  frame.srcdoc = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  document.body.appendChild(frame);

  try {
    await waitForStaticSlidesFrame(frame);
    const frameDocument = frame.contentDocument;
    if (!frameDocument) throw new Error("Could not prepare the static slides.");
    const slides = Array.from(
      frameDocument.querySelectorAll<HTMLElement>(".lesson-slide"),
    );
    if (!slides.length) throw new Error("This saved lesson has no slides to export.");
    const pages: RenderedSlide[] = [];
    for (const slide of slides) {
      prepareStaticSlide(slide);
      await waitForImages(slide);
      pages.push(await renderElementToJpeg(slide, 1600, 1000));
    }
    return pages;
  } finally {
    frame.remove();
  }
}

export function waitForStaticSlidesFrame(
  frame: HTMLIFrameElement,
  timeoutMs = 5_000,
) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const startedAt = Date.now();
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      frame.removeEventListener("load", check);
      frame.removeEventListener("error", fail);
      if (error) reject(error);
      else resolve();
    };
    const check = () => {
      const frameDocument = frame.contentDocument;
      if (
        frameDocument?.readyState === "complete" &&
        frameDocument.querySelector(".lesson-slide")
      ) {
        finish();
      } else if (Date.now() - startedAt > timeoutMs) {
        finish(new Error("Could not prepare the static slides."));
      }
    };
    const fail = () =>
      finish(new Error("Could not prepare the static slides."));
    const poll = window.setInterval(check, 25);
    frame.addEventListener("load", check);
    frame.addEventListener("error", fail);
    check();
  });
}

function prepareStaticSlide(slide: HTMLElement) {
  Object.assign(slide.style, {
    width: "1600px",
    height: "1000px",
    maxWidth: "none",
    maxHeight: "none",
    margin: "0",
    border: "0",
    boxShadow: "none",
    transform: "none",
  });
  slide
    .querySelectorAll(".example-reveal-button")
    .forEach((button) => button.remove());
}

async function renderElementToJpeg(
  source: HTMLElement,
  width: number,
  height: number,
): Promise<RenderedSlide> {
  const clone = source.cloneNode(true) as HTMLElement;
  inlineComputedStyles(source, clone);
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  Object.assign(clone.style, {
    width: `${width}px`,
    height: `${height}px`,
    maxWidth: "none",
    maxHeight: "none",
    margin: "0",
  });
  const wrapper = source.ownerDocument.createElement("div");
  wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrapper.style.cssText = `width:${width}px;height:${height}px;margin:0;overflow:hidden;background:#fff;`;
  wrapper.appendChild(clone);
  const serialized = new XMLSerializer().serializeToString(wrapper);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${serialized}</foreignObject></svg>`;
  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas rendering is unavailable.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    return {
      width,
      height,
      imageWidth: width,
      imageHeight: height,
      imageBytes: dataUrlToBytes(dataUrl),
      dataUrl,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function inlineComputedStyles(source: Element, clone: Element) {
  const view = source.ownerDocument.defaultView;
  if (!view) return;
  const computed = view.getComputedStyle(source);
  let cssText = "";
  for (let index = 0; index < computed.length; index += 1) {
    const property = computed[index];
    cssText += `${property}:${computed.getPropertyValue(property)};`;
  }
  clone.setAttribute("style", cssText);
  const sourceChildren = Array.from(source.children);
  const cloneChildren = Array.from(clone.children);
  sourceChildren.forEach((child, index) => {
    if (cloneChildren[index]) {
      inlineComputedStyles(child, cloneChildren[index]);
    }
  });
}

function waitForImages(root: HTMLElement) {
  return Promise.all(
    Array.from(root.querySelectorAll("img")).map((image) => {
      if (image.complete && image.naturalWidth > 0) return Promise.resolve();
      if (typeof image.decode === "function") {
        return image.decode().catch(() => undefined);
      }
      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }),
  );
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Could not render a slide image for the bundle."));
    image.src = source;
  });
}

async function buildPowerPointBlob(
  slides: readonly RenderedSlide[],
  title: string,
) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const presentation = new PptxGenJS();
  presentation.layout = "LAYOUT_16x10";
  presentation.author = "Lesson Builder";
  presentation.company = "Lesson Builder";
  presentation.subject = "Static Lesson Builder export";
  presentation.title = title || "Lesson";
  slides.forEach((rendered) => {
    const slide = presentation.addSlide();
    slide.background = { color: "FFFFFF" };
    const fit = fitRenderedSlide(rendered);
    slide.addImage({ data: rendered.dataUrl, ...fit });
  });
  const output = await presentation.write({
    outputType: "blob",
    compression: true,
  });
  return output instanceof Blob
    ? output
    : new Blob([output as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
}

function fitRenderedSlide(rendered: RenderedSlide) {
  const slideWidth = 10;
  const slideHeight = 6.25;
  const imageAspect =
    rendered.width > 0 && rendered.height > 0
      ? rendered.width / rendered.height
      : 16 / 10;
  if (imageAspect > slideWidth / slideHeight) {
    const height = slideWidth / imageAspect;
    return { x: 0, y: (slideHeight - height) / 2, w: slideWidth, h: height };
  }
  const width = slideHeight * imageAspect;
  return { x: (slideWidth - width) / 2, y: 0, w: width, h: slideHeight };
}

function buildPdfFromJpegPages(pages: readonly RenderedSlide[]) {
  const encoder = new TextEncoder();
  const chunks: BlobPart[] = [];
  const offsets: number[] = [];
  let length = 0;
  const objectCount = 2 + pages.length * 3;
  const appendBytes = (bytes: Uint8Array) => {
    chunks.push(bytes.slice().buffer);
    length += bytes.byteLength;
  };
  const appendString = (text: string) => appendBytes(encoder.encode(text));
  const beginObject = (id: number) => {
    offsets[id] = length;
    appendString(`${id} 0 obj\n`);
  };

  appendString("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
  beginObject(1);
  appendString("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  beginObject(2);
  appendString(
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${3 + index * 3} 0 R`).join(" ")}] >>\nendobj\n`,
  );
  pages.forEach((page, index) => {
    const pageId = 3 + index * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const imageName = `Im${index + 1}`;
    const pageWidth = formatPdfNumber(page.width);
    const pageHeight = formatPdfNumber(page.height);
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/${imageName} Do\nQ\n`;
    beginObject(pageId);
    appendString(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /${imageName} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );
    beginObject(contentId);
    appendString(
      `<< /Length ${encoder.encode(content).byteLength} >>\nstream\n${content}endstream\nendobj\n`,
    );
    beginObject(imageId);
    appendString(
      `<< /Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.imageBytes.byteLength} >>\nstream\n`,
    );
    appendBytes(page.imageBytes);
    appendString("\nendstream\nendobj\n");
  });
  const xrefStart = length;
  appendString(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= objectCount; id += 1) {
    appendString(
      `${String(offsets[id] || 0).padStart(10, "0")} 00000 n \n`,
    );
  }
  appendString(
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`,
  );
  return new Blob(chunks, { type: "application/pdf" });
}

async function builderAssetToBlob(asset: BuilderAsset) {
  const source = String(asset.dataUrl || "");
  if (!source) return null;
  if (/^data:/i.test(source)) {
    return fetch(source).then((response) => response.blob());
  }
  const response = await fetch(source, { cache: "no-store" });
  if (!response.ok) return null;
  return response.blob();
}

async function builderAssetToBlobStrict(
  asset: BuilderAsset,
  path: string,
): Promise<Blob> {
  const source = String(asset.dataUrl || "").trim();
  const fail = (): never => {
    throw new Error(`Could not include "${path}" in the lesson bundle.`);
  };
  if (!source) fail();
  try {
    if (/^data:/i.test(source)) {
      const commaIndex = source.indexOf(",");
      if (commaIndex < 5 || !source.slice(commaIndex + 1).trim()) fail();
    }
    const response = await fetch(source, { cache: "no-store" });
    if (!response.ok) fail();
    const blob = await response.blob();
    if (!blob.size) fail();
    return blob;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === `Could not include "${path}" in the lesson bundle.`
    ) {
      throw error;
    }
    return fail();
  }
}

function dataUrlToBytes(dataUrl: string) {
  const binary = atob(dataUrl.split(",")[1] || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function formatPdfNumber(value: number) {
  return Number(value || 0)
    .toFixed(2)
    .replace(/\.?0+$/, "") || "0";
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

async function fetchAssetText(url: string) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Could not load presenter assets (${response.status}).`);
  }
  return response.text();
}

function appEndpoint(path: string) {
  return new URL(path, window.location.origin).toString();
}
