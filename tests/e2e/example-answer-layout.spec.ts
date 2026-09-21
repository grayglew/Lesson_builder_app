import { expect, test } from "@playwright/test";
import { buildStandaloneLessonHtml } from "../../src/features/builder/lesson-export";
import { createInitialBuilderDocument } from "../../src/features/builder/schema";

const tallAnswer =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="2400" viewBox="0 0 80 2400"><rect width="80" height="2400" fill="%230f766e"/></svg>';
const question =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="%23d1fae5"/></svg>';

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 375, height: 667 },
]) {
  test(`keeps Example image rows stable and contains a tall answer on ${viewport.name}`, async ({
    page,
  }) => {
    const lessonDocument = createInitialBuilderDocument("2026-09-21T00:00:00.000Z");
    lessonDocument.title = "Example layout";
    lessonDocument.slides = [
      {
        id: "example-layout",
        type: "example",
        title: "Tall answer",
        lo: "101a: Expand brackets",
        image1: {
          name: "question.svg",
          type: "image/svg+xml",
          size: question.length,
          dataUrl: question,
        },
        answerImage1: {
          name: "answer.svg",
          type: "image/svg+xml",
          size: tallAnswer.length,
          dataUrl: tallAnswer,
        },
        image2: {
          name: "question-without-answer.svg",
          type: "image/svg+xml",
          size: question.length,
          dataUrl: question,
        },
        answerImage2: null,
      },
    ];

    await page.setViewportSize(viewport);
    await page.setContent(buildStandaloneLessonHtml(lessonDocument));

    const toggle = page.locator('[data-reveal-key="example-answer-0"]');
    const questionImage = toggle.locator(".qa-question-layer img");
    const answerImage = toggle.locator(".qa-answer-layer img");
    const unanswered = page.locator(".qa-static-append");
    const unansweredQuestion = unanswered.locator(".qa-question-layer img");
    const unansweredAnswerLayer = unanswered.locator(".qa-answer-layer");
    const before = await questionImage.boundingBox();
    const unansweredQuestionBox = await unansweredQuestion.boundingBox();
    const unansweredAnswerBox = await unansweredAnswerLayer.boundingBox();
    const unansweredBox = await unanswered.boundingBox();
    expect(before).not.toBeNull();
    expect(unansweredQuestionBox).not.toBeNull();
    expect(unansweredAnswerBox).not.toBeNull();
    expect(unansweredBox).not.toBeNull();
    await expect(unanswered.locator("button")).toHaveCount(0);
    await expect(unanswered.locator("[data-qa-toggle]")).toHaveCount(0);
    expect(unansweredQuestionBox!.y).toBeCloseTo(unansweredBox!.y, 0);
    expect(unansweredQuestionBox!.height).toBeCloseTo(
      unansweredAnswerBox!.height,
      0,
    );
    expect(unansweredAnswerBox!.y).toBeCloseTo(
      unansweredQuestionBox!.y + unansweredQuestionBox!.height,
      0,
    );

    await toggle.click();
    const after = await questionImage.boundingBox();
    expect(after).not.toBeNull();
    expect(after!.y).toBeCloseTo(before!.y, 0);
    expect(after!.height).toBeCloseTo(before!.height, 0);

    const geometry = await answerImage.evaluate((image) => {
      const answerLayer = image.closest<HTMLElement>(".qa-answer-layer");
      if (!answerLayer) throw new Error("Expected answer layer.");
      const imageRect = image.getBoundingClientRect();
      const layerRect = answerLayer.getBoundingClientRect();
      return {
        scrollHeight: answerLayer.scrollHeight,
        clientHeight: answerLayer.clientHeight,
        scrollWidth: answerLayer.scrollWidth,
        clientWidth: answerLayer.clientWidth,
        imageTop: imageRect.top,
        imageBottom: imageRect.bottom,
        layerTop: layerRect.top,
        layerBottom: layerRect.bottom,
      };
    });
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(geometry.imageTop).toBeGreaterThanOrEqual(geometry.layerTop - 1);
    expect(geometry.imageBottom).toBeLessThanOrEqual(geometry.layerBottom + 1);
  });
}
