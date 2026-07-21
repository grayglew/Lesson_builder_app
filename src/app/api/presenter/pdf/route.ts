import { NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import puppeteer, { type Page } from "puppeteer-core";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BUILDER_SYNC_BUCKET,
  getAuthorizedBuilderSyncClient,
  isPresenterPdfSnapshotPath,
} from "@/lib/builder-sync/auth";
import {
  assertValidLessonSize,
  isUuid,
  safeLessonDownloadName,
} from "@/lib/builder-sync/saved-lessons";
import {
  createPresenterPdfSlideDocuments,
  presenterPdfError,
} from "@/features/builder/presenter-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

chromium.setGraphicsMode = false;

type LessonLookupRow = {
  id: string;
  title: string;
};

export async function POST(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const lessonId = String(body.lessonId || "").trim();
  const snapshotPath = String(body.snapshotPath || "").trim();
  const output = body.output === "slide-images" ? "slide-images" : "pdf";

  if (!isUuid(lessonId) || !isPresenterPdfSnapshotPath(auth.user.id, lessonId, snapshotPath)) {
    return NextResponse.json({ ok: false, error: "Invalid presenter PDF snapshot path." }, { status: 400 });
  }

  const { data: lesson, error: lessonError } = await auth.supabase
    .from("builder_lessons")
    .select("id, title")
    .eq("id", lessonId)
    .eq("owner_id", auth.user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (lessonError) {
    return NextResponse.json({ ok: false, error: lessonError.message }, { status: 500 });
  }

  if (!lesson) {
    return NextResponse.json({ ok: false, error: "Saved lesson not found." }, { status: 404 });
  }

  try {
    const { data: snapshot, error: snapshotError } = await auth.supabase.storage
      .from(BUILDER_SYNC_BUCKET)
      .download(snapshotPath);

    if (snapshotError || !snapshot) {
      return NextResponse.json(
        { ok: false, error: snapshotError?.message || "Presenter PDF snapshot was not found." },
        { status: 404 }
      );
    }

    if (!assertValidLessonSize(snapshot.size)) {
      return NextResponse.json(
        {
          ok: false,
          error: "The PDF snapshot is empty or too large to render.",
        },
        { status: 413 },
      );
    }

    const html = await snapshot.text();
    if (output === "slide-images") {
      const images = await renderPresenterSnapshotToSlideImages(html);
      const archive = new JSZip();
      const slides = images.map((image, index) => {
        const file = `slides/${String(index + 1).padStart(3, "0")}.jpg`;
        archive.file(file, image);
        return {
          file,
          width: 1600,
          height: 1000,
          imageWidth: 1600,
          imageHeight: 1000,
        };
      });
      archive.file("manifest.json", JSON.stringify({ version: 1, slides }));
      const zip = await archive.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
      });
      const zipBody = zip.buffer.slice(
        zip.byteOffset,
        zip.byteOffset + zip.byteLength,
      ) as ArrayBuffer;
      return new NextResponse(zipBody, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Cache-Control": "no-store",
        },
      });
    }

    const pdf = await renderPresenterSnapshotToPdf(html);
    const pdfBody = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new NextResponse(pdfBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safePdfDownloadName((lesson as LessonLookupRow).title)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const failure = presenterPdfError(error);
    return NextResponse.json(
      { ok: false, error: failure.message },
      { status: failure.status },
    );
  } finally {
    await auth.supabase.storage
      .from(BUILDER_SYNC_BUCKET)
      .remove([snapshotPath])
      .catch(() => undefined);
  }
}

export async function renderPresenterSnapshotToPdf(html: string) {
  const pagePdfs = await renderPresenterSnapshotPages(html, async (page) => {
    await page.emulateMediaType("print");
    return page.pdf(pdfPageOptions());
  });
  const merged = await PDFDocument.create();
  for (const onePagePdf of pagePdfs) {
    const source = await PDFDocument.load(onePagePdf);
    const [copiedPage] = await merged.copyPages(source, [0]);
    merged.addPage(copiedPage);
  }
  return merged.save();
}

export function renderPresenterSnapshotToSlideImages(html: string) {
  return renderPresenterSnapshotPages(html, async (page) => {
    await page.emulateMediaType("screen");
    const geometry = await page.evaluate(() => {
      const slide = document.querySelector<HTMLElement>(".lesson-slide");
      if (!slide) return null;
      const bounds = slide.getBoundingClientRect();
      return {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
      };
    });
    assertSlideFillsExportViewport(geometry);
    const image = await page.screenshot({
      type: "jpeg",
      quality: 90,
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: 1600, height: 1000 },
    });
    return new Uint8Array(image);
  });
}

function assertSlideFillsExportViewport(
  geometry: { left: number; top: number; right: number; bottom: number } | null,
) {
  const tolerance = 0.5;
  if (
    !geometry ||
    Math.abs(geometry.left) > tolerance ||
    Math.abs(geometry.top) > tolerance ||
    Math.abs(geometry.right - 1600) > tolerance ||
    Math.abs(geometry.bottom - 1000) > tolerance
  ) {
    throw new Error(
      "The lesson slide does not fill the 1600x1000 export viewport.",
    );
  }
}

async function renderPresenterSnapshotPages<T>(
  html: string,
  renderPage: (page: Page) => Promise<T>,
) {
  const slideDocuments = createPresenterPdfSlideDocuments(html);
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

    for (const [index, slideHtml] of slideDocuments.entries()) {
      const snapshotFile = join(
        tmpdir(),
        `lesson-builder-presenter-${randomUUID()}-${index + 1}.html`,
      );
      let page: Page | undefined;
      try {
        await writeFile(snapshotFile, slideHtml, "utf8");
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
        rendered.push(await renderPage(page));
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

function safePdfDownloadName(title: string) {
  return safeLessonDownloadName(title).replace(/\.lesson\.json$/, ".pdf");
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
