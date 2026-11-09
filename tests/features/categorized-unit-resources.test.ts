import { describe, expect, it } from "vitest";
// @ts-expect-error -- test-only transitive dependency
import { JSDOM } from "jsdom";
import { createInitialBuilderDocument, normalizeBuilderDocument, toWorkspaceDocument } from "../../src/features/builder/schema";
import { useBuilderStore } from "../../src/features/builder/store";
import { buildStandaloneLessonHtml } from "../../src/features/builder/lesson-export";
import { buildA4Handout } from "../../src/features/builder/handout-export";
import { safeUnitResourceHref } from "../../src/features/builder/unit-resources";

export const resources = {
  video: "https://example.org/video", supportSheet: "https://example.org/support.pdf",
  email: "teacher@school.org", practice: "https://drive.google.com/drive/folders/example",
  examQuestions: "Ask me for a challenge", mathsChallenge: "https://example.org/challenge",
  investigation: "<strong>Try an investigation</strong>",
};

function documentWithResources() {
  const document = createInitialBuilderDocument();
  document.overallLessonLo = "Probability";
  document.slides = [{ id: "resources", type: "template", title: "Probability resources", resources, bullets: [] }];
  document.handoutSlideIds = ["resources"];
  return document;
}

describe("categorized unit resource slides", () => {
  it.each([
    ["https://example.org/a?b=1", false, "https://example.org/a?b=1"],
    ["teacher@school.org", true, "mailto:teacher@school.org"],
    ["teacher#support@school.org", true, "mailto:teacher%23support@school.org"],
    ["mailto:teacher%23support@school.org", true, "mailto:teacher%23support@school.org"],
    ["mailto:teacher@school.org?subject=Please%20help", true, "mailto:teacher@school.org?subject=Please%20help"],
    ["teacher@school.org", false, null],
    ["mailto:teacher@school.org?bcc=someone@else.org", true, null],
    ["mailto:teacher@school.org?subject=Hi%0aBcc%3Aevil", true, null],
    ["a@school..org", true, null],
    ["a..b@school.org", true, null],
    ["javascript:alert(1)", false, null],
    ["data:text/html,bad", false, null],
    ["https://user:secret@example.org", false, null],
    ["https:\n//example.org", false, null],
    ["Ask your teacher", true, null],
  ])("validates resource destination %s", (input, email, expected) => {
    expect(safeUnitResourceHref(input, email)).toBe(expected);
  });
  it("renders all three categories, labelled links and literal non-clickable notes", () => {
    const dom = new JSDOM(buildStandaloneLessonHtml(documentWithResources()));
    const slide = dom.window.document.querySelector('[data-builder-slide-id="resources"]')!;
    expect(Array.from(slide.querySelectorAll("h5")).map(node => (node as Element).textContent)).toEqual(["Support", "Practice", "Going deeper"]);
    expect(slide.querySelector('a[href="https://example.org/video"]')?.textContent).toContain("Video");
    expect(slide.querySelector('a[href="mailto:teacher@school.org"]')?.textContent).toContain("Email your teacher");
    expect(slide.textContent).not.toContain("https://");
    expect(slide.textContent).toContain("Ask me for a challenge");
    expect(slide.textContent).toContain("<strong>Try an investigation</strong>");
    expect(slide.querySelector("strong")).toBeNull();
    expect(slide.querySelectorAll("a")).toHaveLength(5);
    dom.window.close();
  });

  it("persists structured fields through unit save, snapshot refresh and workspace round trip", () => {
    const unit = { id: "unit", name: "Probability", updatedAt: "2026-11-09T00:00:00Z", slides: [{ id: "links", title: "Resources", bullets: ["Earlier text"], resources }] };
    useBuilderStore.getState().hydrate(createInitialBuilderDocument());
    useBuilderStore.getState().saveUnitOfWork(unit);
    useBuilderStore.getState().associateUnitOfWork("unit");
    const document = useBuilderStore.getState().document;
    expect(document.slides[0].resources).toEqual(resources);
    const restored = normalizeBuilderDocument(toWorkspaceDocument(document));
    expect(restored.unitsOfWork[0].slides[0].resources).toEqual(resources);
    expect(restored.unitsOfWork[0].slides[0].bullets).toEqual(["Earlier text"]);
  });

  it("does not trim away control characters before validating a pasted URL", () => {
    const document = documentWithResources();
    document.slides[0].resources = { ...resources, video: "\nhttps://example.org/video" };
    const dom = new JSDOM(buildStandaloneLessonHtml(document));
    expect(Boolean(dom.window.document.querySelector('a[href="https://example.org/video"]'))).toBe(false);
    dom.window.close();
  });

  it("uses the same labelled links and notes in the handout", async () => {
    const result = await buildA4Handout(documentWithResources());
    const dom = new JSDOM(result.html);
    expect(dom.window.document.querySelector('a[href="https://example.org/video"]')?.textContent).toContain("Video");
    expect(dom.window.document.querySelector('a[href="mailto:teacher@school.org"]')).not.toBeNull();
    expect(dom.window.document.body.textContent).toContain("Ask me for a challenge");
    dom.window.close();
  });
});
