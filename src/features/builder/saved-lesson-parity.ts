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

export type StaticSlideVariant = {
  slide: BuilderSlide;
  sourceIndex: number;
  answerMode: "saved" | "none" | "hidden" | "shown";
};

export type WorksheetBundleEntry = {
  path: string;
  file: BuilderAsset;
};

export function sortSavedLessons<T extends SavedLessonSummary>(
  lessons: readonly T[],
): T[] {
  return [...lessons].sort((left, right) => {
    if (left.isTaught !== right.isTaught) return left.isTaught ? 1 : -1;
    const leftDate = validTeachingDate(left.teachingDate);
    const rightDate = validTeachingDate(right.teachingDate);
    const dateOrder = leftDate.localeCompare(rightDate);
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

export function expandSlidesForStaticExport(
  slides: readonly BuilderSlide[],
): StaticSlideVariant[] {
  const variants: StaticSlideVariant[] = [];
  slides.forEach((slide, sourceIndex) => {
    if (hasPresentationState(slide)) {
      variants.push({ slide, sourceIndex, answerMode: "saved" });
      return;
    }
    if (!slideHasAnswerImages(slide)) {
      variants.push({ slide, sourceIndex, answerMode: "none" });
      return;
    }
    variants.push(
      { slide, sourceIndex, answerMode: "hidden" as const },
      { slide, sourceIndex, answerMode: "shown" as const },
    );
  });
  return variants;
}

export function createStaticExportDocument(
  document: BuilderDocument,
): BuilderDocument {
  const slides = expandSlidesForStaticExport(document.slides).map(
    ({ slide, sourceIndex, answerMode }, outputIndex) => {
      if (answerMode === "saved" || answerMode === "none") return slide;
      const copy = structuredCloneSafe(slide);
      copy.id = `${slide.id}-static-${sourceIndex}-${outputIndex}`;
      copy.presentationState = {
        version: 1,
        reveals: revealStateForSlide(copy, answerMode === "shown"),
      };
      return copy;
    },
  );
  return { ...document, slides };
}

export function slideHasAnswerImages(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(slideHasAnswerImages);
  const record = value as Record<string, unknown>;
  return Object.entries(record).some(([key, nested]) => {
    const normalized = key.toLowerCase();
    if (
      normalized === "answerimage" ||
      normalized === "answerimages" ||
      /^answerimage\d+$/.test(normalized)
    ) {
      return valueHasImagePayload(nested);
    }
    return slideHasAnswerImages(nested);
  });
}

export function hasPresentationState(slide: BuilderSlide) {
  const state = asRecord(slide.presentationState);
  return Number(state.version) === 1 && isRecord(state.reveals);
}

export function describeStaticExportBehavior(document: BuilderDocument) {
  const hasSavedState = document.slides.some(hasPresentationState);
  const hasGeneratedVariants = document.slides.some(
    (slide) => !hasPresentationState(slide) && slideHasAnswerImages(slide),
  );
  const lines: string[] = [];
  if (hasSavedState) {
    lines.push(
      "Presenter-saved slides preserve their saved classroom visibility state.",
    );
  }
  if (hasGeneratedVariants) {
    lines.push(
      "Other slides with answer images appear twice: first with answers hidden, then with answers shown.",
    );
  }
  if (!lines.length) {
    lines.push("Each lesson slide appears once in its saved state.");
  }
  return lines;
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
    const slots = Array.isArray(data.slots) ? data.slots : [];
    return Object.fromEntries(
      slots.map((_, index) => [`starter-answer-${index}`, showAnswers]),
    );
  }
  if (slide.type === "example") {
    return {
      "example-answer-0": showAnswers,
      "example-answer-1": showAnswers,
      "example-second-image": true,
    };
  }
  if (slide.type === "revision") {
    const items = Array.isArray(data.items) ? data.items : [];
    return Object.fromEntries(
      items.map((_, index) => [`revision-answer-${index}`, showAnswers]),
    );
  }
  return {};
}

function valueHasImagePayload(value: unknown): boolean {
  if (!value) return false;
  if (Array.isArray(value)) return value.some(valueHasImagePayload);
  if (isAsset(value)) return Boolean(value.dataUrl);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(
      valueHasImagePayload,
    );
  }
  return false;
}

function validTeachingDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "9999-12-31";
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
