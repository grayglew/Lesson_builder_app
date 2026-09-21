import type { SavedLessonSummary } from "./api-client";
import type {
  BuilderAsset,
  BuilderDocument,
  BuilderSlide,
} from "./schema";

export type ConfidenceSummary = {
  version: 1;
  counts: Record<"1" | "2" | "3" | "4" | "5", number>;
  total: number;
  average: number | null;
  completedAt: string;
};

export type SavedLessonWithConfidence = SavedLessonSummary & {
  confidenceSummary?: ConfidenceSummary | null;
};

export type WorksheetBundleEntry = {
  path: string;
  file: BuilderAsset;
};

export function sortSavedLessons<T extends SavedLessonSummary>(
  lessons: readonly T[],
): T[] {
  return [...lessons].sort((left, right) => {
    const leftDate = validTeachingDate(left.teachingDate);
    const rightDate = validTeachingDate(right.teachingDate);
    if (!leftDate && rightDate) return 1;
    if (leftDate && !rightDate) return -1;
    const dateOrder = rightDate.localeCompare(leftDate);
    if (dateOrder) return dateOrder;
    return left.title.toLowerCase().localeCompare(right.title.toLowerCase());
  });
}

export function isLessonDirty(document: BuilderDocument) {
  const savedAt = Date.parse(document.activeLessonSavedAt);
  const changedAt = Date.parse(document.lessonUpdatedAt);
  if (Number.isNaN(savedAt)) return true;
  if (Number.isNaN(changedAt)) return false;
  return changedAt > savedAt + 500;
}

export function usableConfidenceSummary(
  lesson: SavedLessonWithConfidence,
): ConfidenceSummary | null {
  const summary = lesson.confidenceSummary;
  if (
    !summary ||
    summary.total <= 0 ||
    summary.average === null ||
    summary.average < 1
  ) {
    return null;
  }
  return summary;
}

export function confidenceAverageColors(average: number) {
  const value = Math.max(1, Math.min(5, Number(average) || 3));
  const stops = [
    { background: "#fee2e2", border: "#ef4444" },
    { background: "#ffedd5", border: "#f97316" },
    { background: "#fef9c3", border: "#eab308" },
    { background: "#dcfce7", border: "#22c55e" },
    { background: "#bbf7d0", border: "#16a34a" },
  ];
  const lowerIndex = Math.max(0, Math.min(4, Math.floor(value) - 1));
  const upperIndex = Math.max(0, Math.min(4, Math.ceil(value) - 1));
  const ratio = Math.max(0, Math.min(1, value - Math.floor(value)));
  return {
    background: mixHexColor(
      stops[lowerIndex].background,
      stops[upperIndex].background,
      ratio,
    ),
    border: mixHexColor(
      stops[lowerIndex].border,
      stops[upperIndex].border,
      ratio,
    ),
  };
}

export function createSavedStateExportDocument(
  document: BuilderDocument,
): BuilderDocument {
  const copy = structuredCloneSafe(document);
  copy.slides = copy.slides.map((slide) => {
    if (hasPresentationState(slide)) return slide;
    slide.presentationState = {
      version: 1,
      reveals: revealStateForSlide(slide, false),
    };
    return slide;
  });
  return copy;
}

export function createAnswerKeyExportDocument(
  document: BuilderDocument,
): BuilderDocument {
  const copy = structuredCloneSafe(document);
  copy.slides = copy.slides.map((slide) => {
    slide.presentationState = {
      version: 1,
      reveals: revealStateForSlide(slide, true),
    };
    slide.annotations = [];
    return slide;
  });
  return copy;
}

function hasPresentationState(slide: BuilderSlide) {
  const state = asRecord(slide.presentationState);
  const reveals = asRecord(state.reveals);
  const capturedRevealKeys = capturedRevealKeysForSlide(slide);
  return (
    state.version === 1 &&
    isRecord(state.reveals) &&
    capturedRevealKeys.every(
      (key) => typeof reveals[key] === "boolean",
    )
  );
}

