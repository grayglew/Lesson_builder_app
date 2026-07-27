import { expect, test, type Page } from "@playwright/test";

test.skip(
  Boolean(process.env.PLAYWRIGHT_BASE_URL) &&
    process.env.PLAYWRIGHT_VISUAL_LOCAL !== "1",
  "The compact visual fixture is development-only.",
);

async function stubBuilder(page: Page) {
  await page.route("**/api/builder-sync/latest?kind=workspace", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, exists: false, kind: "workspace" }),
    });
  });
  await page.route("**/api/builder-global/bootstrap", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        state: {
          schemaVersion: 2,
          title: "Algebra review",
          className: "Year 9",
          teachingDate: "2026-07-18",
          overallLessonLo: "Expand and factorise quadratic expressions",
          activeLessonId: "visual-lesson",
          activeLessonSavedAt: "2026-07-18T06:00:00.000Z",
          lessonUpdatedAt: "2026-07-18T06:00:00.000Z",
          classNames: ["Year 7", "Year 8", "Year 9", "Year 10"],
          slides: [
            { id: "starter-slide", type: "starter", title: "Starter", slots: [] },
            { id: "example-slide", type: "example", title: "Example", lo: "101a: Expand a single bracket" },
          ],
          retrievalItems: [],
          slideTemplates: [],
          updatedAt: "2026-07-18T06:00:00.000Z",
        },
      }),
    });
  });
}

test.describe("Compact Console functional review", () => {
  test("renders all real desktop regions without clipping", async ({ page }) => {
    await stubBuilder(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/builder/compact-review?visual=1");
    await expect(page.getByText("Build / Starter")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Slide tools" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Lesson preview" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Lessons", exact: true })).toBeVisible();

    const layout = await page.locator("[data-builder-variant='compact-console']").evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);

    for (const selector of [
      "header",
      "aside[aria-label='Lesson builder navigation']",
      "section[aria-label='Starter']",
      "aside[aria-label='Lesson preview']",
    ]) {
      const box = await page.locator(selector).first().boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(1440);
    }
    expect(errors).toEqual([]);
  });

  test("keeps tools, menus, and rail controls interactive", async ({ page }) => {
    await stubBuilder(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/builder/compact-review?visual=1");

    await page.getByRole("button", { name: "Placeholder" }).click();
    await expect(page.getByText("Build / Placeholder")).toBeVisible();

    await page.getByText("Core slides", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Starter" })).toBeHidden();
    await page.getByText("Core slides", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Starter" })).toBeVisible();

    const account = page.getByRole("button", { name: "Account and utilities" });
    await account.click();
    await expect(page.getByRole("menu", { name: "Account and utilities" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "Account and utilities" })).toBeHidden();
    await expect(account).toBeFocused();

    const lessonRail = page.getByRole("complementary", {
      name: "Lesson builder navigation",
    });
    const lessonRailBefore = await lessonRail.boundingBox();
    await page.getByRole("button", { name: "Collapse lesson preview" }).click();
    const expandPreview = page.getByRole("button", { name: "Expand lesson preview" });
    await expect(expandPreview).toBeVisible();

    const lessonRailAfter = await lessonRail.boundingBox();
    expect(lessonRailBefore).not.toBeNull();
    expect(lessonRailAfter).not.toBeNull();
    expect(lessonRailAfter!.x).toBe(lessonRailBefore!.x);
    expect(lessonRailAfter!.width).toBe(lessonRailBefore!.width);

    const previewRail = await page
      .getByRole("complementary", { name: "Lesson preview" })
      .boundingBox();
    const expandPreviewBox = await expandPreview.boundingBox();
    expect(previewRail).not.toBeNull();
    expect(expandPreviewBox).not.toBeNull();
    expect(expandPreviewBox!.x).toBeGreaterThanOrEqual(previewRail!.x);
    expect(expandPreviewBox!.x + expandPreviewBox!.width).toBeLessThanOrEqual(
      previewRail!.x + previewRail!.width,
    );

    await expandPreview.click();
    await expect(page.getByRole("button", { name: "Collapse lesson preview" })).toBeVisible();
    await page.getByRole("button", { name: "Collapse lesson tools" }).click();
    await expect(page.getByRole("button", { name: "Expand lesson tools" })).toBeVisible();
  });
});
