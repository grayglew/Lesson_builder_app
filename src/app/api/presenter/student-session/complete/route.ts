import { NextResponse } from "next/server";
import {
  BUILDER_SYNC_BUCKET,
  getAuthorizedBuilderSyncClient,
  isStudentSessionSnapshotPath,
} from "@/lib/builder-sync/auth";
import { assertValidLessonSize, isUuid, normalizeByteSize } from "@/lib/builder-sync/saved-lessons";
import { isExpiredSession, PresentationSessionRow } from "@/lib/builder-sync/student-sessions";

export async function POST(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const sessionId = String(body.sessionId || "").trim();
  const path = String(body.path || "").trim();
  const byteSize = normalizeByteSize(body.byteSize);

  if (!isUuid(sessionId) || !isStudentSessionSnapshotPath(auth.user.id, sessionId, path)) {
    return NextResponse.json({ ok: false, error: "Invalid student snapshot path." }, { status: 400 });
  }

  if (!assertValidLessonSize(byteSize)) {
    return NextResponse.json({ ok: false, error: "Invalid student snapshot size." }, { status: 400 });
  }

  const { data: existing, error: existingError } = await auth.supabase
    .from("presentation_sessions")
    .select("id, snapshot_version, expires_at, closed_at")
    .eq("id", sessionId)
    .eq("owner_id", auth.user.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  }

  if (!existing || isExpiredSession(existing as PresentationSessionRow)) {
    return NextResponse.json({ ok: false, error: "Student session has expired." }, { status: 410 });
  }

  const uploadedAt = new Date().toISOString();
  const nextVersion = Math.max(0, Number(existing.snapshot_version) || 0) + 1;
  const { data, error } = await auth.supabase
    .from("presentation_sessions")
    .update({
      bucket: BUILDER_SYNC_BUCKET,
      snapshot_path: path,
      snapshot_byte_size: byteSize,
      snapshot_version: nextVersion,
      last_uploaded_at: uploadedAt,
    })
    .eq("id", sessionId)
    .eq("owner_id", auth.user.id)
    .select("snapshot_version, last_uploaded_at")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    version: data.snapshot_version,
    uploadedAt: data.last_uploaded_at,
  });
}
