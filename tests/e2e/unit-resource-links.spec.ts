import { expect, test } from "@playwright/test";
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFString, PDFHexString } from "pdf-lib";
import { buildStandaloneLessonHtml } from "../../src/features/builder/lesson-export";
import { createInitialBuilderDocument } from "../../src/features/builder/schema";
import { studentSnapshotRuntimeSource } from "../../src/features/builder/student-snapshot-runtime";
import { createA4BundleSheetDocuments } from "../../src/features/builder/a4-bundle-pdf";
import { createSavedStateExportDocument, createAnswerKeyExportDocument } from "../../src/features/builder/saved-lesson-parity";

function resourceLesson() {
  return { ...createInitialBuilderDocument(), slides: [{ id: "resources", type: "template", title: "Unit resources", bullets: ["[Extra practice](https://example.org/practice)", "[Scheme of work](https://example.org/sow)"] }] };
}

test("Save to Builder keeps the unit association without copying the private catalogue", async ({ page }) => {
  let saved: Record<string, unknown> = {};
  await page.route("https://presenter.test/**", async route => {
    const url = route.request().url();
    if (url.endsWith("/upload")) {
      const body = route.request().postDataBuffer()!.toString("utf8");
      saved = JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1));
      return route.fulfill({ body: "{}" });
    }
    if (url.endsWith("/ticket")) return route.fulfill({ json: { ok: true, id: "taught", path: "taught.json", signedUrl: "https://presenter.test/upload" } });
    if (url.endsWith("/complete")) return route.fulfill({ json: { ok: true, lesson: { id: "taught" } } });
    if (url.endsWith("/taught")) return route.fulfill({ json: { ok: true } });
    return route.fulfill({ body: "<html></html>", contentType: "text/html" });
  });
  await page.goto("https://presenter.test/");
  const document = { ...resourceLesson(), unitOfWorkId: "probability", unitOfWorkName: "Probability", unitOfWorkVersion: "version-1" };
  await page.setContent(buildStandaloneLessonHtml(document, { presenterConfig: {
    enabled: true, sourceLessonId: "original", originalTitle: document.title, className: document.className, teachingDate: document.teachingDate,
    uploadEndpoint: "https://presenter.test/ticket", completeEndpoint: "https://presenter.test/complete", taughtEndpoint: "https://presenter.test/taught",
  } }));
  await page.getByRole("button", { name: "Save to Builder" }).click();
  await expect.poll(() => saved.unitOfWorkId).toBe("probability");
  expect(saved).toMatchObject({ unitOfWorkName: "Probability", unitOfWorkVersion: "version-1" });
  expect(saved).not.toHaveProperty("unitsOfWork");
});

test("student resource links open separately and do not enable teacher tools", async ({ page, context }) => {
  const runtime = await import("../../src/features/builder/student-snapshot-runtime");
  await page.setContent(buildStandaloneLessonHtml(resourceLesson()));
  const html = await page.evaluate(source => new Function(`${source}\nreturn buildStudentSnapshotHtml();`)() as string, studentSnapshotRuntimeSource());
  await page.setContent(`<iframe title="Shared lesson" sandbox="${runtime.STUDENT_VIEWER_SANDBOX || "allow-scripts"}"></iframe>`);
  await page.locator("iframe").evaluate((frame, value) => { (frame as HTMLIFrameElement).srcdoc = value; }, html);
  const frame = page.frameLocator("iframe");
  const link = frame.getByRole("link", { name: "Extra practice" });
  await expect(link).toBeVisible();
  await context.route("https://example.org/**", route => route.fulfill({ body: "<h1>Practice destination</h1>", contentType: "text/html" }));
  const popupPromise = context.waitForEvent("page");
  await link.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL("https://example.org/practice");
  await expect(popup.getByRole("heading")).toHaveText("Practice destination");
  await expect(frame.locator(".presenter-tools,button:not([data-student-qa-toggle]),input,form")).toHaveCount(0);
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await popup.close();
});

test("imported SVG cannot animate a safe resource destination into a rejected URL", async ({ page }) => {
  const document = resourceLesson();
  document.slides.push({ id: "svg", type: "imported-html", title: "Imported",
    html: '<svg viewBox="0 0 200 100"><a href="https://example.org/safe"><set attributeName="href" to="https://user:secret@example.org/private" begin="0s"/><text x="5" y="30">Safe resource</text></a></svg>' } as never);
  await page.setContent(buildStandaloneLessonHtml(document));
  const html = await page.evaluate(source => new Function(`${source}\nreturn buildStudentSnapshotHtml();`)() as string, studentSnapshotRuntimeSource());
  await page.setContent(html);
  const anchor = page.locator('svg a');
  await anchor.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await anchor.evaluate(node => (node as SVGAElement).href.animVal)).toBe("https://example.org/safe");
});

for (const mode of ["saved", "answers"] as const) {
  test(`final merged ${mode} bundle PDF retains clickable resource links`, async ({ page }) => {
    const document = mode === "saved" ? createSavedStateExportDocument(resourceLesson()) : createAnswerKeyExportDocument(resourceLesson());
    const sheets = createA4BundleSheetDocuments(buildStandaloneLessonHtml(document, { staticAnnotations: mode === "saved" }));
    const merged = await PDFDocument.create();
    for (const sheet of sheets) {
      await page.setContent(sheet.html);
      await page.emulateMedia({ media: "print" });
      const source = await PDFDocument.load(await page.pdf({ format: "A4", landscape: sheet.orientation === "landscape", printBackground: true, preferCSSPageSize: true }));
      const [copy] = await merged.copyPages(source, [0]);
      merged.addPage(copy);
    }
    const final = await PDFDocument.load(await merged.save());
    const links: string[] = [];
    for (const pdfPage of final.getPages()) {
      const annotations = pdfPage.node.lookup(PDFName.of("Annots"), PDFArray);
      for (let index = 0; index < annotations.size(); index++) {
        const annotation = annotations.lookup(index, PDFDict);
        const action = annotation.lookupMaybe(PDFName.of("A"), PDFDict);
        const uri = action?.lookup(PDFName.of("URI"));
        if (uri instanceof PDFString || uri instanceof PDFHexString) links.push(uri.decodeText());
      }
    }
    expect(links).toEqual(expect.arrayContaining(["https://example.org/practice", "https://example.org/sow"]));
  });
}
