import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { buildStandaloneLessonHtml } from "../../src/features/builder/lesson-export";
import { createInitialBuilderDocument } from "../../src/features/builder/schema";

const runtimeJavaScript = readFileSync("public/builder-v2-assets/presenter-runtime.js", "utf8");
const runtimeCss = readFileSync("src/features/presenter/presenter-runtime.css", "utf8");
const lesson = createInitialBuilderDocument();
lesson.title = "Expanding and factorising quadratics";
lesson.className = "Year 9";
const picture = { name: "Practice image", type: "image/svg+xml", size: 90, dataUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='100'/%3E" };
lesson.slides = [
  { id: "starter", type: "starter", title: "Working space", slots: [{ lo: "101a: Expand", image: picture, answerImage: picture }] },
  { id: "practice", type: "example", title: "Independent practice", lo: "Expand", image1: picture, answerImage1: picture, image2: picture, answerImage2: picture },
  { id: "work", type: "template", title: "Independent work", bullets: ["Complete questions 1–6"] },
  { id: "worksheet", type: "pdf-page", title: "Worksheet", width: 760, height: 1080, image: picture },
  { id: "blank", type: "blank", title: "Extra working" },
];
const html = buildStandaloneLessonHtml(lesson, {
  runtimeCss, runtimeJavaScript,
  presenterConfig: {
    enabled: true, sourceLessonId: "tablet-test", originalTitle: lesson.title,
    className: lesson.className, teachingDate: lesson.teachingDate,
    uploadEndpoint: "/ticket", completeEndpoint: "/complete", taughtEndpoint: "/taught",
    studentSession: { sessionId: "demo", code: "ABC-123", viewerUrl: "/student", expiresAt: "2099-01-01" },
    studentSessionUploadEndpoint: "/student-ticket", studentSessionCompleteEndpoint: "/student-complete",
  },
});

test("tablet controls remain in bounds and session actions do not require sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.setContent(html);
  const toolbar = page.getByRole("region", { name: "Presenter controls" });
  expect((await toolbar.boundingBox())!.height).toBeLessThanOrEqual(56);
  const count = toolbar.locator("#presenter-slide-position span");
  expect(await count.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(toolbar.getByRole("button", { name: "Undo" })).toBeInViewport({ ratio: 1 });
  for (const name of ["Save to Builder", "Update student view"]) {
    const action = toolbar.getByRole("button", { name, exact: true });
    await expect(action).toBeInViewport({ ratio: 1, timeout: 2000 });
    await expect(action.locator("svg:visible")).toHaveCount(1);
  }
  await expect(toolbar.getByRole("button", { name: "Enter full screen" })).toBeHidden();
  await expect(toolbar.getByRole("button", { name: "Zoom in 60 percent" }).locator("svg").first()).toBeVisible();
  await toolbar.getByRole("button", { name: "Lesson actions" }).click();
  await expect(toolbar.getByRole("button", { name: "Enter full screen" })).toBeInViewport({ ratio: 1 });
  await expect(toolbar.getByRole("button", { name: "Open print view" })).toBeInViewport({ ratio: 1 });
  for (const control of await toolbar.getByRole("button").all()) {
    if (!await control.isVisible()) continue;
    const rect = (await control.boundingBox())!;
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(768);
  }
});

test("landscape keeps fullscreen and all four ink colours on one row", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.setContent(html);
  const toolbar = page.getByRole("region", { name: "Presenter controls" });
  const fullscreen = toolbar.getByRole("button", { name: "Enter full screen" });
  await expect(fullscreen.locator("svg").first()).toBeVisible();
  for (const name of ["Save to Builder", "Update student view"]) {
    await expect(toolbar.getByRole("button", { name, exact: true })).toBeInViewport({ ratio: 1 });
  }
  expect((await toolbar.boundingBox())!.height).toBeLessThanOrEqual(56);
  expect((await page.locator(".lesson-slide").first().boundingBox())!.height).toBeGreaterThan(720);
  for (const colour of ["Black", "Blue", "Red", "Green"]) {
    await expect(toolbar.getByRole("button", { name: `${colour} pen colour` })).toBeInViewport({ ratio: 1 });
  }
  await fullscreen.click();
  await expect(toolbar.getByRole("button", { name: "Exit full screen" })).toHaveAttribute("aria-pressed", "true");
});

