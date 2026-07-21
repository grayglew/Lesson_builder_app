import { NextResponse } from "next/server";
import {
  BUILDER_SYNC_BUCKET,
  builderLessonStoragePath,
  getAuthorizedBuilderSyncClient,
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
  const requestedId = String(body.id || "").trim();
  const lessonId = requestedId || crypto.randomUUID();
  const byteSize = normalizeByteSize(body.byteSize);

  if (!isUuid(lessonId)) {
    return NextResponse.json({ ok: false, error: "Invalid lesson id." }, { status: 400 });
  }

  if (!assertValidLessonSize(byteSize)) {
    return NextResponse.json({ ok: false, error: "Lesson file is empty or exceeds the storage limit." }, { status: 400 });
  }

  if (requestedId) {
    const { data: existing, error: existingError } = await auth.supabase
      .from("builder_lessons")
      .select("id")
      .eq("id", lessonId)
      .eq("owner_id", auth.user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Saved lesson not found." }, { status: 404 });
    }
  }

  // Every save gets a new object path. Reusing lesson.json can make Supabase's
  // CDN return the previous lesson immediately after an upsert.
  const path = builderLessonStoragePath(
    auth.user.id,
    lessonId,
    crypto.randomUUID(),
  );
  const { data, error } = await auth.supabase.storage.from(BUILDER_SYNC_BUCKET).createSignedUploadUrl(path, {
    upsert: true,
  });

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Could not create signed lesson upload URL." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: lessonId,
    path,
    signedUrl: data.signedUrl,
    token: data.token,
  });
}
