import { NextResponse } from "next/server";
import {
  BUILDER_SYNC_BUCKET,
  getAuthorizedBuilderSyncClient,
  isBuilderLessonPath,
} from "@/lib/builder-sync/auth";
import {
  assertValidLessonSize,
  BuilderLessonRow,
  isUuid,
  mapBuilderLessonRow,
  normalizeConfidenceSummary,
  normalizeByteSize,
  normalizeClassName,
  normalizeLessonTitle,
  normalizeTeachingDate,
} from "@/lib/builder-sync/saved-lessons";

export async function POST(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  const path = String(body.path || "").trim();
  const byteSize = normalizeByteSize(body.byteSize);

  if (!isUuid(id) || !isBuilderLessonPath(auth.user.id, id, path)) {
    return NextResponse.json({ ok: false, error: "Invalid saved lesson path." }, { status: 400 });
  }

  if (!assertValidLessonSize(byteSize)) {
    return NextResponse.json({ ok: false, error: "Invalid saved lesson size." }, { status: 400 });
  }

  const { data: previousLesson, error: previousLessonError } =
    await auth.supabase
      .from("builder_lessons")
      .select("storage_path")
      .eq("id", id)
      .eq("owner_id", auth.user.id)
      .is("deleted_at", null)
      .maybeSingle();

  if (previousLessonError) {
    return NextResponse.json(
      { ok: false, error: previousLessonError.message },
      { status: 500 },
    );
  }

  const lessonRow: Record<string, unknown> = {
    id,
    owner_id: auth.user.id,
    bucket: BUILDER_SYNC_BUCKET,
    storage_path: path,
    title: normalizeLessonTitle(body.title),
    class_name: normalizeClassName(body.className),
    teaching_date: normalizeTeachingDate(body.teachingDate),
    byte_size: byteSize,
    deleted_at: null,
  };
  if (Object.prototype.hasOwnProperty.call(body, "confidenceSummary")) {
    lessonRow.confidence_summary = normalizeConfidenceSummary(body.confidenceSummary);
  }

  const { data, error } = await auth.supabase
    .from("builder_lessons")
    .upsert(
      lessonRow,
      { onConflict: "id" }
    )
    .select("id, title, class_name, teaching_date, byte_size, taught_at, confidence_summary, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const previousPath = String(previousLesson?.storage_path || "");
  if (
    previousPath &&
    previousPath !== path &&
    isBuilderLessonPath(auth.user.id, id, previousPath)
  ) {
    // The new database row is already authoritative. Old version cleanup is
    // best-effort so a transient Storage error never invalidates a good save.
    await auth.supabase.storage
      .from(BUILDER_SYNC_BUCKET)
      .remove([previousPath]);
  }

  return NextResponse.json({
    ok: true,
    lesson: mapBuilderLessonRow(data as BuilderLessonRow),
  });
}
