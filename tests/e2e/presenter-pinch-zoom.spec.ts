import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildStandaloneLessonHtml } from "../../src/features/builder/lesson-export";
import { createInitialBuilderDocument } from "../../src/features/builder/schema";
import type { PresenterRuntimeController } from "../../src/features/presenter/types";

const presenterRuntimeJavaScript = readFileSync(
  join(process.cwd(), "public", "builder-v2-assets", "presenter-runtime.js"),
  "utf8",
);

test("keeps pen and highlighter geometry stable through button, fit and pinch zoom", async ({ page }) => {
  const lessonDocument = createInitialBuilderDocument("2026-08-25T00:00:00.000Z");
  lessonDocument.slides = [{ id: "blank", type: "blank", title: "Stroke zoom target" }];
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(buildStandaloneLessonHtml(lessonDocument, {
    runtimeJavaScript: presenterRuntimeJavaScript,
  }));
  const result = await page.evaluate(() => {
    const controller = (window as typeof window & {
      __lessonPresenterRuntimeController: PresenterRuntimeController;
    }).__lessonPresenterRuntimeController;
    const slide = document.querySelector<HTMLElement>(".lesson-slide")!;
    const overlay = slide.querySelector<SVGSVGElement>(".annotation-svg")!;
    const zoomButton = document.querySelector<HTMLButtonElement>("#presenter-zoom")!;
    const sizeInput = document.querySelector<HTMLInputElement>("#presenter-size")!;
    sizeInput.value = "4";
    sizeInput.dispatchEvent(new Event("input", { bubbles: true }));
    const snapshot = () => ({
      strokes: controller.getAnnotations()["0"],
      widths: Array.from(overlay.querySelectorAll("path"), (path) => Number(path.getAttribute("stroke-width"))),
      screenScale: overlay.getScreenCTM()!.a,
      layoutWidth: overlay.clientWidth,
      zoom: slide.style.zoom,
    });
    const drawPair = () => {
      for (const [index, mode] of (["pen", "highlighter"] as const).entries()) {
        controller.setMode(mode);
        const rect = overlay.getBoundingClientRect();
        for (const type of ["pointerdown", "pointerup"]) {
          (type === "pointerdown" ? slide : document).dispatchEvent(new PointerEvent(type, {
            bubbles: true, pointerId: 20 + index, pointerType: "mouse", button: 0,
            clientX: rect.left + rect.width * 0.4,
            clientY: rect.top + rect.height * (0.3 + index * 0.2),
          }));
        }
      }
      return snapshot();
    };
    // Enter presentation mode and return to its fitted layout before drawing.
    zoomButton.click();
    zoomButton.click();
    const fit = drawPair();
    zoomButton.click();
    const button = drawPair();
    zoomButton.click();
    const refit = drawPair();
    const rect = slide.getBoundingClientRect();
    const point = { x: rect.left + rect.width * 0.4, y: rect.top + rect.height * 0.4 };
    for (const [phase, scale] of [["start", 1], ["move", 1.6]] as const) {
      document.dispatchEvent(new CustomEvent("lessonpresenterpinch", { detail: { phase, scale, clientPoint: point } }));
    }
    const pinch = drawPair();
    document.dispatchEvent(new CustomEvent("lessonpresenterpinch", { detail: { phase: "end", scale: 1, clientPoint: point } }));
    return { fit, button, refit, pinch, released: snapshot(), viewBox: overlay.getAttribute("viewBox") };
  });
  expect(result.viewBox).toBe("0 0 1600 1000");
  expect(result.button.zoom).toBe("1.6");
  expect(result.refit.zoom).toBe("");
  expect(result.pinch.zoom).toBe("1.6");
  expect(result.released).toEqual(result.pinch);
  expect(result.released.strokes).toHaveLength(8);
  for (const state of [result.fit, result.button, result.refit, result.pinch]) {
    expect(state.layoutWidth).toBe(result.fit.layoutWidth);
    state.strokes.forEach((stroke, index) => {
      expect(stroke.width).toBeCloseTo(result.fit.strokes[index % 2].width, 6);
      expect(state.widths[index]).toBeCloseTo(stroke.width, 6);
      expect(stroke.points[0].x).toBeCloseTo(640, 4);
      expect(stroke.points[0].y).toBeCloseTo(index % 2 ? 500 : 300, 4);
    });
  }
  expect(result.fit.strokes[1].width).toBe(Math.max(18, result.fit.strokes[0].width * 4));
  expect(result.button.screenScale / result.fit.screenScale).toBeCloseTo(1.6, 2);
  expect(result.pinch.screenScale / result.fit.screenScale).toBeCloseTo(1.6, 2);
  expect(result.refit.screenScale).toBeCloseTo(result.fit.screenScale, 6);
});

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
    document.dispatchEvent(
      new CustomEvent("lessonpresenterpinch", {
        detail: { phase: "end", scale: 1, clientPoint: point },
      }),
    );
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

test("retains the pinch zoom after both native touch points are released", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  const lessonDocument = createInitialBuilderDocument("2026-08-25T00:00:00.000Z");
  lessonDocument.title = "Pinch release regression";
  lessonDocument.slides = [
    { id: "blank", type: "blank", title: "Pinch target" },
  ];
  await page.setContent(
    buildStandaloneLessonHtml(lessonDocument, {
      runtimeJavaScript: presenterRuntimeJavaScript,
    }),
  );

  await page.evaluate(() => {
    (
      window as typeof window & {
        __pinchEvents: Array<{ phase: string; scale: number }>;
      }
    ).__pinchEvents = [];
    document.addEventListener("lessonpresenterpinch", (event) => {
      const detail = (event as CustomEvent).detail;
      (
        window as typeof window & {
          __pinchEvents: Array<{ phase: string; scale: number }>;
        }
      ).__pinchEvents.push({
        phase: detail?.phase ?? "missing",
        scale: Number(detail?.scale),
      });
    });
  });
  const client = await context.newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: 400, y: 350, id: 41 },
      { x: 600, y: 350, id: 42 },
    ],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: 350, y: 350, id: 41 },
      { x: 650, y: 350, id: 42 },
    ],
  });
  const zoomAfterMove = await page.locator(".lesson-slide").evaluate(
    (slide: HTMLElement) => slide.style.zoom,
  );
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const result = await page.evaluate((zoomAfterMove) => {
    const slide = document.querySelector<HTMLElement>(".lesson-slide");
    if (!slide) throw new Error("Presenter slide did not render.");
    return {
      events: (
        window as typeof window & {
          __pinchEvents: Array<{ phase: string; scale: number }>;
        }
      ).__pinchEvents,
      zoomAfterMove,
      zoomAfterRelease: slide.style.zoom,
    };
  }, zoomAfterMove);
  await context.close();

  expect(result.zoomAfterMove).toBe("1.5");
  expect(result.zoomAfterRelease).toBe("1.5");
  expect(result.events[0]).toEqual({ phase: "start", scale: 1 });
  expect(result.events.at(-1)).toEqual({ phase: "end", scale: 1.5 });
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
