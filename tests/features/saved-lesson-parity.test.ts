import { describe, expect, it } from "vitest";
import { buildStandaloneLessonHtml } from "@/features/builder/lesson-export";
import {
  confidenceAverageColors,
  createAnswerKeyExportDocument,
  createSavedStateExportDocument,
  isLessonDirty,
  sortSavedLessons,
  usableConfidenceSummary,
} from "@/features/builder/saved-lesson-parity";
import {
  createInitialBuilderDocument,
  type BuilderDocument,
  type BuilderSlide,
} from "@/features/builder/schema";

describe("saved lesson production parity", () => {
  it("sorts newest teaching dates first, then title, with undated lessons last", () => {
    const lessons = [
      lessonSummary("taught", "A taught lesson", "2026-01-01", true),
      lessonSummary("later", "Later", "2026-04-02", false),
      lessonSummary("alpha", "Alpha", "2026-04-01", false),
      lessonSummary("beta", "Beta", "2026-04-01", false),
      lessonSummary("undated", "Undated", "", false),
    ];

    expect(sortSavedLessons(lessons).map((lesson) => lesson.id)).toEqual([
      "later",
      "alpha",
      "beta",
      "taught",
      "undated",
    ]);
  });

  it("uses the production 500ms dirty threshold", () => {
    const document = createInitialBuilderDocument("2026-07-19T01:00:00.000Z");
    document.activeLessonSavedAt = "2026-07-19T01:00:00.000Z";
    document.lessonUpdatedAt = "2026-07-19T01:00:00.500Z";
    expect(isLessonDirty(document)).toBe(false);
    document.lessonUpdatedAt = "2026-07-19T01:00:00.501Z";
    expect(isLessonDirty(document)).toBe(true);
  });

  it("only exposes confidence results with responses and an average", () => {
    const lesson = {
      ...lessonSummary("confidence", "Confidence", "2026-04-01", false),
      confidenceSummary: {
        version: 1 as const,
        counts: { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4 },
        total: 10,
        average: 4,
        completedAt: "2026-07-19T01:00:00.000Z",
      },
    };
    expect(usableConfidenceSummary(lesson)?.counts["5"]).toBe(4);
    expect(
      usableConfidenceSummary({
        ...lesson,
        confidenceSummary: { ...lesson.confidenceSummary, total: 0 },
      }),
    ).toBeNull();
  });

  it("interpolates the production confidence row colour scale", () => {
    expect(confidenceAverageColors(1)).toEqual({
      background: "#fee2e2",
      border: "#ef4444",
    });
    expect(confidenceAverageColors(4.2)).toEqual({
      background: "#d5fbe2",
      border: "#20be5a",
    });
    expect(confidenceAverageColors(5)).toEqual({
      background: "#bbf7d0",
      border: "#16a34a",
    });
  });

  it("preserves valid saved state and defaults missing or malformed state to question-first", () => {
    const document = fixtureDocument();
    const saved = createSavedStateExportDocument(document);

    expect(saved.slides.map((slide) => slide.id)).toEqual(
      document.slides.map((slide) => slide.id),
    );
    expect(saved.slides).toHaveLength(document.slides.length);
    expect(saved.slides[0].presentationState).toEqual(
      document.slides[0].presentationState,
    );
    expect(saved.slides[1].presentationState).toMatchObject({
      reveals: {
        "example-answer-0": false,
        "example-answer-1": false,
        "example-second-image": false,
      },
    });
    expect(saved.slides[2].presentationState).toMatchObject({
      reveals: { "revision-answer-0": false },
    });
    expect(saved.slides.every((slide) => slide.annotations?.length === 1)).toBe(
      true,
    );
  });

  it("creates an all-answers key without mutating the source document", () => {
    const document = fixtureDocument();
    const before = structuredClone(document);
    const answers = createAnswerKeyExportDocument(document);

    expect(answers.slides).toHaveLength(document.slides.length);
    expect(presentationReveals(answers.slides[0])["starter-answer-0"]).toBe(
      true,
    );
    expect(presentationReveals(answers.slides[1])).toMatchObject({
      "example-answer-0": true,
      "example-answer-1": true,
      "example-second-image": true,
    });
    expect(presentationReveals(answers.slides[2])["revision-answer-0"]).toBe(
      true,
    );
    expect(answers.slides.every((slide) => !slide.annotations?.length)).toBe(
      true,
    );
    expect(document).toEqual(before);
  });

  it("preserves saved reveal maps that contain only rendered controls", () => {
    const document = fixtureDocument();
    const starter = document.slides[0] as Extract<BuilderSlide, { type: "starter" }>;
    const example = document.slides[1];
    const revision = document.slides[2] as Extract<BuilderSlide, { type: "revision" }>;
    if (
      starter.type !== "starter" ||
      example.type !== "example" ||
      revision.type !== "revision"
    ) {
      throw new Error("Expected the reveal fixture slides.");
    }

    starter.slots.push({
      lo: "No answer",
      image: starter.slots[0]?.image,
      answerImage: null,
    });
    starter.presentationState = {
      version: 1,
      reveals: { "starter-answer-0": true },
    };
    example.image2 = null;
    example.answerImage2 = null;
    example.presentationState = {
      version: 1,
      reveals: { "example-answer-0": true },
    };
    revision.items.push({
      lo: "No answer",
      image: revision.items[0]?.image,
      answerImage: null,
    });
    revision.presentationState = {
      version: 1,
      reveals: { "revision-answer-0": true },
    };

    const saved = createSavedStateExportDocument(document);

    expect(saved.slides[0].presentationState).toEqual(
      starter.presentationState,
    );
    expect(saved.slides[1].presentationState).toEqual(
      example.presentationState,
    );
    expect(saved.slides[2].presentationState).toEqual(
      revision.presentationState,
    );
  });

  it("resets a partial reveal map when a rendered control is missing", () => {
    const document = fixtureDocument();
    const example = document.slides[1];
    if (example.type !== "example") throw new Error("Expected Example slide.");
    example.presentationState = {
      version: 1,
      reveals: { "example-answer-0": true },
    };

    const saved = createSavedStateExportDocument(document);

    expect(saved.slides[1].presentationState).toEqual({
      version: 1,
      reveals: {
        "example-answer-0": false,
        "example-answer-1": false,
        "example-second-image": false,
      },
    });
  });

  it.each([
    ["boolean true", true],
    ["array [1]", [1]],
  ])(
    "resets a %s presentation-state version to question-first",
    (_label, version) => {
      const document = fixtureDocument();
      const example = document.slides[1];
      if (example.type !== "example") throw new Error("Expected Example slide.");
      example.presentationState = {
        version,
        reveals: {
          "example-answer-0": true,
          "example-answer-1": true,
          "example-second-image": true,
        },
      };

      const saved = createSavedStateExportDocument(document);
      const html = buildStandaloneLessonHtml(saved);

      expect(saved.slides[1].presentationState).toEqual({
        version: 1,
        reveals: {
          "example-answer-0": false,
          "example-answer-1": false,
          "example-second-image": false,
        },
      });
      expect(html).toContain(
        'data-example-reveal-region data-reveal-key="example-second-image" aria-hidden="true"',
      );
      expect(html).toContain(
        'data-reveal-key="example-answer-0" aria-pressed="false"',
      );
    },
  );

  it("renders the saved and answer-key documents with their distinct PDF states", () => {
    const document = fixtureDocument();
    const savedHtml = buildStandaloneLessonHtml(
      createSavedStateExportDocument(document),
      { staticAnnotations: true },
    );
    const answerHtml = buildStandaloneLessonHtml(
      createAnswerKeyExportDocument(document),
      { staticAnnotations: true },
    );

    expect(savedHtml.match(/data-builder-slide-id=/g)).toHaveLength(
      document.slides.length,
    );
    expect(
      savedHtml.match(/<svg class="annotation-svg static-annotation-svg"/g),
    ).toHaveLength(document.slides.length);
    expect(savedHtml).toContain(
      'data-example-reveal-region data-reveal-key="example-second-image" aria-hidden="true"',
    );
    expect(savedHtml).toContain(
      'data-reveal-key="example-answer-0" aria-pressed="false"',
    );
    expect(answerHtml.match(/data-builder-slide-id=/g)).toHaveLength(
      document.slides.length,
    );
    expect(answerHtml).toContain(
      'data-reveal-key="starter-answer-0" aria-pressed="true"',
    );
    expect(answerHtml).toContain(
      'data-reveal-key="example-answer-1" aria-pressed="true"',
    );
    expect(answerHtml).toContain(
      'data-reveal-key="revision-answer-0" aria-pressed="true"',
    );
    expect(answerHtml).toContain(
      'data-example-reveal-region data-reveal-key="example-second-image" aria-hidden="false"',
    );
    expect(answerHtml).not.toContain(
      '<svg class="annotation-svg static-annotation-svg"',
    );
  });
});

