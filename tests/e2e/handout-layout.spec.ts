import { expect, test, type Page, type Route } from "@playwright/test";

test.skip(
  Boolean(process.env.PLAYWRIGHT_BASE_URL) &&
    process.env.PLAYWRIGHT_VISUAL_LOCAL !== "1",
  "The handout layout fixture is development-only.",
);

test.describe("flexible A4 handout print layout", () => {
  test("renders a Starter and two Examples without separating questions from answers", async ({
    page,
  }) => {
    await stubHandoutBuilder(page, mixedSlides(), [
      "starter-slide",
      "example-one",
      "example-two",
    ]);
    await page.goto("/builder?visual=1");

    const popupPromise = page.waitForEvent("popup");
    await page
      .getByRole("button", { name: "Open handout from 3 selected slides" })
      .click();
    const handout = await popupPromise;

    const pages = handout.locator(".handout-page");
    const blocks = handout.locator(".handout-example-block");
    await expect(pages).toHaveCount(2);
    await expect(blocks).toHaveCount(2);
    await expect(handout.locator(".handout-example-cell")).toHaveCount(8);

    const geometry = await blocks.evaluateAll((elements) =>
      elements.map((element) => {
        const cells = Array.from(element.children) as HTMLElement[];
        const boxes = cells.map((cell) => cell.getBoundingClientRect());
        return {
          width: element.clientWidth,
          height: element.clientHeight,
          scrollWidth: element.scrollWidth,
          scrollHeight: element.scrollHeight,
          firstRowAligned: Math.abs(boxes[0].top - boxes[1].top) < 1,
          secondRowAligned: Math.abs(boxes[2].top - boxes[3].top) < 1,
          firstColumnAligned: Math.abs(boxes[0].left - boxes[2].left) < 1,
          secondColumnAligned: Math.abs(boxes[1].left - boxes[3].left) < 1,
        };
      }),
    );
    for (const block of geometry) {
      expect(block).toMatchObject({
        firstRowAligned: true,
        secondRowAligned: true,
        firstColumnAligned: true,
        secondColumnAligned: true,
      });
      expect(block.scrollWidth).toBeLessThanOrEqual(block.width);
      expect(block.scrollHeight).toBeLessThanOrEqual(block.height);
    }
    await expectNoPageOverflow(handout);
  });

  test("imposes Starter-only output as two duplicate A5 copies on each A4 side", async ({
    page,
  }) => {
    await stubHandoutBuilder(page, [starterSlide()], ["starter-slide"]);
    await page.goto("/builder?visual=1");

    const popupPromise = page.waitForEvent("popup");
    await page
      .getByRole("button", { name: "Open handout from 1 selected slide" })
      .click();
    const handout = await popupPromise;

    const pages = handout.locator(".handout-booklet-side");
    await expect(pages).toHaveCount(2);
    await expect(pages.nth(0).locator(".handout-booklet-copy")).toHaveCount(2);
    await expect(pages.nth(1).locator(".handout-booklet-copy")).toHaveCount(2);
    await expect(pages.nth(0).getByText("GLUE", { exact: true })).toHaveCount(2);
    await expect(pages.nth(1).locator(".handout-booklet-inside-blank")).toHaveCount(2);

    const copyHeights = await pages
      .nth(0)
      .locator(".handout-booklet-copy")
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().height),
      );
    expect(Math.abs(copyHeights[0] - copyHeights[1])).toBeLessThan(1);
    await expectNoPageOverflow(handout);
  });
});

async function stubHandoutBuilder(
  page: Page,
  slides: Record<string, unknown>[],
  handoutSlideIds: string[],
) {
  const workspace = fixtureState(slides, handoutSlideIds);
  await page.route("**/api/**", (route) =>
    json(route, { ok: true, state: workspace }),
  );
  await page.route("**/api/builder-sync/latest?kind=workspace", (route) =>
    json(route, {
      ok: true,
      exists: true,
      kind: "workspace",
      signedUrl: "https://storage.example/handout-layout-workspace.json",
      updatedAt: workspace.updatedAt,
      revision: "handout-layout-fixture",
    }),
  );
  await page.route(
    "https://storage.example/handout-layout-workspace.json",
    (route) => json(route, { ...workspace, syncKind: "workspace" }),
  );
  await page.route("**/api/builder-global/bootstrap", (route) =>
    json(route, { ok: true, state: workspace }),
  );
}

function fixtureState(
  slides: Record<string, unknown>[],
  handoutSlideIds: string[],
) {
  return {
    schemaVersion: 3,
    title: "7Ma3 18-08 - taught 2026-08-18 1401",
    className: "Year 7",
    teachingDate: "2026-08-18",
    overallLessonLo: "Identify and use prime numbers",
    activeLessonId: "handout-layout-lesson",
    activeLessonSavedAt: "2026-08-18T06:00:00.000Z",
    lessonUpdatedAt: "2026-08-18T06:00:00.000Z",
    classNames: ["Year 7"],
    slides,
    handoutSlideIds,
    retrievalItems: [],
    slideTemplates: [],
    updatedAt: "2026-08-18T06:00:00.000Z",
  };
}

function mixedSlides() {
  return [starterSlide(), exampleSlide("example-one"), exampleSlide("example-two")];
}

function starterSlide() {
  return {
    id: "starter-slide",
    type: "starter",
    title: "Starter",
    slots: Array.from({ length: 4 }, (_, index) => ({
      lo: `Starter ${index + 1}`,
      image: image(`starter-${index + 1}`),
      answerImage: null,
    })),
  };
}

function exampleSlide(id: string) {
  return {
    id,
    type: "example",
    title: "Example",
    lo: id,
    image1: image(`${id}-question-1`),
    answerImage1: image(`${id}-answer-1`),
    image2: image(`${id}-question-2`),
    answerImage2: image(`${id}-answer-2`),
  };
}

function image(label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><rect width="320" height="120" fill="white"/><text x="16" y="64" font-size="18">${label}</text></svg>`;
  return {
    name: `${label}.svg`,
    type: "image/svg+xml",
    size: svg.length,
    dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  };
}

async function expectNoPageOverflow(page: Page) {
  const metrics = await page.locator(".handout-page").evaluateAll((elements) =>
    elements.map((element) => ({
      width: element.clientWidth,
      height: element.clientHeight,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
    })),
  );
  for (const metric of metrics) {
    expect(metric.scrollWidth).toBeLessThanOrEqual(metric.width);
    expect(metric.scrollHeight).toBeLessThanOrEqual(metric.height);
  }
}

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}