export function collectWorksheetFilesForBundle(
  document: BuilderDocument,
): WorksheetBundleEntry[] {
  const usedPaths = new Set<string>();
  const entries: WorksheetBundleEntry[] = [];
  document.slides.forEach((slide, slideIndex) => {
    if (slide.type !== "worksheet") return;
    const record = asRecord(slide);
    (
      [
        [record.worksheet, `worksheet-${slideIndex + 1}`],
        [record.answers, `answers-${slideIndex + 1}`],
      ] as const
    ).forEach(([candidate, fallback]) => {
      if (!isAsset(candidate)) return;
      entries.push({
        path: uniqueWorksheetPath(candidate.name, fallback, usedPaths),
        file: candidate,
      });
    });
  });
  return entries;
}

function revealStateForSlide(
  slide: BuilderSlide,
  showAnswers: boolean,
): Record<string, boolean> {
  const data = asRecord(slide);
  if (slide.type === "starter") {
    const slots = arrayOfRecords(data.slots).slice(0, 4);
    return Object.fromEntries(
      slots.map((_, index) => [`starter-answer-${index}`, showAnswers]),
    );
  }
  if (slide.type === "example") {
    return {
      "example-answer-0": showAnswers,
      "example-answer-1": showAnswers,
      "example-second-image": showAnswers,
    };
  }
  if (slide.type === "revision") {
    const items = arrayOfRecords(data.items).slice(0, 2);
    return Object.fromEntries(
      items.map((_, index) => [`revision-answer-${index}`, showAnswers]),
    );
  }
  return {};
}

function capturedRevealKeysForSlide(slide: BuilderSlide): string[] {
  const data = asRecord(slide);
  if (slide.type === "starter") {
    return arrayOfRecords(data.slots)
      .slice(0, 4)
      .flatMap((slot, index) =>
        hasAssetSource(slot.answerImage) ? [`starter-answer-${index}`] : [],
      );
  }
  if (slide.type === "example") {
    const pairs = [
      [data.image1, data.answerImage1],
      [data.image2, data.answerImage2],
    ].filter(([question]) => hasAssetSource(question));
    return [
      ...pairs.flatMap(([, answer], index) =>
        hasAssetSource(answer) ? [`example-answer-${index}`] : [],
      ),
      ...(pairs.length > 1 ? ["example-second-image"] : []),
    ];
  }
  if (slide.type === "revision") {
    return arrayOfRecords(data.items)
      .slice(0, 2)
      .flatMap((item, index) =>
        hasAssetSource(item.answerImage) ? [`revision-answer-${index}`] : [],
      );
  }
  return [];
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function hasAssetSource(value: unknown) {
  const asset = asRecord(value);
  return Boolean(asset.dataUrl || asset.url || asset.path);
}

function validTeachingDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function mixHexColor(left: string, right: string, ratio: number) {
  const leftChannels = parseHexColor(left);
  const rightChannels = parseHexColor(right);
  return `#${leftChannels
    .map((channel, index) =>
      Math.round(
        channel + (rightChannels[index] - channel) * ratio,
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function parseHexColor(value: string) {
  const clean = value.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return [255, 255, 255];
  return [0, 2, 4].map((index) =>
    Number.parseInt(clean.slice(index, index + 2), 16),
  );
}

function uniqueWorksheetPath(
  name: string,
  fallback: string,
  usedPaths: Set<string>,
) {
  const fileName = safeZipFileName(name, fallback);
  let path = `worksheets/${fileName}`;
  let counter = 2;
  while (usedPaths.has(path)) {
    const match = fileName.match(/(\.[a-z0-9]{1,10})$/i);
    path = match
      ? `worksheets/${fileName.slice(0, -match[1].length)}-${counter}${match[1]}`
      : `worksheets/${fileName}-${counter}`;
    counter += 1;
  }
  usedPaths.add(path);
  return path;
}

function safeZipFileName(name: string, fallback: string) {
  const value = String(name || fallback || "file")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return value || fallback;
}

function isAsset(value: unknown): value is BuilderAsset {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.dataUrl === "string"
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
