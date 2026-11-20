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
  expectedLessonTimestamp,
  LESSON_CONFLICT_MESSAGE,
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
      .select("storage_path, updated_at")
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

  const expected = expectedLessonTimestamp(body.expectedUpdatedAt);
  if (previousLesson ? !expected || previousLesson.updated_at !== expected : Boolean(expected)) {
    return NextResponse.json({ ok: false, code: "LESSON_CONFLICT", error: LESSON_CONFLICT_MESSAGE }, { status: 409 });
  }
  if (previousLesson?.storage_path === path) {
    return NextResponse.json({ ok: false, error: "Upload a new lesson snapshot before completing a save." }, { status: 400 });
  }
  const { data: uploaded, error: uploadError } = await auth.supabase.storage.from(BUILDER_SYNC_BUCKET).download(path);
  if (uploadError || !uploaded || uploaded.size !== byteSize) {
    return NextResponse.json({ ok: false, error: "The uploaded lesson could not be verified. Your previous saved lesson is unchanged." }, { status: 400 });
  }
  try {
    const document = JSON.parse(await uploaded.text());
    const ids = new Set<string>();
    if (!document || typeof document !== "object" || !Array.isArray(document.slides) ||
      document.slides.some((slide: unknown) => {
        if (!slide || typeof slide !== "object" || Array.isArray(slide)) return true;
        const entry = slide as Record<string, unknown>;
        if (typeof entry.id !== "string" || !entry.id.trim() || typeof entry.type !== "string" || !entry.type.trim() || ids.has(entry.id)) return true;
        ids.add(entry.id); return false;
      })) throw new Error("Invalid lesson slides");
  } catch {
    return NextResponse.json({ ok: false, error: "The uploaded lesson contains invalid JSON or slide content. Your previous saved lesson is unchanged." }, { status: 400 });
  }

  const lessonRow: Record<string, unknown> = {
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

  const mutation = previousLesson
    ? auth.supabase.from("builder_lessons").update(lessonRow)
      .eq("id", id).eq("owner_id", auth.user.id).is("deleted_at", null).eq("updated_at", expected)
    : auth.supabase.from("builder_lessons").insert({ id, owner_id: auth.user.id, ...lessonRow });
  const { data, error } = await mutation
    .select("id, title, class_name, teaching_date, byte_size, taught_at, confidence_summary, created_at, updated_at")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ ok: false, code: "LESSON_CONFLICT", error: LESSON_CONFLICT_MESSAGE }, { status: 409 });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, code: "LESSON_CONFLICT", error: LESSON_CONFLICT_MESSAGE }, { status: 409 });
  // Keep prior immutable JSON objects as recoverable lesson history.

  return NextResponse.json({
    ok: true,
    lesson: mapBuilderLessonRow(data as BuilderLessonRow),
  });
}
