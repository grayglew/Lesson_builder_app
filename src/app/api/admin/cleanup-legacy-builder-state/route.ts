import { NextResponse } from "next/server";
import { BUILDER_SYNC_BUCKET, getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import {
  legacyBuilderStateCleanupSummary,
  legacyBuilderStateFolder,
} from "@/lib/builder-sync/legacy-cleanup";

export const dynamic = "force-dynamic";

const CONFIRMATION = "delete-older-legacy-builder-state";

export async function GET() {
  return summarizeLegacyBuilderStateCleanup();
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (body.confirm !== CONFIRMATION) {
    return NextResponse.json(
      {
        ok: false,
        error: `Send confirm: "${CONFIRMATION}" to delete older legacy builder-state snapshots.`,
      },
      { status: 400 },
    );
  }

  return summarizeLegacyBuilderStateCleanup({ execute: true });
}

async function summarizeLegacyBuilderStateCleanup(options: { execute?: boolean } = {}) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const folder = legacyBuilderStateFolder(auth.user.id);
  const { data, error } = await auth.supabase.storage.from(BUILDER_SYNC_BUCKET).list(folder, {
    limit: 1000,
    sortBy: { column: "created_at", order: "desc" },
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const summary = legacyBuilderStateCleanupSummary(auth.user.id, data || []);

  if (!options.execute || !summary.removable.length) {
    return NextResponse.json({
      ok: true,
      executed: false,
      userEmail: auth.user.email || "",
      ...summary,
    });
  }

  const { error: removeError } = await auth.supabase.storage
    .from(BUILDER_SYNC_BUCKET)
    .remove(summary.removable.map((snapshot) => snapshot.path));

  if (removeError) {
    return NextResponse.json({ ok: false, error: removeError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    executed: true,
    userEmail: auth.user.email || "",
    removedCount: summary.removable.length,
    removedBytes: summary.removableBytes,
    kept: summary.kept,
  });
}
