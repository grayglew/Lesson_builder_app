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
        image2: null,
        answerImage2: null,
      },
    ];

    await page.setViewportSize(viewport);
    await page.setContent(buildStandaloneLessonHtml(lessonDocument));

    const toggle = page.locator('[data-reveal-key="example-answer-0"]');
    const questionImage = toggle.locator(".qa-question-layer img");
    const answerImage = toggle.locator(".qa-answer-layer img");
    const before = await questionImage.boundingBox();
    expect(before).not.toBeNull();

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
