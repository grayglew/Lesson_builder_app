import { describe, expect, it } from "vitest";
import { createInitialBuilderDocument } from "../../src/features/builder/schema";
import { prepareNewLessonDocument } from "../../src/features/builder/new-lesson";

const details = { title: "  Language  of probability ", className: "7Ma3", teachingDate: "2026-09-26" };
function currentLesson() {
  return { ...createInitialBuilderDocument(), unitOfWorkId: "old", unitOfWorkName: "Probability",
    unitsOfWork: [{ id: "old", name: "Probability", updatedAt: "now", slides: [{ id: "old-resource", title: "Resources", bullets: ["Support"] }] }],
    slides: [{ id: "old-slide", type: "blank" as const, title: "Current slide" }] };
}

describe("new lesson document preparation", () => {
  it("does not inherit the old association and preserves private libraries without mutating the current lesson", () => {
    const current = currentLesson();
    const before = JSON.stringify(current);
    const next = prepareNewLessonDocument(current, details);
    expect(next).toMatchObject({ title: "7Ma3 Language of probability 26-09", overallLessonLo: "Language of probability", teachingDate: "2026-09-26", unitOfWorkId: "", slides: [], unitsOfWork: current.unitsOfWork });
    expect(JSON.stringify(current)).toBe(before);
  });

  it.each(["", "  PROBABILITY  ", "x".repeat(201)])("rejects an invalid new unit name without changing the library: %s", name => {
    const current = currentLesson();
    expect(() => prepareNewLessonDocument(current, { ...details, unit: { mode: "new", name } })).toThrow();
    expect(current.unitsOfWork).toHaveLength(1);
    expect(current.slides[0].id).toBe("old-slide");
  });

  it("rejects a no-longer-available existing unit", () => {
    expect(() => prepareNewLessonDocument(currentLesson(), { ...details, unit: { mode: "existing", id: "missing" } })).toThrow(/not available/);
  });

  it("creates independent unit and slide identities without selecting resources for the handout", () => {
    const current = currentLesson();
    const next = prepareNewLessonDocument(current, { ...details, unit: { mode: "new", name: "  Data   handling  " } });
    expect(current.unitsOfWork).toHaveLength(1);
    expect(next.unitsOfWork).toHaveLength(2);
    expect(next.unitOfWorkName).toBe("Data handling");
    expect(next.unitsOfWork[1].id).toBe(next.unitOfWorkId);
    expect(next.slides[0].unitResourceId).toBe(next.unitsOfWork[1].slides[0].id);
    expect(next.slides[0].id).not.toBe(next.unitsOfWork[1].slides[0].id);
    expect(next.handoutSlideIds).toEqual([]);
  });
});
