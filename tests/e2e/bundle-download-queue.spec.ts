import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "This test uses the development-only fixture route.");

for (const theme of ["light", "dark"]) {
  test(`queues three bundles, stays usable and fits responsive viewports (${theme})`, async ({ page }, testInfo) => {
    const now = "2026-10-22T00:00:00.000Z";
    const lessons = ["A", "B", "C"].map(letter => ({
      id: letter, title: `Lesson ${letter}`, className: "Year 9", teachingDate: "2026-10-22",
      byteSize: 100, taughtAt: "", isTaught: false, createdAt: now, updatedAt: now,
    }));
    const gates = new Map<string, { promise: Promise<void>; resolve: () => void }>();
    for (const lesson of lessons) {
      let resolve!: () => void;
      const promise = new Promise<void>(yes => { resolve = yes; });
      gates.set(lesson.id, { promise, resolve });
    }
    const document = await PDFDocument.create();
    document.addPage([595, 842]);
    const pdf = Buffer.from(await document.save());
    let nextSnapshot = 0;
    let active = 0;
    let maximumActive = 0;
    const renderRequests: Array<{ lessonId: string; snapshotPath: string }> = [];
    const downloaded: string[] = [];
    page.on("download", download => downloaded.push(download.suggestedFilename()));

    await page.route("**/api/builder-sync/latest?kind=workspace", route => route.fulfill({ json: { ok: true, exists: false, kind: "workspace" } }));
    await page.route("**/api/builder-sync/upload-url", route => route.fulfill({ json: { ok: true, kind: "workspace", path: "teacher/workspace.json", signedUrl: "http://127.0.0.1:3100/__fixture/upload/workspace" } }));
    await page.route("**/api/builder-sync/complete", route => route.fulfill({ json: { ok: true, kind: "workspace", updatedAt: now, revision: "1" } }));
    await page.route("**/api/builder-global/bootstrap", route => route.fulfill({ json: { ok: true, state: { classNames: ["Year 9"], retrievalItems: [], slideTemplates: [], updatedAt: now } } }));
    await page.route("**/api/builder-lessons", route => route.fulfill({ json: { ok: true, lessons, totalByteSize: 300 } }));
    await page.route("**/api/builder-lessons/open", route => {
      const lesson = lessons.find(lesson => lesson.id === route.request().postDataJSON().id)!;
      return route.fulfill({ json: { ok: true, lesson, signedUrl: `http://127.0.0.1:3100/__fixture/lesson/${lesson.id}` } });
    });
    await page.route("**/__fixture/lesson/*", route => {
      const lesson = lessons.find(lesson => route.request().url().endsWith(`/${lesson.id}`))!;
      return route.fulfill({ json: { schemaVersion: 2, title: lesson.title, slides: [{ id: "slide", type: "placeholder", title: "Question", text: "Test" }], retrievalItems: [], slideTemplates: [] } });
    });
    await page.route("**/api/presenter/pdf-snapshot/upload-url", route => {
      const { lessonId } = route.request().postDataJSON();
      const id = ++nextSnapshot;
      return route.fulfill({ json: { ok: true, path: `teacher/presenter-pdf/${lessonId}/snapshot-${id}.html`, signedUrl: `http://127.0.0.1:3100/__fixture/upload/${id}` } });
    });
    await page.route("**/__fixture/upload/*", route => route.fulfill({ status: 200, body: "{}" }));
    await page.route("**/api/presenter/pdf", async route => {
      const request = route.request().postDataJSON();
      renderRequests.push(request);
      active++;
      maximumActive = Math.max(maximumActive, active);
      await gates.get(request.lessonId)!.promise;
      await route.fulfill({ contentType: "application/pdf", body: pdf });
      active--;
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/builder?visual=1&theme=${theme}`);
    await page.getByRole("button", { name: "Saved lessons", exact: true }).click();
    for (const lesson of lessons) {
      await page.getByRole("button", { name: `More actions for ${lesson.title}`, exact: true }).click();
      await page.getByRole("menu", { name: `More actions for ${lesson.title}` })
        .getByRole("button", { name: "Download lesson bundle", exact: true }).click();
    }
    const panel = page.getByRole("region", { name: "Bundle downloads" });
    await expect(panel).toContainText("2 running · 1 queued");
    await expect.poll(() => renderRequests.length).toBe(2);
    expect(new Set(renderRequests.map(request => request.lessonId))).toEqual(new Set(["A", "B"]));
    await expect(page.getByRole("button", { name: "Open lesson", exact: true }).first()).toBeEnabled();
    await page.getByRole("button", { name: "Starter", exact: true }).click();
    await expect(panel).toBeVisible();
    gates.get("A")!.resolve();
    await expect.poll(() => downloaded.includes("Lesson-A-bundle.zip")).toBe(true);
    await expect.poll(() => renderRequests.some(request => request.lessonId === "C")).toBe(true);
    gates.get("B")!.resolve();
    gates.get("C")!.resolve();
    await expect(panel.getByRole("button", { name: /^Download Lesson [ABC] again$/ })).toHaveCount(3);
    expect(maximumActive).toBeLessThanOrEqual(2);
    expect(new Set(renderRequests.map(request => request.snapshotPath)).size).toBe(6);

    for (const width of [375, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await panel.getByRole("button", { name: "Download Lesson A again" }).click({ trial: true });
      const geometry = await panel.evaluate(element => ({
        width: element.clientWidth, scrollWidth: element.scrollWidth,
        buttons: Array.from(element.querySelectorAll("button"), button => button.getBoundingClientRect().height),
      }));
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
      expect(geometry.buttons.every(height => height >= 44)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`queue-${theme}-${width}.png`), animations: "disabled" });
    }
    await panel.locator("summary").click();
    await expect(panel.getByRole("button", { name: "Download Lesson A again" })).not.toBeVisible();
    await panel.locator("summary").click();
    await panel.getByRole("button", { name: "Download Lesson A again" }).click();
    await expect.poll(() => downloaded.length).toBe(4);
    await panel.getByRole("button", { name: "Clear finished downloads" }).click();
    await expect(panel).toHaveCount(0);
  });
}
