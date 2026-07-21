import { describe, expect, it } from "vitest";
import { buildStandaloneLessonHtml } from "@/features/builder/lesson-export";
import {
  confidenceAverageColors,
  createStaticExportDocument,
  expandSlidesForStaticExport,
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
  it("sorts planned lessons first, then date and title", () => {
    const lessons = [
      lessonSummary("taught", "A taught lesson", "2026-01-01", true),
      lessonSummary("later", "Later", "2026-04-02", false),
      lessonSummary("alpha", "Alpha", "2026-04-01", false),
      lessonSummary("beta", "Beta", "2026-04-01", false),
      lessonSummary("undated", "Undated", "", false),
    ];

    expect(sortSavedLessons(lessons).map((lesson) => lesson.id)).toEqual([
      "alpha",
      "beta",
      "later",
      "undated",
      "taught",
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

  it("preserves saved reveal state and creates hidden/shown variants otherwise", () => {
    const document = fixtureDocument();
    const variants = expandSlidesForStaticExport(document.slides);
    expect(variants.map((variant) => variant.answerMode)).toEqual([
      "saved",
      "hidden",
      "shown",
    ]);

    const staticDocument = createStaticExportDocument(document);
    expect(staticDocument.slides).toHaveLength(3);
    expect(staticDocument.slides[0].presentationState).toEqual(
      document.slides[0].presentationState,
    );
    expect(staticDocument.slides[1].presentationState).toMatchObject({
      reveals: {
        "example-answer-0": false,
        "example-answer-1": false,
        "example-second-image": true,
      },
    });
    expect(staticDocument.slides[2].presentationState).toMatchObject({
      reveals: {
        "example-answer-0": true,
        "example-answer-1": true,
        "example-second-image": true,
      },
    });
  });

  it("renders saved reveal state into standalone HTML", () => {
    const html = buildStandaloneLessonHtml(fixtureDocument());
    expect(html).toContain(
      'data-reveal-key="starter-answer-0" aria-pressed="true"',
    );
    expect(html).toContain(
      'data-example-reveal-region data-reveal-key="example-second-image"',
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
    },
  ] as BuilderSlide[];
  return document;
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
