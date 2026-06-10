import { NextResponse } from "next/server";
import {
  BUILDER_SYNC_BUCKET,
  getAuthorizedBuilderSyncClient,
} from "@/lib/builder-sync/auth";
import {
  builderSyncDocumentPath,
  normalizeBuilderSyncKind,
} from "@/lib/builder-sync/documents";

const MAX_BUILDER_STATE_BYTES = 80 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const kind = normalizeBuilderSyncKind(body.kind);
  const byteSize = Number(body.byteSize || 0);

  if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > MAX_BUILDER_STATE_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Builder state is empty or exceeds the storage limit." },
      { status: 400 }
    );
  }

  const path = builderSyncDocumentPath(auth.user.id, kind);

  const { data, error } = await auth.supabase.storage
    .from(BUILDER_SYNC_BUCKET)
    .createSignedUploadUrl(path, {
      upsert: true,
    });

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Could not create signed upload URL." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    kind,
    path,
    signedUrl: data.signedUrl,
    token: data.token,
  });
}
