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

  it("includes presenter navigation, answer reveals, and printable slides", () => {
    const html = buildStandaloneLessonHtml(lessonDocument());

    expect(html).toContain('id="presenter-next"');
    expect(html).toContain('data-qa-toggle="replace"');
    expect(html).toContain("requestFullscreen");
    expect(html).toContain("@media print");
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
