import { expect, test, type Page, type Route } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

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

  test("adds alternating 17 mm insets after the first sheet without clipping landscape or retrieval content", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const prototype = Map.prototype as Map<unknown, unknown> & {
        getOrInsertComputed?: (
          key: unknown,
          callback: (key: unknown) => unknown,
        ) => unknown;
      };
      if (prototype.getOrInsertComputed) return;
      Object.defineProperty(prototype, "getOrInsertComputed", {
        configurable: true,
        value(this: Map<unknown, unknown>, key: unknown, callback: (key: unknown) => unknown) {
          if (!this.has(key)) this.set(key, callback(key));
          return this.get(key);
        },
        writable: true,
      });
    });
    const slides = [
      starterSlide(),
      exampleSlide("example-one"),
      exampleSlide("example-two"),
      retrievalSlide(),
      await landscapeWorksheetSlide(),
    ];
    await stubHandoutBuilder(
      page,
      slides,
      slides.map((slide) => slide.id),
    );
    await page.goto("/builder?visual=1");

    const popupPromise = page.waitForEvent("popup");
    await page
      .getByRole("button", { name: "Open handout from 5 selected slides" })
      .click();
    const handout = await popupPromise;
    await expect(
      handout.getByRole("dialog", {
        name: "Add glue margins for additional sheets?",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add glue margins", exact: true }),
    ).toHaveCount(0);
    await handout
      .getByRole("button", { name: "Add glue margins", exact: true })
      .click();

    const pages = handout.locator(".handout-page");
    await expect(pages).toHaveCount(4);
    const geometry = await pages.evaluateAll((elements) => {
      const ruler = document.createElement("div");
      ruler.style.width = "100mm";
      ruler.style.position = "absolute";
      document.body.append(ruler);
      const pixelsPerMm = ruler.getBoundingClientRect().width / 100;
      ruler.remove();
      const pageRule = Array.from(document.styleSheets)
        .flatMap((sheet) => Array.from(sheet.cssRules))
        .find((rule) => rule.cssText.startsWith("@page"));
      const pageMarginMm = Number(
        pageRule?.cssText.match(/margin:\s*([\d.]+)mm/)?.[1],
      );
      return {
        pageMarginMm,
        pages: elements.map((element) => {
          const style = getComputedStyle(element);
          return {
            paddingLeftMm: parseFloat(style.paddingLeft) / pixelsPerMm,
            paddingRightMm: parseFloat(style.paddingRight) / pixelsPerMm,
          };
        }),
      };
    });
    expect(geometry.pageMarginMm).toBe(8);
    expect(geometry.pages[0]).toEqual({
      paddingLeftMm: 0,
      paddingRightMm: 0,
    });
    expect(geometry.pages[1]).toEqual({
      paddingLeftMm: 0,
      paddingRightMm: 0,
    });
    expect(geometry.pages[2].paddingLeftMm).toBeCloseTo(17, 1);
    expect(geometry.pages[2].paddingRightMm).toBe(0);
    expect(geometry.pageMarginMm + geometry.pages[2].paddingLeftMm).toBeCloseTo(
      25,
      1,
    );
    expect(geometry.pages[3].paddingLeftMm).toBe(0);
    expect(geometry.pages[3].paddingRightMm).toBeCloseTo(17, 1);
    expect(geometry.pageMarginMm + geometry.pages[3].paddingRightMm).toBeCloseTo(
      25,
      1,
    );

    const retrievalPage = pages.nth(2);
    await expect(
      retrievalPage.getByText("7Ma3 18-08 - taught 2026-08-18 1401", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      retrievalPage.getByText("191a", { exact: true }),
    ).toBeVisible();
    await expect(
      retrievalPage.locator(".handout-retrieval-key-skill"),
    ).toHaveText(["191a", "192a", "193a", "194a", "195a", "196a", "197a", "198a"]);

    const landscapeImage = pages
      .nth(3)
      .locator(".handout-pdf-page-image.is-rotated-landscape");
    await expect(landscapeImage).toHaveCount(1);
    await expect
      .poll(() =>
        landscapeImage.evaluate(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
      )
      .toBe(true);
    const containment = await landscapeImage.evaluate((image) => {
      const imageRect = image.getBoundingClientRect();
      const pageRect = image.closest(".handout-page")?.getBoundingClientRect();
      return pageRect
        ? {
            left: imageRect.left >= pageRect.left - 1,
            top: imageRect.top >= pageRect.top - 1,
            right: imageRect.right <= pageRect.right + 1,
            bottom: imageRect.bottom <= pageRect.bottom + 1,
          }
        : null;
    });
    expect(containment).toEqual({
      left: true,
      top: true,
      right: true,
      bottom: true,
    });
    await expectNoPageOverflow(handout);
  });

  test("contains a direct landscape PDF page with and without glue margins", async ({
    page,
  }) => {
    const slides = [
      starterSlide(),
      exampleSlide("example-one"),
      exampleSlide("example-two"),
      retrievalSlide(),
      directLandscapePdfSlide(),
    ];
    await stubHandoutBuilder(
      page,
      slides,
      slides.map((slide) => slide.id),
    );
    await page.goto("/builder?visual=1");

    const openHandout = async () => {
      const popupPromise = page.waitForEvent("popup");
      await page
        .getByRole("button", { name: "Open handout from 5 selected slides" })
        .click();
      return popupPromise;
    };

    const withoutGlue = await openHandout();
    await withoutGlue
      .getByRole("dialog", {
        name: "Add glue margins for additional sheets?",
      })
      .getByRole("button", { name: "No margins", exact: true })
      .click();
    await expect(
      withoutGlue.locator(".handout-pdf-page-image.is-rotated-landscape"),
    ).toHaveCount(1);
    await expectContained(withoutGlue);
    await withoutGlue.close();

    const withGlue = await openHandout();
    await withGlue
      .getByRole("dialog", {
        name: "Add glue margins for additional sheets?",
      })
      .getByRole("button", { name: "Add glue margins", exact: true })
      .click();
    await expect(
      withGlue.locator(".handout-pdf-page-image.is-rotated-landscape"),
    ).toHaveCount(1);
    await expectContained(withGlue);
    await expectNoPageOverflow(withGlue);
    await withGlue.close();
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

function retrievalSlide() {
  return {
    id: "retrieval-slide",
    type: "starter",
    title: "Retrieval",
    slots: Array.from({ length: 8 }, (_, index) => ({
      lo: `${191 + index}a: Retrieval skill ${index + 1}`,
      image: image(`retrieval-${index + 1}`),
      answerImage: null,
    })),
  };
}

async function landscapeWorksheetSlide() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]);
  page.drawText("Landscape worksheet", { x: 48, y: 520, size: 28 });
  const bytes = await pdf.save();
  return {
    id: "landscape-worksheet",
    type: "worksheet",
    title: "Landscape worksheet",
    worksheet: {
      name: "landscape-worksheet.pdf",
      type: "application/pdf",
      size: bytes.length,
      dataUrl: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`,
    },
  };
}

function directLandscapePdfSlide() {
  return {
    id: "direct-landscape-pdf",
    type: "pdf-page",
    title: "Direct landscape PDF",
    orientation: "landscape",
    image: image("direct-landscape-pdf"),
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

async function expectContained(page: Page) {
  const image = page.locator(".handout-pdf-page-image.is-rotated-landscape").first();
  const imageBox = await image.boundingBox();
  const pageBox = await page.locator(".handout-page").last().boundingBox();
  expect(imageBox).not.toBeNull();
  expect(pageBox).not.toBeNull();
  expect(imageBox!.x).toBeGreaterThanOrEqual(pageBox!.x - 1);
  expect(imageBox!.y).toBeGreaterThanOrEqual(pageBox!.y - 1);
  expect(imageBox!.x + imageBox!.width).toBeLessThanOrEqual(
    pageBox!.x + pageBox!.width + 1,
  );
  expect(imageBox!.y + imageBox!.height).toBeLessThanOrEqual(
    pageBox!.y + pageBox!.height + 1,
  );
}

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}
