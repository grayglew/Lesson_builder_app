import chromium from "@sparticuz/chromium";
import { PDFDocument } from "pdf-lib";
import puppeteer, { type Page } from "puppeteer-core";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createPresenterPdfSlideDocuments } from "@/features/builder/presenter-pdf";
import { createA4BundleSheetDocuments } from "@/features/builder/a4-bundle-pdf";

chromium.setGraphicsMode = false;

export async function renderPresenterSnapshotToPdf(html: string) {
  const pagePdfs = await renderPresenterSnapshotPages(html, async (page) => {
    await page.emulateMediaType("print");
    return page.pdf(pdfPageOptions());
  });
  return mergeOnePagePdfs(pagePdfs);
}

export async function renderA4BundleSnapshotToPdf(html: string) {
  const sheets = createA4BundleSheetDocuments(html);
  const pagePdfs = await renderSnapshotDocuments(
    sheets.map((sheet) => sheet.html),
    async (page, index) => {
      await page.emulateMediaType("print");
      return page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        format: "A4",
        landscape: sheets[index].orientation === "landscape",
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        timeout: 120000,
      });
    },
  );
  return mergeOnePagePdfs(pagePdfs);
}

async function mergeOnePagePdfs(pagePdfs: Uint8Array[]) {
  const merged = await PDFDocument.create();
  for (const onePagePdf of pagePdfs) {
    const source = await PDFDocument.load(onePagePdf);
    const [copiedPage] = await merged.copyPages(source, [0]);
    merged.addPage(copiedPage);
  }
  return merged.save();
}

async function renderPresenterSnapshotPages<T>(
  html: string,
  renderPage: (page: Page) => Promise<T>,
) {
  return renderSnapshotDocuments(createPresenterPdfSlideDocuments(html), renderPage);
}

async function renderSnapshotDocuments<T>(
  documents: string[],
  renderPage: (page: Page, index: number) => Promise<T>,
) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  const rendered: T[] = [];

  try {
    browser = await puppeteer.launch({
      args: await puppeteer.defaultArgs({
        args: chromium.args,
        headless: "shell",
      }),
      defaultViewport: {
        width: 1600,
        height: 1000,
        deviceScaleFactor: 1,
        isLandscape: true,
        isMobile: false,
        hasTouch: false,
      },
      executablePath: await chromium.executablePath(),
      headless: "shell",
      protocolTimeout: 180000,
    });

    for (const [index, documentHtml] of documents.entries()) {
      const snapshotFile = join(
        tmpdir(),
        `lesson-builder-presenter-${randomUUID()}-${index + 1}.html`,
      );
      let page: Page | undefined;
      try {
        await writeFile(snapshotFile, documentHtml, "utf8");
        page = await browser.newPage();
        await page.goto(pathToFileURL(snapshotFile).href, {
          waitUntil: "load",
          timeout: 120000,
        });
        await page.evaluate(async () => {
          await document.fonts?.ready;
          await Promise.all(
            Array.from(document.images, (image) =>
              typeof image.decode === "function"
                ? image.decode().catch(() => undefined)
                : Promise.resolve(),
            ),
          );
        });
        rendered.push(await renderPage(page, index));
      } finally {
        await page?.close().catch(() => undefined);
        await unlink(snapshotFile).catch(() => undefined);
      }
    }
    return rendered;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

function pdfPageOptions() {
  return {
    printBackground: true,
    preferCSSPageSize: true,
    width: "16in",
    height: "10in",
    margin: {
      top: "0",
      right: "0",
      bottom: "0",
      left: "0",
    },
    timeout: 120000,
  } as const;
}
