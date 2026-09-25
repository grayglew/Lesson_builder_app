import { expect, test, type Page } from "@playwright/test";
import { buildStandaloneLessonHtml } from "../../src/features/builder/lesson-export";
import { createSavedStateExportDocument } from "../../src/features/builder/saved-lesson-parity";
import { studentSnapshotRuntimeSource } from "../../src/features/builder/student-snapshot-runtime";
import type { BuilderDocument } from "../../src/features/builder/schema";
import { fixtureImage, forgedImportedControl, studentLesson } from "../fixtures/student-lesson";

async function snapshotFromExport(page: Page, document: BuilderDocument) {
  await page.setContent(buildStandaloneLessonHtml(document));
  return page.evaluate((source) => new Function(`${source}\nreturn buildStudentSnapshotHtml();`)() as string, studentSnapshotRuntimeSource());
}

async function mountStudent(page: Page, html: string) {
  await page.setContent('<iframe title="Student lesson" sandbox="allow-scripts" style="width:100%;height:900px;border:0"></iframe>');
  await page.locator("iframe").evaluate((frame, source) => { (frame as HTMLIFrameElement).srcdoc = source; }, html);
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts");
  const frame = page.frameLocator("iframe");
  await expect(frame.locator(".lesson-deck")).toBeVisible();
  await frame.locator(".lesson-deck img").evaluateAll(async (images) => {
    await Promise.all(images.map((image) => (image as HTMLImageElement).decode()));
  });
  return frame;
}