function fixtureDocument(): BuilderDocument {
  const document = createInitialBuilderDocument("2026-07-19T01:00:00.000Z");
  const image = {
    name: "question.png",
    type: "image/png",
    size: 3,
    dataUrl: "data:image/png;base64,cW4=",
  };
  const answer = {
    name: "answer.png",
    type: "image/png",
    size: 3,
    dataUrl: "data:image/png;base64,YW4=",
  };
  document.slides = [
    {
      id: "starter",
      type: "starter",
      title: "Starter",
      slots: [{ lo: "LO", image, answerImage: answer }],
      annotations: [annotation("starter")],
      presentationState: {
        version: 1,
        reveals: { "starter-answer-0": true },
      },
    },
    {
      id: "example",
      type: "example",
      title: "Example",
      lo: "LO",
      image1: image,
      answerImage1: answer,
      image2: image,
      answerImage2: answer,
      annotations: [annotation("example")],
    },
    {
      id: "revision",
      type: "revision",
      title: "Revision",
      items: [{ lo: "LO", image, answerImage: answer }],
      annotations: [annotation("revision")],
      presentationState: { version: 1, reveals: [] },
    },
    {
      id: "blank",
      type: "blank",
      title: "Blank",
      annotations: [annotation("blank")],
    },
  ] as BuilderSlide[];
  return document;
}

function annotation(id: string) {
  return {
    id: `annotation-${id}`,
    mode: "pen" as const,
    color: "#dc2626",
    width: 6,
    points: [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ],
  };
}

function presentationReveals(slide: BuilderSlide): Record<string, boolean> {
  const state = slide.presentationState as
    | { reveals?: Record<string, boolean> }
    | undefined;
  return state?.reveals ?? {};
}

function lessonSummary(
  id: string,
  title: string,
  teachingDate: string,
  isTaught: boolean,
) {
  return {
    id,
    title,
    className: "Year 9",
    teachingDate,
    byteSize: 100,
    taughtAt: isTaught ? "2026-07-19T01:00:00.000Z" : "",
    isTaught,
    createdAt: "2026-07-19T01:00:00.000Z",
    updatedAt: "2026-07-19T01:00:00.000Z",
  };
}
