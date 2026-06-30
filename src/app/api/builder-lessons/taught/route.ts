import { NextResponse } from "next/server";
import { getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import { BuilderLessonRow, isUuid, mapBuilderLessonRow } from "@/lib/builder-sync/saved-lessons";

export async function POST(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();

  if (!isUuid(id)) {
    return NextResponse.json({ ok: false, error: "Invalid lesson id." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("builder_lessons")
    .update({
      taught_at: body.taught ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .is("deleted_at", null)
    .select("id, title, class_name, teaching_date, byte_size, taught_at, confidence_summary, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "Saved lesson not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    lesson: mapBuilderLessonRow(data as BuilderLessonRow),
  });
}
