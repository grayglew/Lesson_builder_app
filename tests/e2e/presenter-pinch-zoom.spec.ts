import { expect, test } from "@playwright/test";
import { buildStandaloneLessonHtml } from "../../src/features/builder/lesson-export";
import { createInitialBuilderDocument } from "../../src/features/builder/schema";

test("anchors a modest pinch that begins from the fitted presenter", async ({
  page,
}) => {
  const lessonDocument = createInitialBuilderDocument("2026-08-25T00:00:00.000Z");
  lessonDocument.title = "Pinch zoom regression";
  lessonDocument.slides = [
    { id: "blank", type: "blank", title: "Pinch target" },
  ];
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(buildStandaloneLessonHtml(lessonDocument));

  const result = await page.evaluate(() => {
    const slide = document.querySelector<HTMLElement>(".lesson-slide");
    if (!slide) throw new Error("Presenter slide did not render.");
    const startRect = slide.getBoundingClientRect();
    const point = {
      x: startRect.left + startRect.width * 0.2,
      y: startRect.top + startRect.height * 0.35,
    };
    document.dispatchEvent(
      new CustomEvent("lessonpresenterpinch", {
        detail: { phase: "start", scale: 1, clientPoint: point },
      }),
    );
    document.dispatchEvent(
      new CustomEvent("lessonpresenterpinch", {
        detail: { phase: "move", scale: 1.1, clientPoint: point },
      }),
    );
    const zoomedRect = slide.getBoundingClientRect();
    return {
      zoom: slide.style.zoom,
      anchoredX: zoomedRect.left + zoomedRect.width * 0.2,
      anchoredY: zoomedRect.top + zoomedRect.height * 0.35,
      targetX: point.x,
      targetY: point.y,
    };
  });

  expect(result.zoom).toBe("1.1");
  expect(result.anchoredX).toBeCloseTo(result.targetX, 0);
  expect(result.anchoredY).toBeCloseTo(result.targetY, 0);
});

test("clears zoom gutters for presenter printing without removing handout padding", async ({
  page,
}) => {
  const lessonDocument = createInitialBuilderDocument("2026-08-25T00:00:00.000Z");
  lessonDocument.slides = [
    { id: "blank", type: "blank", title: "Print target" },
  ];
  await page.emulateMedia({ media: "print" });

  await page.setContent(buildStandaloneLessonHtml(lessonDocument));
  await page.evaluate(() => document.body.classList.add("is-zoomed"));
  const presenterStyle = await page.locator(".lesson-deck").evaluate((deck) => {
    const style = getComputedStyle(deck);
    return { padding: style.paddingTop, scrollPadding: style.scrollPaddingTop };
  });
  expect(presenterStyle).toEqual({ padding: "0px", scrollPadding: "0px" });

  await page.setContent(
    buildStandaloneLessonHtml(lessonDocument, { handout: true }),
  );
  const handoutStyle = await page.locator(".lesson-deck").evaluate((deck) => {
    const style = getComputedStyle(deck);
    return { display: style.display, padding: Number.parseFloat(style.paddingTop) };
  });
  expect(handoutStyle.display).toBe("grid");
  expect(handoutStyle.padding).toBeGreaterThan(30);
});
