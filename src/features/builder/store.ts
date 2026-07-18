"use client";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  type BuilderDocument,
  type BuilderSlide,
  type RetrievalItem,
  type SlideTemplate,
  type StarterSlot,
  createBuilderId,
  createInitialBuilderDocument,
  normalizeBuilderDocument,
} from "./schema";

type MetadataPatch = Partial<
  Pick<BuilderDocument, "title" | "className" | "teachingDate" | "overallLessonLo">
>;

type SavedLessonMetadata = {
  id: string;
  title: string;
  className: string;
  teachingDate: string;
  updatedAt: string;
};

type GlobalDataPatch = {
  classNames?: string[];
  retrievalItems?: RetrievalItem[];
  slideTemplates?: SlideTemplate[];
  updatedAt?: string;
};

export type BuilderStatus = {
  tone: "idle" | "working" | "success" | "warning" | "error";
  message: string;
};

export type BuilderStore = {
  document: BuilderDocument;
  selectedSlideId: string | null;
  hydrated: boolean;
  status: BuilderStatus;
  hydrate: (document: unknown) => void;
  openSavedLesson: (document: unknown, metadata: SavedLessonMetadata) => void;
  markLessonSaved: (metadata: SavedLessonMetadata) => void;
  updateActiveLessonMetadata: (metadata: SavedLessonMetadata) => void;
  clearActiveLesson: (id?: string) => void;
  updateGlobalData: (patch: GlobalDataPatch) => void;
  reset: () => void;
  updateMetadata: (patch: MetadataPatch) => void;
  selectSlide: (slideId: string | null) => void;
  addBlankSlide: () => void;
  addPlaceholderSlide: (text?: string) => void;
  addStarterSlide: (slots: StarterSlot[]) => void;
  addSlides: (slides: BuilderSlide[]) => void;
  insertTemplateSlide: (template: SlideTemplate) => void;
  duplicateSlide: (slideId: string) => void;
  moveSlide: (slideId: string, direction: -1 | 1) => void;
  removeSlide: (slideId: string) => void;
  updateSelectedSlide: (patch: Record<string, unknown>) => void;
  setStatus: (status: BuilderStatus) => void;
};

const idleStatus: BuilderStatus = {
  tone: "idle",
  message: "Changes are saved to the separate v2 browser cache.",
};

