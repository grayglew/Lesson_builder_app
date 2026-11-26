import { afterEach, describe, expect, it, vi } from "vitest";
import { buildStandaloneLessonHtml } from "@/features/builder/lesson-export";
import { createInitialBuilderDocument } from "@/features/builder/schema";
import { extractPresenterSource, renderPresenterSession, createCheckpointPreparer } from "@/features/presenter/session-document";
import { createPresenterSession, readPresenterSession } from "@/features/presenter/session-storage";

function sourceHtml() {
  const document = createInitialBuilderDocument();
  document.title = "Recovery lesson";
  document.slides = [{ id: "first", type: "blank", title: "Working" }];
  return buildStandaloneLessonHtml(document, {
    runtimeCss: ".annotation-svg{pointer-events:none}", runtimeJavaScript: "window.runtimeLoaded = true;",
    presenterConfig: { enabled: true, sourceLessonId: "lesson", originalTitle: document.title, className: "Year 7", teachingDate: "2026-11-16", uploadEndpoint: "/upload", completeEndpoint: "/complete", taughtEndpoint: "/taught" },
  });
}

describe("presenter recovery document", () => {
  afterEach(() => vi.restoreAllMocks());
  it("rebuilds clean slide markup and embeds structured annotations and taught-copy identity", () => {
    const source = extractPresenterSource(sourceHtml());
    const document = structuredClone(source.document);
    document.slides[0].annotations = [{ id: "stroke", mode: "pen", color: "#111827", width: 2, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }];
    document.slides.push({ id: "added", type: "blank", title: "Added working" });
    const html = renderPresenterSession(source, { document, slideId: "added", slideIndex: 1, presentedAt: "2026-11-16T02:00:00Z", presentedLessonId: "taught-copy", presentedLessonTitle: "Taught" });
    const parsed = new DOMParser().parseFromString(html, "text/html");
    expect(parsed.querySelectorAll(".lesson-slide")).toHaveLength(2);
    expect(parsed.querySelectorAll(".annotation-svg")).toHaveLength(0);
    expect(JSON.parse(parsed.querySelector("#lesson-annotations-data")!.textContent!)["0"][0].id).toBe("stroke");
    expect(JSON.parse(parsed.querySelector("#lesson-presenter-recovery")!.textContent!)).toMatchObject({ slideId: "added", presentedLessonId: "taught-copy" });
    expect(parsed.querySelector("[data-presenter-runtime]")!.textContent).toContain("window.runtimeLoaded");
  });

  it.each(["stored source", "recovery checkpoint"])("reopens a %s without workspace link fields", (entrypoint) => {
    const source = extractPresenterSource(sourceHtml());
    source.document.linkedRetrievalBanks = [["Year 7", "Year 8"]];
    source.document.handoutSlideIds = ["first"];
    source.document.slides[0].annotations = [{ id: "stroke", mode: "pen", color: "#111827", width: 2, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }];
    const parser = new DOMParser();
    const stored: typeof source.document = JSON.parse(parser.parseFromString(renderPresenterSession(source), "text/html").querySelector("#lesson-builder-state")!.textContent!);
    expect(stored).not.toHaveProperty("linkedRetrievalBanks");
    const html = entrypoint === "stored source"
      ? renderPresenterSession({ ...source, document: stored })
      : renderPresenterSession(source, { document: stored, slideId: "first", slideIndex: 0, presentedAt: "", presentedLessonId: "", presentedLessonTitle: "" });
    const reopened = parser.parseFromString(html, "text/html");
    expect(reopened.querySelectorAll(".lesson-slide[data-marked-for-handout]")).toHaveLength(1);
    expect(JSON.parse(reopened.querySelector("#lesson-annotations-data")!.textContent!)["0"][0].id).toBe("stroke");
  });

  it("escapes checkpoint text so it cannot create a script element", () => {
    const source = extractPresenterSource(sourceHtml());
    const html = renderPresenterSession(source, { document: source.document, slideId: "first", slideIndex: 0, presentedAt: "", presentedLessonId: "", presentedLessonTitle: '</script><script id="injected">bad()</script>' });
    expect(new DOMParser().parseFromString(html, "text/html").querySelector("#injected")).toBeNull();
  });

  it("rejects non-presenter or corrupt source instead of restoring unrelated HTML", () => {
    expect(() => extractPresenterSource("<h1>Not a lesson</h1>")).toThrow();
    expect(() => extractPresenterSource(sourceHtml().replace('"sourceLessonId":"lesson"', '"sourceLessonId":""'))).toThrow();
  });

  it("reports unavailable local storage rather than returning an unsafe temporary URL", async () => {
    await expect(createPresenterSession("actor:teacher", extractPresenterSource(sourceHtml()))).rejects.toThrow(/storage/i);
    await expect(readPresenterSession("actor:teacher", "invalid-id")).rejects.toThrow(/session/i);
  });

  it("embeds a live image once and reuses it for later checkpoints without mutating the live document", async () => {
    const document = extractPresenterSource(sourceHtml()).document;
    document.slides = [{ id: "image", type: "drawing", title: "Image", width: 1600, height: 1000,
      image: { name: "Image", type: "image/png", size: 4, dataUrl: "https://images.test/signed-image" } }];
    const checkpoint = { document, slideId: "image", slideIndex: 0, presentedAt: "now", presentedLessonId: "", presentedLessonTitle: "" };
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("image", { headers: { "Content-Type": "image/png" } }));
    const prepare = createCheckpointPreparer();
    const first = await prepare(checkpoint);
    const second = await prepare(checkpoint);
    expect(JSON.stringify(first.document.slides)).toContain("data:image/png;base64,aW1hZ2U=");
    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(document.slides)).toContain("https://images.test/signed-image");
  });

  it("rejects a failed live image checkpoint instead of retaining an expiring URL", async () => {
    const document = extractPresenterSource(sourceHtml()).document;
    document.slides = [{ id: "image", type: "drawing", title: "Image", width: 1600, height: 1000,
      image: { name: "Image", type: "image/png", size: 4, dataUrl: "https://images.test/expired" } }];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 403 }));
    await expect(createCheckpointPreparer()({ document, slideId: "image", slideIndex: 0, presentedAt: "now", presentedLessonId: "", presentedLessonTitle: "" })).rejects.toThrow(/image/);
  });
});
