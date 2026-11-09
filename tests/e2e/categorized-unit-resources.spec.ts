import { expect, test } from "@playwright/test";
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFString, PDFHexString } from "pdf-lib";
import { buildStandaloneLessonHtml } from "../../src/features/builder/lesson-export";
import { createInitialBuilderDocument, type BuilderDocument } from "../../src/features/builder/schema";
import { studentSnapshotRuntimeSource, STUDENT_VIEWER_SANDBOX } from "../../src/features/builder/student-snapshot-runtime";
import { createA4BundleSheetDocuments } from "../../src/features/builder/a4-bundle-pdf";
import { createSavedStateExportDocument, createAnswerKeyExportDocument } from "../../src/features/builder/saved-lesson-parity";

function lesson(): BuilderDocument {
  return { ...createInitialBuilderDocument(), slides: [{ id: "unit", type: "template", title: "Probability resources", bullets: [], resources: {
    video: "https://example.org/video", supportSheet: "https://example.org/support",
    email: "teacher@school.org", practice: "https://example.org/practice",
    additionalPractice: ["https://example.org/practice2", "https://example.org/practice3", "Resource four is in your book", "https://example.org/practice5", "https://example.org/practice6"],
    examQuestions: "Ask me for the challenge sheet", mathsChallenge: "https://example.org/challenge",
    investigation: "Try questions 4–6 in your book",
  } }] };
}

test("categorized student resources stay readable, linked and contained on phone/tablet/desktop", async ({ page, context }, testInfo) => {
  await page.setContent(buildStandaloneLessonHtml(lesson()));
  const html = await page.evaluate(source => new Function(`${source}\nreturn buildStudentSnapshotHtml();`)() as string, studentSnapshotRuntimeSource());
  await page.setContent(`<iframe title="Student lesson" sandbox="${STUDENT_VIEWER_SANDBOX}" style="border:0;width:100%;height:100vh"></iframe>`);
  await page.locator("iframe").evaluate((frame, source) => { (frame as HTMLIFrameElement).srcdoc = source; }, html);
  const frame = page.frameLocator("iframe");
  await expect(frame.getByRole("link", { name: "Email your teacher" })).toHaveAttribute("href", "mailto:teacher@school.org");
  await expect(frame.getByRole("link")).toHaveCount(9);
  await expect(frame.locator(".unit-resource-practice .unit-resource-action")).toHaveCount(6);
  await expect(frame.locator(".unit-resource-board")).not.toContainText("https://");
  await expect(frame.getByText("Ask me for the challenge sheet", { exact: true })).toHaveCount(1);
  await expect(frame.getByRole("link", { name: /Ask me/ })).toHaveCount(0);
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const board = frame.locator(".unit-resource-board");
    expect(await board.evaluate(node => {
      const slide = node.closest(".lesson-slide")!;
      return node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight + 1 &&
        slide.scrollHeight <= slide.clientHeight + 1 && document.documentElement.scrollWidth <= innerWidth;
    })).toBe(true);
    for (const link of await frame.getByRole("link").all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await link.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    }
    const cards = await frame.locator(".unit-resource-practice .unit-resource-action").evaluateAll(nodes => nodes.map(node => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y })));
    expect(Math.abs(cards[0].y - cards[1].y)).toBeLessThan(1);
    expect(Math.abs(cards[0].x - cards[2].x)).toBeLessThan(1);
    expect(Math.abs(cards[0].x - cards[4].x)).toBeLessThan(1);
    expect(cards[4].y).toBeGreaterThan(cards[2].y);
    await page.screenshot({ path: testInfo.outputPath(`student-resources-${width}.png`) });
  }
  await context.route("https://example.org/**", route => route.fulfill({ body: "Practice resources" }));
  const popupPromise = context.waitForEvent("page");
  await frame.getByRole("link", { name: "Practice 6" }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL("https://example.org/practice6");
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await popup.close();
});

for (const answers of [false, true]) {
  test(`categorized ${answers ? "answer" : "saved"} PDF retains web and email links with unclipped cards`, async ({ page }) => {
    const document = answers ? createAnswerKeyExportDocument(lesson()) : createSavedStateExportDocument(lesson());
    const sheets = createA4BundleSheetDocuments(buildStandaloneLessonHtml(document, { staticAnnotations: !answers }));
    const merged = await PDFDocument.create();
    for (const sheet of sheets) {
      await page.setContent(sheet.html);
      await page.emulateMedia({ media: "print" });
      const board = page.locator(".unit-resource-board");
      expect(await board.evaluate(node => node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth)).toBe(true);
      const source = await PDFDocument.load(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
      const [copy] = await merged.copyPages(source, [0]);
      merged.addPage(copy);
    }
    const final = await PDFDocument.load(await merged.save());
    const links: string[] = [];
    for (const pdfPage of final.getPages()) {
      const annotations = pdfPage.node.lookup(PDFName.of("Annots"), PDFArray);
      for (let index = 0; index < annotations.size(); index++) {
        const action = annotations.lookup(index, PDFDict).lookupMaybe(PDFName.of("A"), PDFDict);
        const uri = action?.lookup(PDFName.of("URI"));
        if (uri instanceof PDFString || uri instanceof PDFHexString) links.push(uri.decodeText());
      }
    }
    expect(links).toEqual(expect.arrayContaining(["https://example.org/video", "https://example.org/support", "mailto:teacher@school.org", "https://example.org/practice", "https://example.org/challenge"]));
    expect(links).toEqual(expect.arrayContaining(["https://example.org/practice2", "https://example.org/practice3", "https://example.org/practice5", "https://example.org/practice6"]));
    expect(links).toHaveLength(9);
  });
}
