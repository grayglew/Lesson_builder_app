import { NextResponse } from "next/server";
import { getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import { isUuid } from "@/lib/builder-sync/saved-lessons";
import {
  hashStudentSessionCode,
  randomStudentSessionCode,
  studentSessionExpiresAt,
} from "@/lib/builder-sync/student-sessions";

export async function POST(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const lessonId = String(body.lessonId || "").trim();

  if (!isUuid(lessonId)) {
    return NextResponse.json({ ok: false, error: "Invalid lesson id." }, { status: 400 });
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

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomStudentSessionCode();
    const { data, error } = await auth.supabase
      .from("presentation_sessions")
      .insert({
        owner_id: auth.user.id,
        source_lesson_id: lessonId,
        code_hash: hashStudentSessionCode(code),
        expires_at: studentSessionExpiresAt(),
      })
      .select("id, expires_at")
      .single();

    if (!error && data?.id) {
      return NextResponse.json({
        ok: true,
        sessionId: data.id,
        code,
        viewerUrl: new URL("/student", request.url).toString(),
        expiresAt: data.expires_at,
      });
    }

    if (!String(error?.code || error?.message || "").includes("23505")) {
      return NextResponse.json(
        { ok: false, error: error?.message || "Could not create a student session." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: false, error: "Could not create a unique student code." }, { status: 500 });
}
