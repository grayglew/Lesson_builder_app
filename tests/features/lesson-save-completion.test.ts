import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialBuilderDocument } from "@/features/builder/schema";
import { useBuilderStore, type LessonSaveToken } from "@/features/builder/store";
import { isLessonDirty } from "@/features/builder/saved-lesson-parity";

const original = "2026-11-19T00:00:00.000Z";
const saved = { id: "lesson-a", title: "Lesson A", className: "8Ma5", teachingDate: "2026-11-19", updatedAt: "2026-11-19T00:00:05.123456+00:00" };
function token(attempt = 1): LessonSaveToken {
  const state = useBuilderStore.getState();
  return { session: state.lessonSession, version: state.lessonVersion, attempt };
}
describe("snapshot-aware lesson confirmations", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(original));
    useBuilderStore.getState().hydrate({ ...createInitialBuilderDocument(original),
      title: "Lesson A", className: "8Ma5", activeLessonId: "lesson-a",
      activeLessonSavedAt: original, lessonUpdatedAt: original });
  });
  afterEach(() => vi.useRealTimers());

  it("keeps slides added during upload dirty despite a later server timestamp", () => {
    const captured = token();
    useBuilderStore.getState().addBlankSlide();
    useBuilderStore.getState().markLessonSaved(saved, captured);
    expect(useBuilderStore.getState().document.slides).toHaveLength(1);
    expect(isLessonDirty(useBuilderStore.getState().document)).toBe(true);
    expect(useBuilderStore.getState().document.activeLessonSavedAt).toBe(saved.updatedAt);
  });
  it("does not overwrite a title edited while saving", () => {
    const captured = token();
    useBuilderStore.getState().updateMetadata({ title: "Newer title" });
    useBuilderStore.getState().markLessonSaved(saved, captured);
    expect(useBuilderStore.getState().document.title).toBe("Newer title");
    expect(isLessonDirty(useBuilderStore.getState().document)).toBe(true);
  });
  it("ignores completion after opening another lesson", () => {
    const captured = token();
    useBuilderStore.getState().openSavedLesson(createInitialBuilderDocument(original), { ...saved, id: "lesson-b", title: "Lesson B" });
    expect(useBuilderStore.getState().markLessonSaved(saved, captured)).toBe(false);
    expect(useBuilderStore.getState().document.activeLessonId).toBe("lesson-b");
  });
  it("ignores completion even after reopening the same lesson ID", () => {
    const captured = token();
    useBuilderStore.getState().openSavedLesson(createInitialBuilderDocument(original), saved);
    expect(useBuilderStore.getState().markLessonSaved(saved, captured)).toBe(false);
  });
  it("ignores an older confirmation after a newer attempt completed", () => {
    const first = token(1), second = token(2);
    expect(useBuilderStore.getState().markLessonSaved(saved, second)).toBe(true);
    expect(useBuilderStore.getState().markLessonSaved({ ...saved, title: "Old" }, first)).toBe(false);
    expect(useBuilderStore.getState().document.title).toBe("Lesson A");
  });
  it("detects edits in the same clock millisecond as the saved version", () => {
    useBuilderStore.getState().addBlankSlide();
    expect(isLessonDirty(useBuilderStore.getState().document)).toBe(true);
  });
  it("does not let fresh metadata legitimize stale slide content", () => {
    useBuilderStore.getState().updateActiveLessonMetadata({ ...saved, title: "Renamed elsewhere" }, "2026-11-19T00:00:03.000Z", ["title"]);
    expect(useBuilderStore.getState().document.activeLessonSavedAt).toBe(original);
    expect(useBuilderStore.getState().document.title).toBe("Lesson A");
  });
  it.each([
    { fields: [], title: "Draft title", className: "Draft class", teachingDate: "2026-12-01" },
    { fields: ["title"], title: "Lesson A", className: "Draft class", teachingDate: "2026-12-01" },
    { fields: ["className"], title: "Draft title", className: "8Ma5", teachingDate: "2026-12-01" },
  ] as const)("applies only intended metadata fields $fields without discarding other draft edits", ({ fields, ...expected }) => {
    useBuilderStore.getState().updateMetadata({ title: "Draft title", className: "Draft class", teachingDate: "2026-12-01" });
    useBuilderStore.getState().updateActiveLessonMetadata(saved, original, fields);
    expect(useBuilderStore.getState().document).toMatchObject(expected);
    expect(useBuilderStore.getState().document.activeLessonSavedAt).toBe(saved.updatedAt);
    expect(isLessonDirty(useBuilderStore.getState().document)).toBe(true);
  });
  it("confirms only the submitted unchanged content and retains raw server precision", () => {
    expect(useBuilderStore.getState().markLessonSaved(saved, token())).toBe(true);
    expect(isLessonDirty(useBuilderStore.getState().document)).toBe(false);
    expect(useBuilderStore.getState().document.activeLessonSavedAt).toBe("2026-11-19T00:00:05.123456+00:00");
  });
});