test("next and previous show the current slide and preserve it on rotation", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(html);
  const next = page.getByRole("button", { name: "Next slide", exact: true });
  const previous = page.getByRole("button", { name: "Previous slide", exact: true });
  const position = page.locator("#presenter-slide-position");
  await expect(position).toContainText("1 / 5");
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(position).toContainText("2 / 5");
  await page.setViewportSize({ width: 768, height: 1024 });
  const example = page.getByRole("region", { name: "Slide 2: Independent practice" });
  const exampleIsFitted = () => example.evaluate(slide => {
    const bounds = slide.getBoundingClientRect();
    const controls = document.querySelector(".presenter-tools")!.getBoundingClientRect();
    return bounds.top >= controls.bottom && bounds.bottom <= innerHeight + 1 &&
      bounds.left >= 0 && bounds.right <= innerWidth + 1;
  });
  await expect.poll(exampleIsFitted).toBe(true);
  await expect(position).toContainText("2 / 5");
  await page.locator("#presenter-zoom").click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole("button", { name: "Fit slide to screen" }).click();
  await expect(position).toContainText("2 / 5");
  await expect.poll(exampleIsFitted).toBe(true);
  await previous.click();
  await expect(position).toContainText("1 / 5");
});

test("a tall narrow window keeps adjacent slides close and brings the last slide to the toolbar", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1200 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(html);
  const slides = page.locator(".lesson-deck > .lesson-slide");
  const gaps = () => slides.evaluateAll(items => items.slice(1).map((slide, index) =>
    slide.getBoundingClientRect().top - items[index].getBoundingClientRect().bottom,
  ));
  await expect.poll(gaps).toEqual([12, 12, 12, 12]);
  const insetBelowToolbar = (index: number) => slides.nth(index).evaluate(slide => {
    const toolbar = document.querySelector(".presenter-tools")!;
    return Math.round(slide.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom);
  });
  await expect.poll(() => insetBelowToolbar(0)).toBe(6);
  const secondSlideOffset = await slides.nth(1).evaluate((slide) =>
    slide.getBoundingClientRect().top - document.querySelector(".presenter-tools")!.getBoundingClientRect().bottom,
  );
  await page.locator(".lesson-deck").evaluate((deck, offset) => { deck.scrollTop += offset; }, secondSlideOffset);
  const position = page.locator("#presenter-slide-position");
  await expect(position).toContainText("2 / 5");
  const next = page.getByRole("button", { name: "Next slide", exact: true });
  for (const count of [3, 4, 5]) {
    await next.click();
    await expect(position).toContainText(`${count} / 5`);
    await expect.poll(() => insetBelowToolbar(count - 1)).toBe(6);
  }
  await expect(next).toBeDisabled();
  await page.setViewportSize({ width: 1340, height: 1260 });
  await expect.poll(gaps).toEqual([12, 12, 12, 12]);
  await expect.poll(() => insetBelowToolbar(4)).toBe(6);
  await page.getByRole("button", { name: "Previous slide", exact: true }).click();
  await expect.poll(() => insetBelowToolbar(3)).toBe(6);
  await expect(position).toContainText("4 / 5");
});

