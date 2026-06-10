import { NextResponse } from "next/server";
import { BUILDER_SYNC_BUCKET, getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import { isUuid } from "@/lib/builder-sync/saved-lessons";

export async function POST(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();

  if (!isUuid(id)) {
    return NextResponse.json({ ok: false, error: "Invalid lesson id." }, { status: 400 });
  }

  const { data: lesson, error: lookupError } = await auth.supabase
    .from("builder_lessons")
    .select("storage_path")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ ok: false, error: lookupError.message }, { status: 500 });
  }

  if (!lesson) {
    return NextResponse.json({ ok: false, error: "Saved lesson not found." }, { status: 404 });
  }

  const storagePath = String(lesson.storage_path || "");
  const { error: removeError } = await auth.supabase.storage.from(BUILDER_SYNC_BUCKET).remove([storagePath]);
  if (removeError && !/not found/i.test(removeError.message)) {
    return NextResponse.json({ ok: false, error: removeError.message }, { status: 500 });
  }

  const { error: deleteError } = await auth.supabase
    .from("builder_lessons")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", auth.user.id);

  if (deleteError) {
    return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
