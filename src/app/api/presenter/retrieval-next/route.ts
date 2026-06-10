import { NextResponse } from "next/server";
import { getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import { isUuid } from "@/lib/builder-sync/saved-lessons";
import {
  advanceLiveRetrievalQuestion,
  getLiveRetrievalQuestion,
  normalizeLiveRetrievalQuestionInput,
} from "@/lib/builder-sync/live-retrieval";

export async function POST(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const input = normalizeLiveRetrievalQuestionInput(body);
  const shouldAdvance = body.advance !== false;

  if (!isUuid(input.lessonId)) {
    return NextResponse.json({ ok: false, error: "Invalid lesson id." }, { status: 400 });
  }

  if (!input.retrievalItemId && !input.lo) {
    return NextResponse.json({ ok: false, error: "Retrieval item or learning objective is required." }, { status: 400 });
  }

  const { data: lesson, error: lessonError } = await auth.supabase
    .from("builder_lessons")
    .select("id")
    .eq("id", input.lessonId)
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
    const result = shouldAdvance
      ? await advanceLiveRetrievalQuestion(auth.supabase, auth.user.id, input)
      : await getLiveRetrievalQuestion(auth.supabase, auth.user.id, input);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the next retrieval question.";
    return NextResponse.json({ ok: false, error: message }, { status: message.includes("not found") ? 404 : 500 });
  }
}
