import { expect, test } from "@playwright/test";
import { createInitialBuilderDocument } from "../../src/features/builder/schema";

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "Development-only fixtures; never touches teacher data.");

for (const theme of ["light", "dark"]) {
  test(`unit authoring, saved lesson and workspace round trip (${theme})`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    let workspace = { ...createInitialBuilderDocument(), className: "7Ma3", title: "Probability lesson" };
    let saved = {};
    const summary = () => ({ id: "saved-unit-lesson", title: (saved as { title?: string }).title || "Probability lesson", className: "7Ma3", teachingDate: (saved as { teachingDate?: string }).teachingDate || workspace.teachingDate, byteSize: 1000, taughtAt: "", isTaught: false, createdAt: "2026-11-07T00:00:00Z", updatedAt: new Date().toISOString() });
    await page.route("**/api/builder-global/bootstrap", route => route.fulfill({ json: { ok: true, state: { classNames: ["7Ma3"], retrievalItems: [], slideTemplates: [] } } }));
    await page.route("**/api/builder-sync/latest?kind=workspace", route => route.fulfill({ json: { ok: true, exists: true, kind: "workspace", signedUrl: "http://127.0.0.1:3100/__fixture/workspace", revision: "fixture", updatedAt: workspace.updatedAt } }));
    await page.route("**/__fixture/workspace", route => route.fulfill({ json: workspace }));
    await page.route("**/api/builder-sync/upload-url", route => route.fulfill({ json: { ok: true, kind: "workspace", path: "fixture/workspace.json", signedUrl: "http://127.0.0.1:3100/__fixture/upload-workspace" } }));
    await page.route("**/api/builder-lessons/upload-url", route => route.fulfill({ json: { ok: true, id: "saved-unit-lesson", path: "fixture/lesson.json", signedUrl: "http://127.0.0.1:3100/__fixture/upload-lesson" } }));
    await page.route("**/__fixture/upload-*", async route => {
      const body = route.request().postDataBuffer()!.toString("utf8");
      const document = JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1));
      if (route.request().url().endsWith("workspace")) workspace = document;
      else saved = document;
      await route.fulfill({ body: "{}" });
    });
    await page.route("**/api/builder-sync/complete", route => route.fulfill({ json: { ok: true, kind: "workspace", updatedAt: workspace.updatedAt, revision: "fixture" } }));
    await page.route("**/api/builder-lessons/complete", route => route.fulfill({ json: { ok: true, lesson: summary() } }));
    await page.route("**/api/builder-lessons", route => route.fulfill({ json: { ok: true, lessons: [summary()], totalByteSize: 1000 } }));
    await page.route("**/api/builder-lessons/open", route => route.fulfill({ json: { ok: true, lesson: summary(), signedUrl: "http://127.0.0.1:3100/__fixture/saved-lesson" } }));
    await page.route("**/__fixture/saved-lesson", route => route.fulfill({ json: saved }));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/builder?visual=1&theme=${theme}`);
    await page.getByRole("button", { name: "Units of work", exact: true }).click();
    await page.getByLabel("Unit name").fill("Probability");
    await page.getByLabel("Slide 1 title").fill("Probability resources");
    await page.getByLabel("Slide 1 Extra practice resources").fill("https://example.org/practice");
    for (let number = 2; number <= 6; number++) {
      await page.getByRole("button", { name: "Add practice link", exact: true }).click();
      await page.getByLabel(`Slide 1 Practice resource ${number}`).fill(`https://example.org/practice${number}`);
    }
    await expect(page.getByRole("button", { name: "Add practice link", exact: true })).toBeDisabled();
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const editor = page.getByRole("region", { name: "Unit library" });
      await expect(editor).toBeVisible();
      expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const field of [page.getByLabel("Unit name"), page.getByLabel("Slide 1 Practice resource 6"), page.getByRole("button", { name: "Add practice link", exact: true }), page.getByRole("button", { name: "Save unit", exact: true })]) {
        expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({ path: testInfo.outputPath(`unit-${theme}-${width}.png`) });
    }
    await page.getByRole("button", { name: "Save unit", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Unit saved" })).toBeVisible();
    const id = await page.getByLabel("Edit unit").inputValue();
    await page.getByRole("combobox", { name: "Unit of work", exact: true }).selectOption(id);
    await expect(page.getByRole("button", { name: "Select slide 1 as active from title" })).toHaveText(/Probability resources/);
    const thumbnail = page.getByRole("button", { name: "Select slide 1 as active from preview" });
    await expect(thumbnail.locator("a")).toHaveCount(0);
    expect(await thumbnail.locator(".unit-resource-board").evaluate(node => node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => (saved as { unitOfWorkId?: string }).unitOfWorkId).toBe(id);
    expect(saved).not.toHaveProperty("unitsOfWork");
    await expect.poll(() => workspace.unitsOfWork.length).toBe(1);
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Unit of work", exact: true })).toHaveValue(id);
    await page.getByRole("button", { name: "Lessons", exact: true }).click();
    await page.getByRole("button", { name: "Open lesson", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Open lesson", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Unit of work", exact: true })).toHaveValue(id);
    await page.getByRole("button", { name: "Units of work", exact: true }).click();
    await expect(page.getByLabel("Unit name")).toHaveValue("Probability");
    await expect(page.getByLabel("Slide 1 Practice resource 6")).toHaveValue("https://example.org/practice6");

    for (const mode of ["existing", "new"]) {
      await page.getByRole("button", { name: "New lesson", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Create and save a new lesson" });
      await expect(dialog.getByLabel("Unit of work (optional)")).toHaveValue("");
      await dialog.getByLabel("Lesson title").fill("New unit lesson");
      await dialog.getByRole("combobox", { name: "Class", exact: true }).selectOption("7Ma3");
      await dialog.getByLabel("Teaching date").fill("2026-09-26");
      await dialog.getByLabel("Unit of work (optional)").selectOption(mode === "existing" ? `unit:${id}` : "new");
      if (mode === "new") {
        await dialog.getByLabel("New unit name").fill(" probability ");
        await expect(dialog.getByRole("alert")).toContainText("already exists");
        await expect(dialog.getByRole("button", { name: "Create and save lesson", exact: true })).toBeDisabled();
        await dialog.getByLabel("New unit name").fill("Statistics");
      }
      for (const width of [375, 768, 1440]) {
        const height = width === 375 ? 667 : 1000;
        await page.setViewportSize({ width, height });
        const bounds = (await dialog.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
        expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        for (const control of await dialog.locator("input,select,button").all()) {
          expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
        await dialog.evaluate(node => { node.scrollTop = 0; });
        await page.screenshot({ path: testInfo.outputPath(`new-lesson-${mode}-${theme}-${width}.png`) });
      }
      await dialog.getByRole("button", { name: "Create and save lesson", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect.poll(() => (saved as { unitOfWorkName?: string }).unitOfWorkName).toBe(mode === "existing" ? "Probability" : "Statistics");
      expect(saved).not.toHaveProperty("unitsOfWork");
      await expect.poll(() => workspace.unitOfWorkName).toBe(mode === "existing" ? "Probability" : "Statistics");
      if (mode === "new") await expect.poll(() => workspace.unitsOfWork.length).toBe(2);
      await page.reload();
      await expect(page.getByLabel("Lesson title", { exact: true })).toHaveValue("7Ma3 New unit lesson 26-09");
      await expect(page.getByRole("combobox", { name: "Unit of work", exact: true })).toHaveValue((saved as { unitOfWorkId: string }).unitOfWorkId);
      await expect(page.getByRole("button", { name: "Select slide 1 as active from title" })).toContainText(mode === "existing" ? "Probability resources" : "Unit resources");
    }
  });
}
