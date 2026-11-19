import { expect, test } from "@playwright/test";

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "Uses local synthetic lesson data, never a teacher's library.");

for (const theme of ["light", "dark"]) {
  test(`keeps the Class filter visible and usable at every library width (${theme})`, async ({ page }, testInfo) => {
    const now = "2026-11-19T00:00:00.000Z";
    const lessons = ["7Ma3", "11Ma2"].map((className, index) => ({
      id: `lesson-${index}`, title: `${className} Example lesson`, className,
      teachingDate: "2026-11-19", byteSize: 100, taughtAt: "", isTaught: false,
      createdAt: now, updatedAt: now,
    }));
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/builder-lessons") {
        await route.fulfill({ json: { ok: true, lessons, totalByteSize: 200 } });
      } else if (path === "/api/builder-global/bootstrap") {
        await route.fulfill({ json: { ok: true, state: { classNames: ["7Ma3", "11Ma2"], retrievalItems: [], slideTemplates: [], updatedAt: now } } });
      } else if (path === "/api/builder-sync/latest") {
        await route.fulfill({ json: { ok: true, exists: false, kind: "workspace" } });
      } else {
        await route.fulfill({ status: 503, json: { ok: false, error: "Synthetic test: endpoint unavailable" } });
      }
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/builder?visual=1&theme=${theme}`);
    await page.getByRole("button", { name: "Saved lessons", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Saved lesson library" })).toBeVisible();

    const library = page.getByRole("heading", { name: "Saved lesson library" }).locator("xpath=ancestor::section[1]");
    const classFilter = library.getByRole("combobox", { name: "Class", exact: true });
    const statusFilter = library.getByRole("combobox", { name: "Status", exact: true });
    const filterToggle = library.locator("summary").filter({ hasText: "Filters" });
    for (const width of [375, 414, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(classFilter).toBeVisible();
      await expect(statusFilter).toBeHidden();
      const bounds = await classFilter.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);

      await classFilter.selectOption("11Ma2");
      await expect(page.getByText("1 of 2 lessons", { exact: false })).toBeVisible();
      await expect(page.getByText("11Ma2 Example lesson", { exact: true })).toBeVisible();
      await expect(page.getByText("7Ma3 Example lesson", { exact: true })).toBeHidden();
      await expect(filterToggle).not.toContainText("active");
      await filterToggle.click();
      await expect(statusFilter).toBeVisible();
      await expect(classFilter).toBeVisible();
      await expect(classFilter).toHaveValue("11Ma2");
      await statusFilter.selectOption("planned");
      await expect(filterToggle).toContainText("1 active");
      await filterToggle.click();
      await expect(classFilter).toBeVisible();
      await expect(statusFilter).toBeHidden();
      await page.getByRole("button", { name: "Clear filters", exact: true }).click();
      await expect(classFilter).toHaveValue("");
      await expect(page.getByText("2 of 2 lessons", { exact: false })).toBeVisible();

      const overflow = await classFilter.evaluate(element => {
        const library = element.closest("section")!;
        return {
          library: library.scrollWidth - library.clientWidth,
          document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      expect(overflow.library).toBeLessThanOrEqual(1);
      expect(overflow.document).toBeLessThanOrEqual(1);
      if (width === 1440) {
        await testInfo.attach(`saved-library-${theme}`, { body: await page.screenshot(), contentType: "image/png" });
      }
    }
  });
}