test("zooming a middle slide and fitting it again keeps its reveal below the toolbar", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(html);
  await page.getByRole("button", { name: "Next slide", exact: true }).click();
  const example = page.getByRole("region", { name: "Slide 2: Independent practice" });
  const before = await example.boundingBox();
  await page.getByRole("button", { name: "Zoom in 60 percent" }).click();
  await expect.poll(() => page.locator(".lesson-deck").evaluate(deck =>
    [deck.clientWidth, deck.clientHeight],
  )).toEqual([1024, 768]);
  await expect.poll(() => example.evaluate(slide => {
    const rect = slide.getBoundingClientRect();
    return rect.left >= 0 && rect.left < 20 &&
      rect.top >= document.querySelector(".presenter-tools")!.getBoundingClientRect().bottom &&
      rect.top < innerHeight / 2;
  })).toBe(true);
  await page.getByRole("button", { name: "Fit slide to screen" }).click();
  await expect.poll(() => example.boundingBox()).toEqual(before);
  await expect(page.getByRole("button", { name: "Show second image" })).toBeInViewport({ ratio: 1 });
});

test("opening Ink settings shows the custom colour controls and stroke size together", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.setContent(html);
  const ink = page.getByRole("button", { name: "Ink settings" });
  const red = page.getByRole("button", { name: "Red pen colour" });
  await red.click();
  await expect(red).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Blue pen colour" })).toHaveAttribute("aria-pressed", "false");
  await ink.press("Enter");
  const picker = page.getByRole("group", { name: "Custom colour" });
  const hue = picker.getByRole("slider", { name: "Hue" });
  const stroke = page.getByRole("slider", { name: "Stroke size" });
  await expect(hue).toBeFocused({ timeout: 2000 });
  await expect(stroke).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Choose a custom pen colour" })).toHaveCount(0);
  await expect(picker.getByText("#DC2626")).toBeVisible();
  await hue.fill("120");
  await picker.getByRole("slider", { name: "Saturation" }).fill("100");
  await picker.getByRole("slider", { name: "Brightness" }).fill("100");
  await expect(picker.getByText("#00FF00")).toBeVisible();
  await expect(ink.locator("svg")).toHaveCSS("fill", "rgb(0, 255, 0)");
  await expect(red).toHaveAttribute("aria-pressed", "false");
  await stroke.press("ArrowRight");
  await expect(stroke).toHaveValue("2.5");
  const highlighter = page.getByRole("button", { name: "Highlighter", exact: true });
  await highlighter.click();
  await expect(highlighter).toHaveAttribute("aria-pressed", "true");
  await highlighter.press("Escape");
  await expect(picker).toBeHidden();
  await expect(red).toBeVisible();
  await expect(ink).toBeFocused();
  await expect(page.locator("#presenter-camera-input")).toHaveAttribute("tabindex", "-1");
});

test("visible answer controls have tablet-sized cues without covering the maths", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.setContent(html);
  for (const kind of ["replace", "append"]) {
    if (kind === "append") await page.getByRole("button", { name: "Next slide", exact: true }).click();
    const question = page.locator(`[data-qa-toggle="${kind}"]`).first();
    const cue = question.getByText("Show answer", { exact: true });
    const cueBounds = (await cue.boundingBox())!;
    const imageBounds = (await question.locator(".qa-question-layer").boundingBox())!;
    expect(cueBounds.width).toBeGreaterThanOrEqual(44);
    expect(cueBounds.height).toBeGreaterThanOrEqual(44);
    expect(cueBounds.x).toBeGreaterThanOrEqual(imageBounds.x + imageBounds.width);
    expect(imageBounds.y).toBe((await question.boundingBox())!.y);
    await page.mouse.click(imageBounds.x + imageBounds.width / 2, imageBounds.y + imageBounds.height / 2);
    await expect(question).toHaveAttribute("aria-pressed", "false");
    await question.press("Space");
    await expect(question.getByText("Hide answer", { exact: true })).toBeVisible();
  }
});

test("tabbing past Lesson actions closes it and reaches only the current slide", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.setContent(html);
  await page.getByRole("button", { name: "Next slide", exact: true }).click();
  const actions = page.getByRole("button", { name: "Lesson actions" });
  await actions.press("Enter");
  await page.getByRole("button", { name: "Clear all ink" }).press("Tab");
  await expect(actions).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("main", { name: "Lesson slides" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Show second image" })).toBeFocused();
  await expect(page.locator("#presenter-slide-position")).toContainText("2 / 5");
});

test("canceling the ink-clear dialog returns focus without losing the action", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.setContent(html);
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await page.mouse.click(220, 330);
  await expect(page.locator(".annotation-svg path")).toHaveCount(1);
  await page.getByRole("button", { name: "Lesson actions" }).click();
  const clear = page.getByRole("button", { name: "Clear all ink" });
  await clear.click();
  await page.getByRole("button", { name: "Keep annotations" }).click();
  await expect(clear).toBeFocused();
  await expect(page.locator(".annotation-svg path")).toHaveCount(1);
});

