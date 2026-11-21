import { NextResponse } from "next/server";
import { getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import { isUuid } from "@/lib/builder-sync/saved-lessons";
import { archiveLiveRetrievalItem, InactiveLiveRetrievalError } from "@/lib/builder-sync/live-retrieval";

export async function POST(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const input = await request.json().catch(() => null);
  const lessonId = String(input?.lessonId || "").trim();
  const itemId = String(input?.retrievalItemId || "").trim();
  const bank = String(input?.className || "").trim();
  if (!isUuid(lessonId) || !isUuid(itemId) || !bank || bank.length > 120) {
    return NextResponse.json({ ok: false, error: "A saved lesson and a specific retrieval entry are required." }, { status: 400 });
  }

  const { data: lesson, error } = await auth.supabase.from("builder_lessons")
    .select("id").eq("id", lessonId).eq("owner_id", auth.user.id).is("deleted_at", null).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "Could not check the saved lesson." }, { status: 500 });
  if (!lesson) return NextResponse.json({ ok: false, error: "Saved lesson not found." }, { status: 404 });

  try {
    const result = await archiveLiveRetrievalItem(auth.supabase, auth.user.id, itemId, bank);
    return NextResponse.json({ ok: true, result });
  } catch (archiveError) {
    const inactive = archiveError instanceof InactiveLiveRetrievalError;
    return NextResponse.json({ ok: false, error: inactive ? archiveError.message : "Could not archive the retrieval entry." }, { status: inactive ? 409 : 500 });
  }
}
