import { NextResponse } from "next/server";
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
  presenterPdfError,
} from "@/features/builder/presenter-pdf";
import {
  renderA4BundleSnapshotToPdf,
  renderPresenterSnapshotToPdf,
} from "@/lib/presenter/pdf-renderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  const output = body.output === "a4-bundle" ? "a4-bundle" : "pdf";

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
    const pdf =
      output === "a4-bundle"
        ? await renderA4BundleSnapshotToPdf(html)
        : await renderPresenterSnapshotToPdf(html);
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

function safePdfDownloadName(title: string) {
  return safeLessonDownloadName(title).replace(/\.lesson\.json$/, ".pdf");
}
