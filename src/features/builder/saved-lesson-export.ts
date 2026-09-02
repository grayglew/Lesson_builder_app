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