export const useBuilderStore = create<BuilderStore>()(
  immer((set) => ({
    document: createInitialBuilderDocument(),
    selectedSlideId: null,
    hydrated: false,
    status: idleStatus,

    hydrate: (input) =>
      set((state) => {
        state.document = normalizeBuilderDocument(input);
        state.selectedSlideId = state.document.slides[0]?.id ?? null;
        state.hydrated = true;
        state.status = idleStatus;
      }),

    openSavedLesson: (input, metadata) =>
      set((state) => {
        const lesson = normalizeBuilderDocument(input);
        state.document = {
          ...lesson,
          title: metadata.title || lesson.title,
          className: metadata.className || lesson.className,
          teachingDate: metadata.teachingDate || lesson.teachingDate,
          activeLessonId: metadata.id,
          activeLessonSavedAt: metadata.updatedAt,
          lessonUpdatedAt: metadata.updatedAt,
          classNames: uniqueStrings([
            metadata.className,
            ...state.document.classNames,
          ]),
          retrievalItems: state.document.retrievalItems,
          slideTemplates: state.document.slideTemplates,
          updatedAt: new Date().toISOString(),
        };
        state.selectedSlideId = state.document.slides[0]?.id ?? null;
        state.status = {
          tone: "success",
          message: `Opened "${state.document.title}" from the lesson library.`,
        };
      }),

    markLessonSaved: (metadata) =>
      set((state) => {
        state.document.activeLessonId = metadata.id;
        state.document.activeLessonSavedAt = metadata.updatedAt;
        state.document.lessonUpdatedAt = metadata.updatedAt;
        state.document.title = metadata.title;
        state.document.className = metadata.className;
        state.document.teachingDate = metadata.teachingDate;
        state.document.classNames = uniqueStrings([
          metadata.className,
          ...state.document.classNames,
        ]);
        state.document.updatedAt = new Date().toISOString();
      }),

    updateActiveLessonMetadata: (metadata) =>
      set((state) => {
        if (state.document.activeLessonId !== metadata.id) return;
        const wasDirty = isLessonDirty(state.document);
        state.document.title = metadata.title;
        state.document.className = metadata.className;
        state.document.teachingDate = metadata.teachingDate;
        state.document.classNames = uniqueStrings([
          metadata.className,
          ...state.document.classNames,
        ]);
        state.document.activeLessonSavedAt = metadata.updatedAt;
        if (!wasDirty) state.document.lessonUpdatedAt = metadata.updatedAt;
        state.document.updatedAt = new Date().toISOString();
      }),

    clearActiveLesson: (id) =>
      set((state) => {
        if (id && state.document.activeLessonId !== id) return;
        state.document.activeLessonId = "";
        state.document.activeLessonSavedAt = "";
        state.document.lessonUpdatedAt = new Date().toISOString();
        state.document.updatedAt = state.document.lessonUpdatedAt;
      }),

    updateGlobalData: (patch) =>
      set((state) => {
        if (patch.classNames) {
          state.document.classNames = uniqueStrings([
            state.document.className,
            ...patch.classNames,
          ]);
        }
        if (patch.retrievalItems) {
          state.document.retrievalItems = patch.retrievalItems;
        }
        if (patch.slideTemplates) {
          state.document.slideTemplates = patch.slideTemplates;
        }
        state.document.updatedAt = patch.updatedAt || new Date().toISOString();
      }),

    reset: () =>
      set((state) => {
        state.document = createInitialBuilderDocument();
        state.selectedSlideId = null;
        state.hydrated = true;
        state.status = {
          tone: "success",
          message: "Started a new lesson in the v2 workspace.",
        };
      }),

    updateMetadata: (patch) =>
      set((state) => {
        Object.assign(state.document, patch);
        touchDocument(state.document);
      }),

    selectSlide: (slideId) =>
      set((state) => {
        state.selectedSlideId = slideId;
      }),

    addBlankSlide: () =>
      set((state) => {
        const slide: BuilderSlide = {
          id: createBuilderId("slide"),
          type: "blank",
          title: "Blank",
          createdAt: new Date().toISOString(),
        };
        insertAfterSelection(state, slide);
      }),

    addPlaceholderSlide: (text = "Add lesson content here") =>
      set((state) => {
        const slide: BuilderSlide = {
          id: createBuilderId("slide"),
          type: "placeholder",
          title: "Placeholder",
          text,
          createdAt: new Date().toISOString(),
        };
        insertAfterSelection(state, slide);
      }),

    addStarterSlide: (slots) =>
      set((state) => {
        const slide: BuilderSlide = {
          id: createBuilderId("slide"),
          type: "starter",
          title: "Starter",
          slots: clonePlain(slots).slice(0, 4),
          createdAt: new Date().toISOString(),
        };
        insertAfterSelection(state, slide);
      }),

    addSlides: (slides) =>
      set((state) => {
        const prepared = clonePlain(slides);
        if (!prepared.length) return;
        const selectedIndex = state.document.slides.findIndex(
          (entry) => entry.id === state.selectedSlideId,
        );
        const insertionIndex =
          selectedIndex < 0 ? state.document.slides.length : selectedIndex + 1;
        state.document.slides.splice(insertionIndex, 0, ...prepared);
        state.selectedSlideId = prepared[prepared.length - 1].id;
        touchDocument(state.document);
      }),

    insertTemplateSlide: (template) =>
      set((state) => {
        const slide: BuilderSlide = {
          id: createBuilderId("slide"),
          type: "template",
          title: template.title.trim() || "Template",
          bullets: clonePlain(template.bullets),
          createdAt: new Date().toISOString(),
        };
        insertAfterSelection(state, slide);
      }),

    duplicateSlide: (slideId) =>
      set((state) => {
        const sourceIndex = state.document.slides.findIndex((slide) => slide.id === slideId);
        if (sourceIndex < 0) return;
        const duplicate = clonePlain(state.document.slides[sourceIndex]);
        duplicate.id = createBuilderId("slide");
        duplicate.title = duplicate.title ? `${duplicate.title} copy` : "Slide copy";
        duplicate.createdAt = new Date().toISOString();
        state.document.slides.splice(sourceIndex + 1, 0, duplicate);
        state.selectedSlideId = duplicate.id;
        touchDocument(state.document);
      }),

    moveSlide: (slideId, direction) =>
      set((state) => {
        const currentIndex = state.document.slides.findIndex((slide) => slide.id === slideId);
        const nextIndex = currentIndex + direction;
        if (
          currentIndex < 0 ||
          nextIndex < 0 ||
          nextIndex >= state.document.slides.length
        ) {
          return;
        }
        const [slide] = state.document.slides.splice(currentIndex, 1);
        state.document.slides.splice(nextIndex, 0, slide);
        touchDocument(state.document);
      }),

    removeSlide: (slideId) =>
      set((state) => {
        const index = state.document.slides.findIndex((slide) => slide.id === slideId);
        if (index < 0) return;
        state.document.slides.splice(index, 1);
        state.selectedSlideId =
          state.document.slides[Math.min(index, state.document.slides.length - 1)]?.id ??
          null;
        touchDocument(state.document);
      }),

    updateSelectedSlide: (patch) =>
      set((state) => {
        const selected = state.document.slides.find(
          (slide) => slide.id === state.selectedSlideId,
        );
        if (!selected) return;
        Object.assign(selected, patch);
        touchDocument(state.document);
      }),

    setStatus: (status) =>
      set((state) => {
        state.status = status;
      }),
  })),
);

export const selectDocument = (state: BuilderStore) => state.document;
export const selectSlides = (state: BuilderStore) => state.document.slides;
export const selectSelectedSlide = (state: BuilderStore) =>
  state.document.slides.find((slide) => slide.id === state.selectedSlideId) ?? null;

function insertAfterSelection(
  state: Pick<BuilderStore, "document" | "selectedSlideId">,
  slide: BuilderSlide,
) {
  const selectedIndex = state.document.slides.findIndex(
    (entry) => entry.id === state.selectedSlideId,
  );
  const insertionIndex = selectedIndex < 0 ? state.document.slides.length : selectedIndex + 1;
  state.document.slides.splice(insertionIndex, 0, slide);
  state.selectedSlideId = slide.id;
  touchDocument(state.document);
}

function touchDocument(document: BuilderDocument) {
  const now = new Date().toISOString();
  document.updatedAt = now;
  document.lessonUpdatedAt = now;
}

function clonePlain<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isLessonDirty(document: BuilderDocument) {
  const savedAt = Date.parse(document.activeLessonSavedAt);
  const changedAt = Date.parse(document.lessonUpdatedAt);
  if (Number.isNaN(savedAt)) return true;
  if (Number.isNaN(changedAt)) return false;
  return changedAt > savedAt + 500;
}
