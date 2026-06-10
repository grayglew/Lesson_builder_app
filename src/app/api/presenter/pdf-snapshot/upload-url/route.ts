import { NextResponse } from "next/server";
import {
  BUILDER_SYNC_BUCKET,
  getAuthorizedBuilderSyncClient,
  presenterPdfSnapshotStoragePath,
} from "@/lib/builder-sync/auth";
import {
  assertValidLessonSize,
  isUuid,
  normalizeByteSize,
} from "@/lib/builder-sync/saved-lessons";

export async function POST(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const lessonId = String(body.lessonId || "").trim();
  const byteSize = normalizeByteSize(body.byteSize);

  if (!isUuid(lessonId)) {
    return NextResponse.json({ ok: false, error: "Invalid lesson id." }, { status: 400 });
  }

  if (!assertValidLessonSize(byteSize)) {
    return NextResponse.json({ ok: false, error: "Presenter PDF snapshot is empty or too large." }, { status: 400 });
  }

  const { data: lesson, error: lessonError } = await auth.supabase
    .from("builder_lessons")
    .select("id")
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

  const path = presenterPdfSnapshotStoragePath(auth.user.id, lessonId);
  const { data, error } = await auth.supabase.storage.from(BUILDER_SYNC_BUCKET).createSignedUploadUrl(path, {
    upsert: true,
  });

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Could not create presenter PDF snapshot upload URL." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    path,
    signedUrl: data.signedUrl,
    token: data.token,
  });
}
