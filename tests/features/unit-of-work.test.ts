import { beforeEach, describe, expect, it } from "vitest";
import { createInitialBuilderDocument, mergeWorkspaceAndGlobal, normalizeBuilderDocument, toWorkspaceDocument } from "../../src/features/builder/schema";
import { useBuilderStore } from "../../src/features/builder/store";

const unit = {
  id: "probability", name: "Probability", updatedAt: "2026-11-07T10:00:00Z",
  slides: [{ id: "resources", title: "Probability resources", bullets: ["[Practice](https://example.org/practice)"] }],
};
const metadata = { id: "saved", title: "Saved lesson", className: "7Ma3", teachingDate: "2026-11-07", updatedAt: "2026-11-07T11:00:00Z" };

beforeEach(() => useBuilderStore.getState().hydrate(createInitialBuilderDocument()));

describe("unit-of-work persistence and snapshots", () => {
  it("opens legacy documents with no unit and an empty catalogue", () => {
    const document = normalizeBuilderDocument({});
    expect(document.unitsOfWork).toEqual([]);
    expect(document.unitOfWorkId).toBe("");
  });

  it("keeps the private catalogue through workspace and global merge", () => {
    const document = normalizeBuilderDocument({ unitsOfWork: [unit] });
    expect(mergeWorkspaceAndGlobal(toWorkspaceDocument(document), {}).unitsOfWork).toEqual([unit]);
  });

  it("drops malformed catalogue entries rather than breaking old lessons", () => {
    expect(normalizeBuilderDocument({ unitsOfWork: [null, { id: "bad" }, unit] }).unitsOfWork).toEqual([unit]);
  });

  it("preserves the catalogue through opening another lesson and resetting", () => {
    useBuilderStore.getState().hydrate({ ...createInitialBuilderDocument(), unitsOfWork: [unit] });
    useBuilderStore.getState().openSavedLesson({}, metadata);
    expect(useBuilderStore.getState().document.unitsOfWork).toEqual([unit]);
    useBuilderStore.getState().reset();
    expect(useBuilderStore.getState().document.unitsOfWork).toEqual([unit]);
    expect(useBuilderStore.getState().document.unitOfWorkId).toBe("");
  });

  it("associates copies without touching ordinary slides and keeps saved snapshots unchanged after editing the source", () => {
    useBuilderStore.getState().hydrate({ ...createInitialBuilderDocument(), unitsOfWork: [unit], slides: [{ id: "starter", type: "blank", title: "First" }] });
    useBuilderStore.getState().associateUnitOfWork("probability");
    const snapshot = structuredClone(useBuilderStore.getState().document);
    expect(snapshot.slides.map(slide => slide.title)).toEqual(["First", "Probability resources"]);
    expect(snapshot.unitOfWorkName).toBe("Probability");
    useBuilderStore.getState().saveUnitOfWork({ ...unit, name: "Updated probability", slides: [{ ...unit.slides[0], title: "Updated resources" }] });
    expect(useBuilderStore.getState().document.slides[1].title).toBe("Probability resources");
    expect(snapshot.slides[1].title).toBe("Probability resources");
  });

  it("refreshes at the same deck position and retains matching resource IDs and handout selection", () => {
    useBuilderStore.getState().hydrate({ ...createInitialBuilderDocument(), unitsOfWork: [unit] });
    useBuilderStore.getState().associateUnitOfWork(unit.id);
    const resourceId = useBuilderStore.getState().document.slides[0].id;
    useBuilderStore.getState().toggleHandoutSlide(resourceId);
    useBuilderStore.getState().addBlankSlide();
    useBuilderStore.getState().saveUnitOfWork({ ...unit, slides: [{ ...unit.slides[0], title: "Updated" }, { id: "more", title: "More", bullets: [] }] });
    useBuilderStore.getState().refreshUnitOfWork();
    const document = useBuilderStore.getState().document;
    expect(document.slides.map(slide => slide.title)).toEqual(["Updated", "More", "Blank"]);
    expect(document.slides[0].id).toBe(resourceId);
    expect(document.handoutSlideIds).toEqual([resourceId]);
    expect(document.unitOfWorkVersion).toBe(document.unitsOfWork[0].updatedAt);
  });

  it("detaches duplicated resources and clearing a unit keeps that duplicate", () => {
    useBuilderStore.getState().hydrate({ ...createInitialBuilderDocument(), unitsOfWork: [unit] });
    useBuilderStore.getState().associateUnitOfWork(unit.id);
    useBuilderStore.getState().duplicateSlide(useBuilderStore.getState().document.slides[0].id);
    useBuilderStore.getState().associateUnitOfWork("");
    const slides = useBuilderStore.getState().document.slides;
    expect(slides).toHaveLength(1);
    expect(slides[0].unitOfWorkId).toBeUndefined();
  });

  it("does not erase snapshots when the source is unavailable", () => {
    useBuilderStore.getState().hydrate({ ...createInitialBuilderDocument(), unitOfWorkId: "missing", slides: [{ id: "existing", type: "template", title: "Old resources", unitOfWorkId: "missing", bullets: [] }] });
    expect(() => useBuilderStore.getState().refreshUnitOfWork()).toThrow(/not available/i);
    expect(useBuilderStore.getState().document.slides[0].id).toBe("existing");
  });
});
