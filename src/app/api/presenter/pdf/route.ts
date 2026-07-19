import { NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
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
  preparePresenterPdfSnapshotHtml,
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
  const snapshotFile = join(
    tmpdir(),
    `lesson-builder-presenter-${randomUUID()}.html`,
  );
  await writeFile(
    snapshotFile,
    preparePresenterPdfSnapshotHtml(html),
    "utf8",
  );

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

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
    const page = await browser.newPage();
    await page.goto(pathToFileURL(snapshotFile).href, {
      waitUntil: "load",
      timeout: 120000,
    });
    await page.emulateMediaType("print");
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
    return page.pdf({
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
    });
  } finally {
    await browser?.close().catch(() => undefined);
    await unlink(snapshotFile).catch(() => undefined);
  }
}

function safePdfDownloadName(title: string) {
  return safeLessonDownloadName(title).replace(/\.lesson\.json$/, ".pdf");
}
