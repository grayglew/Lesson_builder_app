"use client";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  type BuilderAsset,
  type BuilderDocument,
  type BuilderSlide,
  type RetrievalItem,
  type SlideTemplate,
  type StarterSlot,
  type UnitOfWork,
  unitOfWorkSchema,
  createBuilderId,
  createInitialBuilderDocument,
  normalizeBuilderDocument,
} from "./schema";
import { applyUnitToLesson } from "./unit-of-work";
import { isLessonDirty } from "./saved-lesson-parity";
import { mergeWorkspaceUnitLibraries } from "./workspace-unit-library";
import { getLinkedBank, normalizeRetrievalBankLinks, retrievalBankKey } from "./retrieval-bank-links";

type MetadataPatch = Partial<
  Pick<BuilderDocument, "title" | "className" | "teachingDate" | "overallLessonLo">
>;

export type SlideContentUpdate =
  | { type: "example"; lo: string; image1: BuilderAsset | null; image2: BuilderAsset | null; answerImage1: BuilderAsset | null; answerImage2: BuilderAsset | null }
  | { type: "cfu"; placement: string; image: BuilderAsset }
  | { type: "worksheet"; title: string; worksheet: BuilderAsset; answers: BuilderAsset | null }
  | { type: "placeholder"; text: string }
  | { type: "math"; latex: string }
  | { type: "template"; title: string; bullets: string[] };

type SavedLessonMetadata = {
  id: string;
  title: string;
  className: string;
  teachingDate: string;
  updatedAt: string;
};

