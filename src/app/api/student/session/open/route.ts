import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BUILDER_SYNC_BUCKET,
  isStudentSessionSnapshotPath,
} from "@/lib/builder-sync/auth";
import {
  hashStudentSessionCode,
  normalizeStudentSessionCode,
  STUDENT_SNAPSHOT_SIGNED_URL_SECONDS,
} from "@/lib/builder-sync/student-sessions";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const code = normalizeStudentSessionCode(body.code);

  if (code.length !== 6) {
    return noStoreJson(
      { ok: false, error: "Enter the six-character lesson code." },
      400,
    );
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    return noStoreJson(
      { ok: false, error: error instanceof Error ? error.message : "Student view is not configured." },
      503,
    );
  }

  let codeHash = "";
  try {
    codeHash = hashStudentSessionCode(code);
  } catch (error) {
    return noStoreJson(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Student sharing is not configured.",
      },
      503,
    );
  }

  const { data, error } = await supabase
    .from("presentation_sessions")
    .select("id, owner_id, bucket, snapshot_path, snapshot_version, expires_at, last_uploaded_at, closed_at")
    .eq("code_hash", codeHash)
    .is("closed_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error("Could not look up a student presentation session.", error);
    return noStoreJson(
      { ok: false, error: "Could not open the student lesson." },
      500,
    );
  }

  if (!data) {
    return noStoreJson({ ok: false, error: "That code is not active." }, 404);
  }

  const bucket = String(data.bucket || BUILDER_SYNC_BUCKET);
  const snapshotPath = String(data.snapshot_path || "");
  if (!snapshotPath) {
    return noStoreJson(
      { ok: false, error: "The lesson is still being shared. Try again in a moment." },
      409,
    );
  }
  if (
    bucket !== BUILDER_SYNC_BUCKET ||
    !isStudentSessionSnapshotPath(
      String(data.owner_id || ""),
      String(data.id || ""),
      snapshotPath,
    )
  ) {
    console.error("Rejected an invalid student snapshot location.", {
      sessionId: data.id,
    });
    return noStoreJson(
      { ok: false, error: "Could not open the student lesson." },
      500,
    );
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(snapshotPath, STUDENT_SNAPSHOT_SIGNED_URL_SECONDS);

  if (signError || !signed?.signedUrl) {
    console.error("Could not sign a student snapshot URL.", signError);
    return noStoreJson(
      { ok: false, error: signError?.message || "Could not open the student lesson." },
      500,
    );
  }

  return noStoreJson({
    ok: true,
    snapshotUrl: signed.signedUrl,
    version: Number(data.snapshot_version) || 0,
    uploadedAt: data.last_uploaded_at || "",
    expiresAt: data.expires_at || "",
  });
}

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
