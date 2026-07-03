import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUILDER_SYNC_BUCKET } from "@/lib/builder-sync/auth";
import {
  hashStudentSessionCode,
  normalizeStudentSessionCode,
  STUDENT_SNAPSHOT_SIGNED_URL_SECONDS,
} from "@/lib/builder-sync/student-sessions";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const code = normalizeStudentSessionCode(body.code);

  if (code.length < 6) {
    return NextResponse.json({ ok: false, error: "Enter the lesson code." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Student view is not configured." },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from("presentation_sessions")
    .select("id, bucket, snapshot_path, snapshot_version, expires_at, last_uploaded_at, closed_at")
    .eq("code_hash", hashStudentSessionCode(code))
    .is("closed_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "That code is not active." }, { status: 404 });
  }

  const bucket = String(data.bucket || BUILDER_SYNC_BUCKET);
  const snapshotPath = String(data.snapshot_path || "");
  if (!snapshotPath) {
    return NextResponse.json({ ok: false, error: "No lesson has been uploaded for that code yet." }, { status: 409 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(snapshotPath, STUDENT_SNAPSHOT_SIGNED_URL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: signError?.message || "Could not open the student lesson." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    snapshotUrl: signed.signedUrl,
    version: Number(data.snapshot_version) || 0,
    uploadedAt: data.last_uploaded_at || "",
    expiresAt: data.expires_at || "",
  });
}