export type LessonSaveToken = { session: number; version: number; attempt: number };

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
  lessonSession: number;
  lessonVersion: number;
  lastCompletedSave: number;
  selectedSlideId: string | null;
  editingSlideId: string | null;
  hydrated: boolean;
  status: BuilderStatus;
  hydrate: (document: unknown) => void;
  openSavedLesson: (document: unknown, metadata: SavedLessonMetadata) => void;
  markLessonSaved: (metadata: SavedLessonMetadata, token: LessonSaveToken, replacement?: BuilderDocument) => boolean;
  updateActiveLessonMetadata: (metadata: SavedLessonMetadata, expectedSavedAt: string, fields: readonly ("title" | "className" | "teachingDate")[]) => void;
  clearActiveLesson: (id?: string) => void;
  updateGlobalData: (patch: GlobalDataPatch) => void;
  linkRetrievalBanks: (left: string, right: string) => void;
  unlinkRetrievalBank: (className: string) => void;
  renameLinkedRetrievalBank: (previousName: string, nextName: string) => void;
  reset: () => void;
  saveUnitOfWork: (unit: UnitOfWork) => void;
  associateUnitOfWork: (id: string) => void;
  refreshUnitOfWork: () => void;
  updateMetadata: (patch: MetadataPatch) => void;
  selectSlide: (slideId: string | null) => void;
  setEditingSlideId: (slideId: string | null) => void;
  toggleHandoutSlide: (slideId: string) => void;
  addBlankSlide: () => void;
  addPlaceholderSlide: (text?: string) => void;
  addStarterSlide: (slots: StarterSlot[]) => void;
  updateStarterSlide: (id: string, slots: StarterSlot[]) => void;
  updateSlideContent: (id: string, update: SlideContentUpdate) => boolean;
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
  immer((set, get) => ({
    document: createInitialBuilderDocument(),
    lessonSession: 0,
    lessonVersion: 0,
    lastCompletedSave: 0,
    selectedSlideId: null,
    editingSlideId: null,
    hydrated: false,
    status: idleStatus,

    hydrate: (input) =>
      set((state) => {
        beginLessonSession(state);
        state.document = normalizeBuilderDocument(input);
        state.selectedSlideId = null;
        state.editingSlideId = null;
        state.hydrated = true;
        state.status = idleStatus;
      }),

    openSavedLesson: (input, metadata) =>
      set((state) => {
        beginLessonSession(state);
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
          unitsOfWork: state.document.unitsOfWork,
          linkedRetrievalBanks: state.document.linkedRetrievalBanks,
          retrievalBankLinksUpdatedAt: state.document.retrievalBankLinksUpdatedAt,
          updatedAt: new Date().toISOString(),
        };
        state.selectedSlideId = null;
        state.editingSlideId = null;
        state.status = {
          tone: "success",
          message: `Opened "${state.document.title}" from the lesson library.`,
        };
      }),

    markLessonSaved: (metadata, token, replacement) => {
      const current = get();
      if (current.lessonSession !== token.session ||
          current.lastCompletedSave >= token.attempt ||
          (replacement && current.lessonVersion !== token.version)) return false;
      set((state) => {
        const previousUpdatedAt = state.document.updatedAt;
        if (replacement) {
          beginLessonSession(state);
          state.document = {
            ...replacement,
            classNames: state.document.classNames,
            retrievalItems: state.document.retrievalItems,
            slideTemplates: state.document.slideTemplates,
            unitsOfWork: mergeWorkspaceUnitLibraries(state.document.unitsOfWork, replacement.unitsOfWork),
            linkedRetrievalBanks: state.document.linkedRetrievalBanks,
            retrievalBankLinksUpdatedAt: state.document.retrievalBankLinksUpdatedAt,
          };
          state.selectedSlideId = null;
          state.editingSlideId = null;
        }
        state.lastCompletedSave = token.attempt;
        state.document.activeLessonId = metadata.id;
        state.document.activeLessonSavedAt = metadata.updatedAt;
        if (replacement || state.lessonVersion === token.version) {
          state.document.lessonUpdatedAt = metadata.updatedAt;
          state.document.title = metadata.title;
          state.document.className = metadata.className;
          state.document.teachingDate = metadata.teachingDate;
        } else {
          state.document.lessonUpdatedAt = nextTimestamp(state.document.lessonUpdatedAt, metadata.updatedAt);
        }
        state.document.classNames = uniqueStrings([metadata.className, ...state.document.classNames]);
        state.document.updatedAt = nextTimestamp(previousUpdatedAt);
      });
      return true;
    },

    updateActiveLessonMetadata: (metadata, expectedSavedAt, fields) =>
      set((state) => {
        if (state.document.activeLessonId !== metadata.id || state.document.activeLessonSavedAt !== expectedSavedAt) return;
        const wasDirty = isLessonDirty(state.document);
        for (const field of fields) state.document[field] = metadata[field];
        state.document.classNames = uniqueStrings([
          metadata.className,
          ...state.document.classNames,
        ]);
        state.document.activeLessonSavedAt = metadata.updatedAt;
        state.lessonVersion++;
        state.document.lessonUpdatedAt = wasDirty
          ? nextTimestamp(state.document.lessonUpdatedAt, metadata.updatedAt)
          : metadata.updatedAt;
        state.document.updatedAt = nextTimestamp(state.document.updatedAt);
      }),

    clearActiveLesson: (id) =>
      set((state) => {
        if (id && state.document.activeLessonId !== id) return;
        beginLessonSession(state);
        state.document.activeLessonId = "";
        state.document.activeLessonSavedAt = "";
        state.document.lessonUpdatedAt = new Date().toISOString();
        state.document.updatedAt = state.document.lessonUpdatedAt;
      }),

    updateGlobalData: (patch) =>
      set((state) => {
        if (patch.classNames) {
          const links = normalizeRetrievalBankLinks(state.document.linkedRetrievalBanks, patch.classNames);
          if (JSON.stringify(links) !== JSON.stringify(state.document.linkedRetrievalBanks)) {
            state.document.linkedRetrievalBanks = links;
            markRetrievalBankLinksEdited(state.document);
          }
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
      }),

    linkRetrievalBanks: (left, right) =>
      set((state) => {
        const links = state.document.linkedRetrievalBanks;
        if (getLinkedBank(links, left) || getLinkedBank(links, right)) throw new Error("A class can have only one linked bank.");
        const valid = normalizeRetrievalBankLinks([[left, right]], state.document.classNames);
        if (!valid.length) throw new Error("Choose two different existing classes.");
        links.push(valid[0]);
        markRetrievalBankLinksEdited(state.document);
      }),

    unlinkRetrievalBank: (className) =>
      set((state) => {
        const key = retrievalBankKey(className);
        const links = state.document.linkedRetrievalBanks.filter(pair => !pair.some(name => retrievalBankKey(name) === key));
        if (links.length === state.document.linkedRetrievalBanks.length) return;
        state.document.linkedRetrievalBanks = links;
        markRetrievalBankLinksEdited(state.document);
      }),

    renameLinkedRetrievalBank: (previousName, nextName) =>
      set((state) => {
        const links = state.document.linkedRetrievalBanks;
        if (!getLinkedBank(links, previousName)) return;
        const previousKey = retrievalBankKey(previousName);
        state.document.linkedRetrievalBanks = normalizeRetrievalBankLinks(
          links.map(pair => pair.map(name => retrievalBankKey(name) === previousKey ? nextName : name)),
        );
        markRetrievalBankLinksEdited(state.document);
      }),

    reset: () =>
      set((state) => {
        beginLessonSession(state);
        const { unitsOfWork, linkedRetrievalBanks, retrievalBankLinksUpdatedAt, classNames } = state.document;
        state.document = { ...createInitialBuilderDocument(), unitsOfWork, linkedRetrievalBanks, retrievalBankLinksUpdatedAt, classNames };
        state.selectedSlideId = null;
        state.editingSlideId = null;
        state.hydrated = true;
        state.status = {
          tone: "success",
          message: "Started a new lesson in the v2 workspace.",
        };
      }),

    saveUnitOfWork: (input) =>
      set((state) => {
        const unit = unitOfWorkSchema.parse(input);
        if (state.document.unitsOfWork.some(entry =>
          entry.id !== unit.id && entry.name.toLowerCase() === unit.name.toLowerCase(),
        )) throw new Error("A unit with that name already exists.");
        const index = state.document.unitsOfWork.findIndex(entry => entry.id === unit.id);
        const previousTime = index < 0 ? 0 : Date.parse(state.document.unitsOfWork[index].updatedAt) || 0;
        const updatedAt = new Date(Math.max(Date.now(), previousTime + 1)).toISOString();
        const saved = { ...unit, updatedAt };
        if (index < 0) state.document.unitsOfWork.push(saved);
        else state.document.unitsOfWork[index] = saved;
        state.document.updatedAt = updatedAt;
      }),

    associateUnitOfWork: (id) =>
      set((state) => {
        const unit = id ? state.document.unitsOfWork.find(entry => entry.id === id) : null;
        if (id && !unit) throw new Error("The source unit is not available in your library.");
        state.document = applyUnitToLesson(state.document, unit || null);
        if (!state.document.slides.some(slide => slide.id === state.selectedSlideId)) state.selectedSlideId = null;
        touchLesson(state);
      }),

    refreshUnitOfWork: () =>
      set((state) => {
        const unit = state.document.unitsOfWork.find(entry => entry.id === state.document.unitOfWorkId);
        if (!unit) throw new Error("The source unit is not available in your library.");
        state.document = applyUnitToLesson(state.document, unit);
        if (!state.document.slides.some(slide => slide.id === state.selectedSlideId)) state.selectedSlideId = null;
        touchLesson(state);
      }),

    updateMetadata: (patch) =>
      set((state) => {
        Object.assign(state.document, patch);
        touchLesson(state);
      }),

    selectSlide: (slideId) =>
      set((state) => {
        state.selectedSlideId = slideId;
      }),

    setEditingSlideId: (slideId) => set({ editingSlideId: slideId }),

    toggleHandoutSlide: (slideId) =>
      set((state) => {
        if (!state.document.slides.some((slide) => slide.id === slideId)) return;
        const selectedIds = new Set(state.document.handoutSlideIds);
        if (selectedIds.has(slideId)) selectedIds.delete(slideId);
        else selectedIds.add(slideId);
        state.document.handoutSlideIds = state.document.slides
          .filter((slide) => selectedIds.has(slide.id))
          .map((slide) => slide.id);
        touchLesson(state);
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

    updateStarterSlide: (id, slots) =>
      set((state) => {
        const slide = state.document.slides.find(entry => entry.id === id && entry.type === "starter");
        if (!slide) return;
        slide.slots = clonePlain(slots).slice(0, 4);
        touchLesson(state);
      }),

    updateSlideContent: (id, update) => {
      const target = get().document.slides.find(slide => slide.id === id);
      if (!target || target.type !== update.type || target.unitOfWorkId || target.unitResourceId) return false;
      set((state) => {
        const slide = state.document.slides.find(entry => entry.id === id)!;
        Object.assign(slide, clonePlain(update));
        touchLesson(state);
      });
      return true;
    },

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
        touchLesson(state);
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
        delete duplicate.unitOfWorkId;
        delete duplicate.unitResourceId;
        duplicate.title = duplicate.title ? `${duplicate.title} copy` : "Slide copy";
        duplicate.createdAt = new Date().toISOString();
        state.document.slides.splice(sourceIndex + 1, 0, duplicate);
        state.selectedSlideId = duplicate.id;
        touchLesson(state);
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
        const selectedIds = new Set(state.document.handoutSlideIds);
        state.document.handoutSlideIds = state.document.slides
          .filter((entry) => selectedIds.has(entry.id))
          .map((entry) => entry.id);
        touchLesson(state);
      }),

    removeSlide: (slideId) =>
      set((state) => {
        const index = state.document.slides.findIndex((slide) => slide.id === slideId);
        if (index < 0) return;
        state.document.slides.splice(index, 1);
        if (state.editingSlideId === slideId) state.editingSlideId = null;
        state.document.handoutSlideIds = state.document.handoutSlideIds.filter(
          (id) => id !== slideId,
        );
        state.selectedSlideId =
          state.document.slides[Math.min(index, state.document.slides.length - 1)]?.id ??
          null;
        touchLesson(state);
      }),

    updateSelectedSlide: (patch) =>
      set((state) => {
        const selected = state.document.slides.find(
          (slide) => slide.id === state.selectedSlideId,
        );
        if (!selected) return;
        Object.assign(selected, patch);
        touchLesson(state);
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
  state: Pick<BuilderStore, "document" | "selectedSlideId" | "lessonVersion">,
  slide: BuilderSlide,
) {
  const selectedIndex = state.document.slides.findIndex(
    (entry) => entry.id === state.selectedSlideId,
  );
  const insertionIndex = selectedIndex < 0 ? state.document.slides.length : selectedIndex + 1;
  state.document.slides.splice(insertionIndex, 0, slide);
  state.selectedSlideId = slide.id;
  touchLesson(state);
}

function beginLessonSession(state: BuilderStore) {
  state.lessonSession++;
  state.lessonVersion = 0;
  state.lastCompletedSave = 0;
}

function touchLesson(state: Pick<BuilderStore, "document" | "lessonVersion">) {
  state.lessonVersion++;
  state.document.updatedAt = nextTimestamp(state.document.updatedAt, state.document.lessonUpdatedAt, state.document.activeLessonSavedAt);
  state.document.lessonUpdatedAt = state.document.updatedAt;
}

function markRetrievalBankLinksEdited(document: BuilderDocument) {
  document.retrievalBankLinksUpdatedAt = nextTimestamp(document.retrievalBankLinksUpdatedAt);
  document.updatedAt = nextTimestamp(document.updatedAt, document.retrievalBankLinksUpdatedAt);
}

function nextTimestamp(...timestamps: string[]) {
  return new Date(Math.max(Date.now(), ...timestamps.map(value => (Date.parse(value) || 0) + 1))).toISOString();
}

function clonePlain<T>(value: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Immer draft proxies are JSON-safe but cannot be passed to structuredClone.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
