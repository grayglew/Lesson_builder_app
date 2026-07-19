import { NextResponse } from "next/server";
import {
  BUILDER_SYNC_BUCKET,
  getAuthorizedBuilderSyncClient,
  isBuilderSyncDocumentPath,
} from "@/lib/builder-sync/auth";
import {
  BUILDER_SYNC_RETAINED_SNAPSHOTS,
  BuilderSyncDocumentKind,
  builderSyncCompletionConflict,
  builderSyncDocumentFolder,
  normalizeBuilderSyncKind,
  oldBuilderSyncSnapshotPaths,
} from "@/lib/builder-sync/documents";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_BUILDER_STATE_BYTES = 80 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const kind = normalizeBuilderSyncKind(body.kind);
  const path = String(body.path || "");
  const byteSize = Number(body.byteSize || 0);
  const parsedUpdatedAt = Date.parse(String(body.updatedAt || ""));
  const updatedAt = Number.isNaN(parsedUpdatedAt) ? new Date().toISOString() : new Date(parsedUpdatedAt).toISOString();
  const checksRevision = Object.prototype.hasOwnProperty.call(body, "expectedRevision");
  const expectedRevision = String(body.expectedRevision || "");

  if (!isBuilderSyncDocumentPath(auth.user.id, kind, path)) {
    return NextResponse.json({ ok: false, error: "Invalid sync path." }, { status: 400 });
  }

  if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > MAX_BUILDER_STATE_BYTES) {
    return NextResponse.json({ ok: false, error: "Invalid builder state size." }, { status: 400 });
  }

  if (checksRevision) {
    const folder = builderSyncDocumentFolder(auth.user.id, kind);
    const { data: snapshots, error: listError } = await auth.supabase.storage
      .from(BUILDER_SYNC_BUCKET)
      .list(folder, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });

    if (listError) {
      return NextResponse.json({ ok: false, error: listError.message }, { status: 500 });
    }

    const conflict = builderSyncCompletionConflict({
      userId: auth.user.id,
      kind,
      path,
      expectedRevision,
      snapshots: snapshots || [],
    });
    if (conflict) {
      const { error: removeError } = await auth.supabase.storage
        .from(BUILDER_SYNC_BUCKET)
        .remove([path]);
      return NextResponse.json(
        {
          ok: false,
          code: "WORKSPACE_CONFLICT",
          error: removeError
            ? `${conflict} The rejected snapshot could not be cleaned up.`
            : conflict,
        },
        { status: removeError ? 500 : 409 },
      );
    }
  }

  const cleanupError = await cleanupOldBuilderSyncSnapshots(auth.supabase, auth.user.id, kind);
  if (cleanupError) {
    return NextResponse.json({ ok: false, error: cleanupError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, kind, updatedAt, revision: path });
}

async function cleanupOldBuilderSyncSnapshots(
  supabase: SupabaseClient,
  userId: string,
  kind: BuilderSyncDocumentKind,
) {
  const folder = builderSyncDocumentFolder(userId, kind);
  const { data, error } = await supabase.storage.from(BUILDER_SYNC_BUCKET).list(folder, {
    limit: 100,
    sortBy: { column: "created_at", order: "desc" },
  });

  if (error) return error;

  const oldPaths = oldBuilderSyncSnapshotPaths(userId, kind, data || [], BUILDER_SYNC_RETAINED_SNAPSHOTS);
  if (!oldPaths.length) return null;

  const { error: removeError } = await supabase.storage.from(BUILDER_SYNC_BUCKET).remove(oldPaths);
  return removeError || null;
}
