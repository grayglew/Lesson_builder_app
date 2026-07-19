import { describe, expect, it, vi } from "vitest";
import {
  buildStandaloneLessonHtml,
  embedRemoteBuilderAssets,
  normalizeImportedBuilderDocument,
  parseStandaloneLessonHtml,
} from "@/features/builder/lesson-export";
import {
  createInitialBuilderDocument,
  type BuilderDocument,
  type StarterSlot,
} from "@/features/builder/schema";

describe("standalone lesson export", () => {
  it("embeds a round-trippable Builder v2 document", () => {
    const document = lessonDocument();
    const html = buildStandaloneLessonHtml(document, {
      runtimeCss: ".annotation-svg{}",
      runtimeJavaScript: "window.presenterLoaded=true;",
    });

    expect(html).toContain('id="lesson-builder-state"');
    expect(html).toContain("101a: Expand brackets");
    expect(html).toContain("window.presenterLoaded=true");
    expect(parseStandaloneLessonHtml(html)).toMatchObject({
      title: "Algebra lesson",
      className: "Year 9",
      slides: [
        expect.objectContaining({ type: "starter" }),
        expect.objectContaining({ type: "example" }),
      ],
    });
  });

  it("keeps the production scroll presenter toolbar and printable slides", () => {
    const html = buildStandaloneLessonHtml(lessonDocument());

    expect(html).not.toContain('id="presenter-next"');
    expect(html).not.toContain('id="presenter-prev"');
    expect(html).toContain('id="presenter-pan"');
    expect(html).toContain('id="presenter-blank-slide"');
    expect(html).toContain('id="presenter-camera"');
    expect(html).toContain('id="presenter-zoom"');
    expect(html).toContain('data-presenter-color');
    expect(html).toContain('id="presenter-download"');
    expect(html).toContain('id="presenter-pdf"');
    expect(html).toContain('data-qa-toggle="replace"');
    expect(html).toContain("requestFullscreen");
    expect(html).toContain("overflow:auto");
    expect(html).toContain("@media print");
  });

  it("enables production live starter controls, Poll, and Save for hosted presenters", () => {
    const html = buildStandaloneLessonHtml(lessonDocument(), {
      liveRetrieval: {
        enabled: true,
        endpoint: "/api/presenter/retrieval-log",
        nextEndpoint: "/api/presenter/retrieval-next",
        lessonId: "saved-lesson",
        className: "Year 9",
        teachingDate: "2026-07-18",
      },
      presenterConfig: {
        enabled: true,
        sourceLessonId: "saved-lesson",
        originalTitle: "Algebra lesson",
        className: "Year 9",
        teachingDate: "2026-07-18",
        uploadEndpoint: "/api/builder-lessons/upload-url",
        completeEndpoint: "/api/builder-lessons/complete",
        taughtEndpoint: "/api/builder-lessons/taught",
      },
    });

    expect(html).toContain('aria-label="Seen +1"');
    expect(html).toContain('aria-label="Seen -1"');
    expect(html).toContain('aria-label="Next retrieval question"');
    expect(html).toContain('"sourceLessonId":"saved-lesson"');
    expect(html).toContain("if (pollButton) pollButton.hidden = false");
    expect(html).toContain(
      "if (saveBuilderButton) saveBuilderButton.hidden = false",
    );
    expect(html).toContain("showConfidencePollSlide");
    expect(html).toContain("savePresentedLesson");
  });

  it("uses the compact production LO styling without rendering LO text in starter cells", () => {
    const html = buildStandaloneLessonHtml(lessonDocument());

    expect(html).toContain(
      ".lo-bar{display:flex;align-items:center;gap:10px;border-bottom:2px solid #111827",
    );
    expect(html).not.toContain(
      ".slide-title-bar,.lo-bar{padding:12px 16px;background:#0f766e",
    );
    expect(html).not.toContain('<div class="slide-title-bar">Starter</div>');
    expect(html).toContain('<span class="lo-bar-text">101a: Expand brackets</span>');
  });

  it("emits syntactically valid presenter interaction JavaScript", () => {
    const html = buildStandaloneLessonHtml(lessonDocument(), {
      presenterConfig: {
        enabled: true,
        sourceLessonId: "saved-lesson",
        originalTitle: "Algebra lesson",
        className: "Year 9",
        teachingDate: "2026-07-18",
        uploadEndpoint: "/api/builder-lessons/upload-url",
        completeEndpoint: "/api/builder-lessons/complete",
        taughtEndpoint: "/api/builder-lessons/taught",
      },
    });
    const scripts = Array.from(
      html.matchAll(/<script(?![^>]*type=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/gi),
      (match) => match[1],
    );

    expect(scripts.length).toBeGreaterThan(0);
    scripts.forEach((source) => expect(() => new Function(source)).not.toThrow());
  });

  it("preserves a PDF page aspect ratio so portrait pages can scroll", () => {
    const document = lessonDocument();
    document.slides = [
      {
        id: "pdf-page",
        type: "pdf-page",
        title: "Worksheet page 1",
        width: 1200,
        height: 1800,
        aspect: 2 / 3,
        orientation: "portrait",
        image: {
          name: "worksheet-page-1.png",
          type: "image/png",
          size: 10,
          dataUrl: "data:image/png;base64,cGRm",
        },
      },
    ];

    const html = buildStandaloneLessonHtml(document);

    expect(html).toContain(
      'class="lesson-slide pdf-page-slide portrait"',
    );
    expect(html).toContain('data-slide-aspect="0.6666666666666666"');
    expect(html).toContain(
      ".lesson-slide.pdf-page-slide{max-height:none",
    );
  });

  it("preserves current global data when importing a lesson-only payload", () => {
    const current = lessonDocument();
    current.classNames = ["Year 9", "Year 10"];
    current.retrievalItems = [
      {
        id: "retrieval-item",
        lo: "101a: Expand brackets",
        className: "Year 9",
        spacingFactor: 1.3,
        seenCount: 1,
        currentImageSlot: 1,
        selected: false,
        images: [],
        answerImages: [],
      },
    ];

    const imported = normalizeImportedBuilderDocument(
      {
        lessonBuilder: {
          title: "Imported lesson",
          className: "Year 10",
          teachingDate: "2026-07-19",
          slides: [],
        },
      },
      current,
    );

    expect(imported.title).toBe("Imported lesson");
    expect(imported.retrievalItems).toEqual(current.retrievalItems);
    expect(imported.classNames).toEqual(
      expect.arrayContaining(["Year 9", "Year 10"]),
    );
  });

  it("rejects unrelated HTML", () => {
    expect(() =>
      parseStandaloneLessonHtml("<!doctype html><title>Other</title>"),
    ).toThrow("does not contain Lesson Builder data");
  });

  it("embeds remote signed assets once for offline HTML and PDF export", async () => {
    const document = lessonDocument();
    const remoteUrl = "https://assets.example.test/question.png";
    const starter = document.slides[0];
    if (starter.type !== "starter") throw new Error("Expected starter fixture.");
    const starterSlots = (starter as { slots: StarterSlot[] }).slots;
    starterSlots[0].image = {
      name: "question.png",
      type: "image/png",
      size: 8,
      dataUrl: remoteUrl,
    };
    starterSlots[0].answerImage = {
      name: "answer.png",
      type: "image/png",
      size: 8,
      dataUrl: remoteUrl,
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        {
          ok: true,
          blob: async () => new Blob(["question"], { type: "image/png" }),
        } as Response,
      );

    const embedded = await embedRemoteBuilderAssets(document);
    const embeddedStarter = embedded.slides[0];
    const embeddedSlots =
      embeddedStarter.type === "starter"
        ? (embeddedStarter as { slots: StarterSlot[] }).slots
        : [];

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(embeddedSlots[0].image?.dataUrl).toBe(
      "data:image/png;base64,cXVlc3Rpb24=",
    );
    expect(starterSlots[0].image?.dataUrl).toBe(remoteUrl);
    fetchMock.mockRestore();
  });
});

function lessonDocument(): BuilderDocument {
  const document = createInitialBuilderDocument(
    "2026-07-18T06:00:00.000Z",
  );
  document.title = "Algebra lesson";
  document.className = "Year 9";
  document.teachingDate = "2026-07-18";
  document.slides = [
    {
      id: "starter",
      type: "starter",
      title: "Starter",
      slots: [
        {
          lo: "101a: Expand brackets",
          image: {
            name: "question.png",
            type: "image/png",
            size: 8,
            dataUrl: "data:image/png;base64,cXVlc3Rpb24=",
          },
          answerImage: {
            name: "answer.png",
            type: "image/png",
            size: 6,
            dataUrl: "data:image/png;base64,YW5zd2Vy",
          },
        },
      ],
    },
    {
      id: "example",
      type: "example",
      title: "Example",
      lo: "101a: Expand brackets",
      image1: {
        name: "example.png",
        type: "image/png",
        size: 7,
        dataUrl: "data:image/png;base64,ZXhhbXBsZQ==",
      },
      answerImage1: null,
      image2: null,
      answerImage2: null,
    },
  ];
  return document;
}
