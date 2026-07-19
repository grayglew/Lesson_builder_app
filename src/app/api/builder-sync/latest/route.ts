import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import {
  builderSyncDocumentFolder,
  builderSyncSnapshotRevision,
  latestBuilderSyncSnapshot,
  normalizeBuilderSyncKind,
  storageSnapshotByteSize,
  storageSnapshotTimestamp,
} from "@/lib/builder-sync/documents";

export async function GET(request: NextRequest) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const kind = normalizeBuilderSyncKind(request.nextUrl.searchParams.get("kind"));
  const folder = builderSyncDocumentFolder(auth.user.id, kind);
  const { data: snapshots, error: listError } = await auth.supabase.storage.from("lesson-assets").list(folder, {
    limit: 100,
    sortBy: { column: "created_at", order: "desc" },
  });

  if (listError) {
    return NextResponse.json({ ok: false, error: listError.message }, { status: 500 });
  }

  const snapshot = latestBuilderSyncSnapshot(snapshots || []);
  if (snapshot) {
    const storagePath = `${folder}/${snapshot.name}`;
    const { data: signed, error: signError } = await auth.supabase.storage
      .from("lesson-assets")
      .createSignedUrl(storagePath, 60 * 60, {
        download: `lesson-builder-${kind}.json`,
      });

    if (signError || !signed?.signedUrl) {
      return NextResponse.json(
        { ok: false, error: signError?.message || "Could not create signed download URL." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      exists: true,
      kind,
      revision: builderSyncSnapshotRevision(auth.user.id, kind, snapshot.name),
      signedUrl: signed.signedUrl,
      updatedAt: storageSnapshotTimestamp(snapshot),
      byteSize: storageSnapshotByteSize(snapshot),
    });
  }

  const { data, error } = await auth.supabase
    .from("builder_state_sync")
    .select("bucket, storage_path, byte_size, updated_at")
    .eq("owner_id", auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: true, exists: false });
  }

  const { data: signed, error: signError } = await auth.supabase.storage
    .from(data.bucket)
    .createSignedUrl(data.storage_path, 60 * 60, {
      download: "lesson-builder-state.json",
    });

  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: signError?.message || "Could not create signed download URL." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    exists: true,
    kind,
    legacy: true,
    revision: `legacy:${data.bucket}:${data.storage_path}:${data.updated_at}`,
    signedUrl: signed.signedUrl,
    updatedAt: data.updated_at,
    byteSize: data.byte_size,
  });
}