test("enlarging the student code does not shift the lesson or controls", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.setContent(html);
  await page.getByRole("button", { name: "Next slide", exact: true }).click();
  const code = page.getByRole("button", { name: "Student code: ABC-123", exact: true });
  const controls = page.getByRole("region", { name: "Presenter controls" });
  const example = page.getByRole("region", { name: "Slide 2: Independent practice" });
  const before = await example.boundingBox();
  const barBefore = await controls.boundingBox();
  await code.click();
  await expect(code).toHaveAttribute("aria-pressed", "true");
  await expect(code).toBeInViewport({ ratio: 1 });
  expect(await controls.boundingBox()).toEqual(barBefore);
  expect(await example.boundingBox()).toEqual(before);
  await code.press("Tab");
  await expect(code).toHaveAttribute("aria-pressed", "false");
  await expect(controls.getByRole("button", { name: "Lesson actions" })).toBeFocused();
  await code.press("Enter");
  await code.press("Escape");
  await expect(code).toHaveAttribute("aria-pressed", "false");
  await expect(code).toBeFocused();
});

test("a saved confidence poll cannot silently accept additional votes", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.route("https://presenter.test/**", async route => {
    if (new URL(route.request().url()).pathname === "/") {
      await route.fulfill({ contentType: "text/html", body: html
        .replace('"uploadEndpoint":""', '"uploadEndpoint":"/ticket"')
        .replace('"completeEndpoint":""', '"completeEndpoint":"/complete"')
        .replace('"taughtEndpoint":""', '"taughtEndpoint":"/taught"') });
    } else {
      await route.fulfill({ json: { ok: true, id: "taught-copy", signedUrl: "/upload", path: "fixture", lesson: { id: "taught-copy" } } });
    }
  });
  await page.goto("https://presenter.test/");
  await page.getByRole("button", { name: "Lesson actions" }).click();
  await page.getByRole("button", { name: "Confidence poll", exact: true }).click();
  const vote = page.getByRole("button", { name: "Confidence 3", exact: true });
  await vote.click();
  await page.getByRole("button", { name: "End poll and save" }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  await expect(vote).toBeDisabled();
});

test("the toolbar publishes the student view without opening Lesson actions", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.route("https://presenter.test/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: html });
    return route.fulfill({ json: { ok: true, signedUrl: "/student-upload", path: "snapshot.json" } });
  });
  const initialPublish = page.waitForResponse(response => response.url().endsWith("/student-complete"));
  await page.goto("https://presenter.test/");
  await initialPublish;
  const update = page.getByRole("button", { name: "Update student view", exact: true });
  await update.click();
  await expect(page.getByText("Student view updated. Code: ABC-123")).toBeVisible();
  await expect(update).toBeEnabled();
  await expect(page.getByRole("button", { name: "Lesson actions" })).toHaveAttribute("aria-expanded", "false");
});

test.describe("teacher tablet touch", () => {
  test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } });

  test("the reveal cue responds to a tap and swiping the canvas scrolls the deck", async ({ page }) => {
    await page.setContent(html);
    const toggle = page.locator("[data-qa-toggle]").first();
    const cue = toggle.getByText("Show answer", { exact: true });
    const target = (await cue.boundingBox())!;
    await page.touchscreen.tap(target.x + target.width / 2, target.y + target.height / 2);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 250, y: 430 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 250, y: 345 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 250, y: 200 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => page.locator(".lesson-deck").evaluate(deck => deck.scrollTop)).toBeGreaterThan(150);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  });
});
