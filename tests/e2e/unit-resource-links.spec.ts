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
