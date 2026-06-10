import { NextResponse } from "next/server";
import { BUILDER_SYNC_BUCKET, getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import { legacyBuilderStateCleanupSummary, legacyBuilderStateFolder } from "@/lib/builder-sync/legacy-cleanup";

export async function GET() {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  try {
    const [
      savedLessons,
      retrievalAssets,
      legacyRetrievalImageRefs,
      sharedRetrievalImageRefs,
      legacySnapshots,
    ] = await Promise.all([
      auth.supabase
        .from("builder_lessons")
        .select("byte_size")
        .eq("owner_id", auth.user.id)
        .is("deleted_at", null),
      auth.supabase
        .from("assets")
        .select("id,byte_size,checksum,kind")
        .eq("owner_id", auth.user.id)
        .in("kind", ["image", "retrieval-image"]),
      auth.supabase
        .from("retrieval_images")
        .select("asset_id")
        .eq("owner_id", auth.user.id),
      auth.supabase
        .from("retrieval_lo_images")
        .select("asset_id")
        .eq("owner_id", auth.user.id),
      auth.supabase.storage.from(BUILDER_SYNC_BUCKET).list(legacyBuilderStateFolder(auth.user.id), {
        limit: 1000,
        sortBy: { column: "created_at", order: "desc" },
      }),
    ]);

    for (const result of [savedLessons, retrievalAssets, legacyRetrievalImageRefs, sharedRetrievalImageRefs, legacySnapshots]) {
      if (result.error) throw result.error;
    }

    const savedLessonBytes = (savedLessons.data || []).reduce((total, row) => total + (Number(row.byte_size) || 0), 0);
    const referencedAssetIds = new Set([
      ...(legacyRetrievalImageRefs.data || []).map((row) => String(row.asset_id || "")).filter(Boolean),
      ...(sharedRetrievalImageRefs.data || []).map((row) => String(row.asset_id || "")).filter(Boolean),
    ]);
    const unreferencedRetrievalAssets = (retrievalAssets.data || []).filter((asset) => !referencedAssetIds.has(String(asset.id || "")));
    const unreferencedRetrievalAssetBytes = unreferencedRetrievalAssets.reduce((total, asset) => total + (Number(asset.byte_size) || 0), 0);
    const duplicateGroups = new Map<string, number[]>();
    (retrievalAssets.data || []).forEach((asset) => {
      const checksum = String(asset.checksum || "").trim().toLowerCase();
      if (!checksum) return;
      const group = duplicateGroups.get(checksum) || [];
      group.push(Number(asset.byte_size) || 0);
      duplicateGroups.set(checksum, group);
    });
    const duplicateStats = Array.from(duplicateGroups.values()).filter((sizes) => sizes.length > 1);
    const duplicateRetrievalImageChecksums = duplicateStats.length;
    const estimatedDuplicateRetrievalBytes = duplicateStats.reduce((total, sizes) => {
      const sorted = sizes.slice().sort((left, right) => left - right);
      return total + sorted.slice(0, -1).reduce((sum, size) => sum + size, 0);
    }, 0);
    const legacyBuilderState = legacyBuilderStateCleanupSummary(auth.user.id, legacySnapshots.data || []);

    return NextResponse.json({
      ok: true,
      userEmail: auth.user.email || "",
      savedLessonBytes,
      savedLessonCount: savedLessons.data?.length || 0,
      unreferencedRetrievalAssets: {
        count: unreferencedRetrievalAssets.length,
        byteSize: unreferencedRetrievalAssetBytes,
      },
      duplicateRetrievalImageChecksums,
      estimatedDuplicateRetrievalBytes,
      legacyBuilderState: {
        keptCount: legacyBuilderState.kept.length,
        removableCount: legacyBuilderState.removable.length,
        removableBytes: legacyBuilderState.removableBytes,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not build storage report." },
      { status: 500 },
    );
  }
}
