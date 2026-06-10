import { NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import {
  BUILDER_SYNC_BUCKET,
  getAuthorizedBuilderSyncClient,
  isPresenterPdfSnapshotPath,
} from "@/lib/builder-sync/auth";
import { isUuid, safeLessonDownloadName } from "@/lib/builder-sync/saved-lessons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PRESENTER_PDF_PRINT_CSS = `
@page{size:16in 10in;margin:0;}
html,body{margin:0!important;padding:0!important;background:#fff!important;}
.lesson-header,.presenter-tools{display:none!important;}
.lesson-deck{display:block!important;margin:0!important;padding:0!important;background:#fff!important;}
.lesson-slide{width:16in!important;height:10in!important;max-width:none!important;max-height:none!important;margin:0!important;box-shadow:none!important;border:0!important;break-after:page;page-break-after:always;overflow:hidden!important;}
.lesson-slide:last-child{break-after:auto;page-break-after:auto;}
.annotation-svg{pointer-events:none!important;}
`;

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
    const message = error instanceof Error ? error.message : "Could not render presenter PDF.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    await auth.supabase.storage.from(BUILDER_SYNC_BUCKET).remove([snapshotPath]);
  }
}

async function renderPresenterSnapshotToPdf(html: string) {
  const browser = await puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
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
    protocolTimeout: 60000,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(htmlWithPresenterPdfCss(html), {
      waitUntil: "load",
      timeout: 60000,
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
      timeout: 60000,
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}

function safePdfDownloadName(title: string) {
  return safeLessonDownloadName(title).replace(/\.lesson\.json$/, ".pdf");
}

function htmlWithPresenterPdfCss(html: string) {
  const printStyle = `<style id="presenter-pdf-print-css">${PRESENTER_PDF_PRINT_CSS}</style>`;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${printStyle}</head>`);
  }
  return `<!doctype html><html><head>${printStyle}</head><body>${html}</body></html>`;
}
