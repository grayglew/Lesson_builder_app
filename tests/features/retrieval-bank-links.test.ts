import { beforeEach, describe, expect, it } from "vitest";
import { createInitialBuilderDocument, mergeWorkspaceAndGlobal, toWorkspaceDocument, type RetrievalItem } from "@/features/builder/schema";
import { getDueRetrievalItems } from "@/features/builder/retrieval";
import { useBuilderStore } from "@/features/builder/store";
import { selectWorkspaceRetrievalBankLinks } from "@/features/builder/retrieval-bank-links";
import { buildStandaloneLessonHtml, normalizeImportedBuilderDocument } from "@/features/builder/lesson-export";

const initialTime = "2026-11-21T00:00:00.000Z";
const classes = ["10Ma1", "9L2FM", "Year 7", "Year 8"];
const lesson = () => ({ ...createInitialBuilderDocument(initialTime), className: "10Ma1", classNames: classes });

describe("linked retrieval banks", () => {
  beforeEach(() => useBuilderStore.getState().hydrate(lesson()));

  it("persists two independent pairs without editing the saved lesson", () => {
    const store = useBuilderStore.getState();
    store.linkRetrievalBanks("10Ma1", "9L2FM");
    store.linkRetrievalBanks("Year 7", "Year 8");
    const paired = useBuilderStore.getState().document;
    const reopened = mergeWorkspaceAndGlobal(JSON.parse(JSON.stringify(toWorkspaceDocument(paired))), { classNames: classes });
    expect(reopened.linkedRetrievalBanks).toEqual([["10Ma1", "9L2FM"], ["Year 7", "Year 8"]]);
    expect(reopened.className).toBe("10Ma1");
    expect(reopened.lessonUpdatedAt).toBe(initialTime);
    expect(paired.updatedAt).not.toBe(initialTime);
    expect(() => store.linkRetrievalBanks("9L2FM", "Year 7")).toThrow();
    expect(() => store.linkRetrievalBanks("10Ma1", "10ma1")).toThrow();
    store.unlinkRetrievalBank("9L2FM");
    expect(useBuilderStore.getState().document.linkedRetrievalBanks).toEqual([["Year 7", "Year 8"]]);
  });

  it("keeps the workspace link through opening and resetting an older lesson", () => {
    const store = useBuilderStore.getState();
    store.linkRetrievalBanks("10Ma1", "9L2FM");
    store.openSavedLesson(lesson(), { id: "saved", title: "Earlier lesson", teachingDate: "2026-11-21", className: "9L2FM", updatedAt: initialTime });
    expect(useBuilderStore.getState().document.linkedRetrievalBanks).toEqual([["10Ma1", "9L2FM"]]);
    store.reset();
    expect(useBuilderStore.getState().document.linkedRetrievalBanks).toEqual([["10Ma1", "9L2FM"]]);
  });

  it("retains a renamed partner and unlinks a class removed from the managed list", () => {
    const store = useBuilderStore.getState();
    store.linkRetrievalBanks("10Ma1", "9L2FM");
    store.renameLinkedRetrievalBank("9L2FM", "Further Maths");
    expect(useBuilderStore.getState().document.linkedRetrievalBanks).toEqual([["10Ma1", "Further Maths"]]);
    store.updateGlobalData({ classNames: ["10Ma1", "Year 7"] });
    expect(useBuilderStore.getState().document.linkedRetrievalBanks).toEqual([]);
    store.updateGlobalData({ classNames: ["10Ma1", "Year 7", "Further Maths"] });
    expect(useBuilderStore.getState().document.linkedRetrievalBanks).toEqual([]);
  });

  it("does not count unassigned entries in both linked banks", () => {
    const items: RetrievalItem[] = ["10Ma1", "9L2FM", ""].map((className, index) => ({
      id: `item-${index}`, lo: "101a: Test skill", className, spacingFactor: 1.3, currentImageSlot: 1,
      seenCount: 1, lastTaught: "2026-01-01", selected: false, images: [], answerImages: [],
    }));
    expect(getDueRetrievalItems(items, "10Ma1", "2026-11-21", { exactClass: true }).map(item => item.id)).toEqual(["item-0"]);
    expect(getDueRetrievalItems(items, "9L2FM", "2026-11-21", { exactClass: true }).map(item => item.id)).toEqual(["item-1"]);
    expect(getDueRetrievalItems(items, "10Ma1", "2026-11-21")).toHaveLength(2);
  });

  it("preserves a newer cloud unlink despite a later unrelated browser lesson edit", () => {
    const store = useBuilderStore.getState();
    store.linkRetrievalBanks("10Ma1", "9L2FM");
    const browser = structuredClone(useBuilderStore.getState().document);
    store.unlinkRetrievalBank("10Ma1");
    const remote = mergeWorkspaceAndGlobal(toWorkspaceDocument(useBuilderStore.getState().document), { classNames: classes });
    browser.updatedAt = "2099-01-01T00:00:00.000Z";
    expect(selectWorkspaceRetrievalBankLinks(browser, remote).linkedRetrievalBanks).toEqual([]);
    expect(selectWorkspaceRetrievalBankLinks(remote, browser).linkedRetrievalBanks).toEqual([]);
  });

  it("keeps links private to the workspace when exporting or importing a lesson", () => {
    const store = useBuilderStore.getState();
    store.linkRetrievalBanks("10Ma1", "9L2FM");
    const paired = useBuilderStore.getState().document;
    expect(buildStandaloneLessonHtml(paired)).not.toContain('"linkedRetrievalBanks"');
    expect(normalizeImportedBuilderDocument(lesson(), paired).linkedRetrievalBanks).toEqual(paired.linkedRetrievalBanks);
    expect(normalizeImportedBuilderDocument(paired, lesson()).linkedRetrievalBanks).toEqual([]);
  });
});
