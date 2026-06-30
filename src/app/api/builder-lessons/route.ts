import { NextResponse } from "next/server";
import { getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import { BuilderLessonRow, mapBuilderLessonRow } from "@/lib/builder-sync/saved-lessons";

export async function GET() {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.supabase
    .from("builder_lessons")
    .select("id, title, class_name, teaching_date, byte_size, taught_at, confidence_summary, created_at, updated_at")
    .eq("owner_id", auth.user.id)
    .is("deleted_at", null)
    .order("taught_at", { ascending: true, nullsFirst: true })
    .order("teaching_date", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const lessons = ((data || []) as BuilderLessonRow[]).map(mapBuilderLessonRow);
  const totalByteSize = lessons.reduce((total, lesson) => total + lesson.byteSize, 0);

  return NextResponse.json({
    ok: true,
    lessons,
    totalByteSize,
  });
}