test("student pointer and keyboard reveals stay local and reset on reload", async ({ page }) => {
  const html = await snapshotFromExport(page, studentLesson());
  let frame = await mountStudent(page, html);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  const replace = frame.locator('[data-reveal-key="starter-answer-0"]');
  const append = frame.locator('[data-reveal-key="example-answer-0"]');

  await replace.click();
  await expect(replace).toHaveAttribute("aria-pressed", "true");
  await expect(replace.locator(".qa-answer-layer img")).toBeVisible();
  await expect(replace.locator(".qa-question-layer img")).toBeHidden();
  await append.focus();
  await page.keyboard.press("Enter");
  await expect(append).toHaveAttribute("aria-pressed", "true");
  await expect(append.locator(".qa-question-layer img")).toBeVisible();
  await expect(append.locator(".qa-answer-layer img")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(append).toHaveAttribute("aria-pressed", "false");
  await expect(frame.locator(".presenter-tools,.live-retrieval-controls,button:not([data-student-qa-toggle])")).toHaveCount(0);
  expect(requests).toEqual([]);

  frame = await mountStudent(page, html);
  await expect(frame.locator("[data-student-qa-toggle].is-showing-answer")).toHaveCount(0);
});

test("imported CSS cannot observe a reveal or issue external image requests in the exact sandbox", async ({ page }) => {
  await page.route("https://collector.invalid/**", (route) => route.abort());
  const document = studentLesson();
  document.slides.push({ id: "tracking", type: "imported-html", title: "Tracking", html: `<style data-lesson-builder-style>
    [data-student-qa-toggle].is-showing-answer{background-image:url(https://collector.invalid/reveal)}
    body:has([data-student-qa-toggle].is-showing-answer) #inline-probe{background:var(--tracking-image)}
    </style><div id="inline-probe" style="width:100px;height:100px;--tracking-image:url(https://collector.invalid/inline)">Static content</div>` });
  const html = await snapshotFromExport(page, document);
  const frame = await mountStudent(page, html);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  const toggle = frame.locator('[data-reveal-key="example-answer-0"]');
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  // Flush style/layout and two paint opportunities, so CSS URL side effects have run.
  await toggle.evaluate(async (node) => {
    getComputedStyle(node).getPropertyValue("background-image");
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  expect.soft(requests).toEqual([]);
  await expect(frame.locator('[data-builder-slide-id="tracking"] style')).toHaveCount(0);
  expect(await frame.locator("#inline-probe").getAttribute("style")).not.toContain("url(");
});

test("an imported closing-tag breakout cannot become a student control", async ({ page }) => {
  const document = studentLesson();
  document.slides.unshift({ id: "breakout", type: "imported-html", title: "Breakout", html: forgedImportedControl });
  const frame = await mountStudent(page, await snapshotFromExport(page, document));
  await expect(frame.locator("#forged-toggle")).toHaveCount(0);
  await expect(frame.locator("[data-student-qa-toggle]")).toHaveCount(3);
  await expect(frame.locator('[data-builder-slide-id="breakout"] #imported-text')).toHaveText("Intended imported text");
});

test("imported image maps cannot navigate the script-only student frame", async ({ page }) => {
  await page.route("https://collector.invalid/**", (route) => route.abort());
  const document = studentLesson();
  document.slides.push({ id: "image-map", type: "imported-html", title: "Image map", html: `<img id="mapped-image" src="${fixtureImage("map.svg", 200, 200).dataUrl}" width="200" height="200" usemap="#destination"><map name="destination"><area shape="default" href="https://collector.invalid/navigate"></map>` });
  const frame = await mountStudent(page, await snapshotFromExport(page, document));
  const navigations: string[] = [];
  page.on("request", (request) => { if (request.isNavigationRequest()) navigations.push(request.url()); });
  await frame.locator("#mapped-image").click({ position: { x: 50, y: 50 } });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect.soft(navigations).toEqual([]);
  await expect(frame.locator("map,area,[usemap]")).toHaveCount(0);
});

for (const secondShown of [false, true]) {
  for (const secondAnswer of [false, true]) {
    test(`second Example visibility: region=${secondShown}, answer=${secondAnswer}`, async ({ page }) => {
      const frame = await mountStudent(page, await snapshotFromExport(page, studentLesson(secondShown, secondAnswer)));
      const region = frame.locator(".example-reveal-region");
      await expect(region).toHaveAttribute("aria-hidden", String(!secondShown));
      const question = region.locator(".qa-question-layer img");
      const answer = region.locator(".qa-answer-layer img");
      if (secondShown) await expect(question).toBeVisible();
      else await expect(question).toBeHidden();
      if (secondShown && secondAnswer) await expect(answer).toBeVisible();
      else await expect(answer).toBeHidden();
      const regionBox = await region.boundingBox();
      const firstBox = await frame.locator(".example-block").first().boundingBox();
      expect(regionBox!.width).toBeCloseTo(firstBox!.width, 0);
      expect(regionBox!.height).toBeCloseTo(firstBox!.height, 0);
    });
  }
}

test("saved-state rendering suppresses answered content in the hidden second Example without collapsing its column", async ({ page }) => {
  const document = createSavedStateExportDocument(studentLesson(false, true));
  await page.setContent(buildStandaloneLessonHtml(document, { staticAnnotations: true }));
  await expect(page.locator(".example-reveal-region .qa-question-layer img")).toBeHidden();
  await expect(page.locator(".example-reveal-region .qa-answer-layer img")).toBeHidden();
  const first = await page.locator(".example-block").first().boundingBox();
  const second = await page.locator(".example-reveal-region").boundingBox();
  expect(second!.width).toBeCloseTo(first!.width, 0);
  expect(second!.height).toBeCloseTo(first!.height, 0);
});

for (const width of [1280, 600]) {
  test(`real exported image rows stay allocated and top-aligned through student reveal at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const frame = await mountStudent(page, await snapshotFromExport(page, studentLesson()));
    const toggle = frame.locator('[data-reveal-key="example-answer-0"]');
    const question = toggle.locator(".qa-question-layer img");
    const before = await question.boundingBox();
    const control = await toggle.boundingBox();
    expect(before!.height).toBeCloseTo(control!.height / 2, 0);
    const style = await question.evaluate((image) => ({
      position: getComputedStyle(image).objectPosition,
      fit: getComputedStyle(image).objectFit,
      naturalWidth: (image as HTMLImageElement).naturalWidth,
      naturalHeight: (image as HTMLImageElement).naturalHeight,
    }));
    expect(style).toEqual({ position: "50% 0%", fit: "contain", naturalWidth: 800, naturalHeight: 100 });
    await toggle.click();
    const after = await question.boundingBox();
    expect(after).toEqual(before);
    const answer = toggle.locator(".qa-answer-layer img");
    await expect(answer).toBeVisible();
    const geometry = await answer.evaluate((image) => {
      const layer = image.parentElement!;
      const rectangle = image.getBoundingClientRect();
      const bounds = layer.getBoundingClientRect();
      return { top: rectangle.top, bottom: rectangle.bottom, layerTop: bounds.top, layerBottom: bounds.bottom, scroll: layer.scrollHeight, client: layer.clientHeight, position: getComputedStyle(image).objectPosition, fit: getComputedStyle(image).objectFit };
    });
    expect(geometry.top).toBeGreaterThanOrEqual(geometry.layerTop);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.layerBottom);
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
    expect(geometry.position).toBe("50% 0%");
    expect(geometry.fit).toBe("contain");
  });
}
