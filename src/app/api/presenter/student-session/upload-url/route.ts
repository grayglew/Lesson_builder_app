import { NextResponse } from "next/server";
import {
  BUILDER_SYNC_BUCKET,
  getAuthorizedBuilderSyncClient,
  isStudentSessionSnapshotPath,
  studentSessionSnapshotStoragePath,
} from "@/lib/builder-sync/auth";
import { assertValidLessonSize, isUuid, normalizeByteSize } from "@/lib/builder-sync/saved-lessons";
import { isExpiredSession, PresentationSessionRow } from "@/lib/builder-sync/student-sessions";

export async function POST(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const sessionId = String(body.sessionId || "").trim();
  const byteSize = normalizeByteSize(body.byteSize);

  if (!isUuid(sessionId)) {
    return NextResponse.json({ ok: false, error: "Invalid student session id." }, { status: 400 });
  }

  if (!assertValidLessonSize(byteSize)) {
    return NextResponse.json({ ok: false, error: "Student snapshot is empty or too large." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("presentation_sessions")
    .select("id, expires_at, closed_at")
    .eq("id", sessionId)
    .eq("owner_id", auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data || isExpiredSession(data as PresentationSessionRow)) {
    return NextResponse.json({ ok: false, error: "Student session has expired." }, { status: 410 });
  }

  const path = studentSessionSnapshotStoragePath(auth.user.id, sessionId);
  if (!isStudentSessionSnapshotPath(auth.user.id, sessionId, path)) {
    return NextResponse.json({ ok: false, error: "Invalid student snapshot path." }, { status: 400 });
  }

  const { data: upload, error: uploadError } = await auth.supabase.storage
    .from(BUILDER_SYNC_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });

  if (uploadError || !upload?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: uploadError?.message || "Could not create student snapshot upload URL." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    sessionId,
    path,
    signedUrl: upload.signedUrl,
    token: upload.token,
  });
}
