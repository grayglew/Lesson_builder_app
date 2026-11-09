import { expect, test } from "@playwright/test";
import { createInitialBuilderDocument } from "../../src/features/builder/schema";

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "Development-only fixtures; never touches teacher data.");

for (const theme of ["light", "dark"]) {
  test(`unit authoring, saved lesson and workspace round trip (${theme})`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    let workspace = { ...createInitialBuilderDocument(), className: "7Ma3", title: "Probability lesson" };
    let saved = {};
    const summary = () => ({ id: "saved-unit-lesson", title: "Probability lesson", className: "7Ma3", teachingDate: workspace.teachingDate, byteSize: 1000, taughtAt: "", isTaught: false, createdAt: "2026-11-07T00:00:00Z", updatedAt: new Date().toISOString() });
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
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const editor = page.getByRole("region", { name: "Unit library" });
      await expect(editor).toBeVisible();
      expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const field of [page.getByLabel("Unit name"), page.getByRole("button", { name: "Save unit", exact: true })]) {
        expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({ path: testInfo.outputPath(`unit-${theme}-${width}.png`) });
    }
    await page.getByRole("button", { name: "Save unit", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Unit saved" })).toBeVisible();
    const id = await page.getByLabel("Edit unit").inputValue();
    await page.getByRole("combobox", { name: "Unit of work", exact: true }).selectOption(id);
    await expect(page.getByRole("button", { name: "Select slide 1 as active from title" })).toHaveText(/Probability resources/);
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
  });
}
