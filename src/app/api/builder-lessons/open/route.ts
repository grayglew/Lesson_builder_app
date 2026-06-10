import { NextResponse } from "next/server";
import { BUILDER_SYNC_BUCKET, getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import { PRESENTER_SIGNED_URL_SECONDS } from "@/lib/builder-sync/signed-url-expiry";
import {
  BuilderLessonRow,
  isUuid,
  mapBuilderLessonRow,
  safeLessonDownloadName,
} from "@/lib/builder-sync/saved-lessons";

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
    .select("id, title, class_name, teaching_date, storage_path, byte_size, taught_at, created_at, updated_at")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "Saved lesson not found." }, { status: 404 });
  }

  const row = data as BuilderLessonRow;
  const { data: signed, error: signError } = await auth.supabase.storage
    .from(BUILDER_SYNC_BUCKET)
    .createSignedUrl(String(row.storage_path || ""), PRESENTER_SIGNED_URL_SECONDS, {
      download: safeLessonDownloadName(row.title),
    });

  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: signError?.message || "Could not create signed lesson download URL." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    lesson: mapBuilderLessonRow(row),
    signedUrl: signed.signedUrl,
  });
}
