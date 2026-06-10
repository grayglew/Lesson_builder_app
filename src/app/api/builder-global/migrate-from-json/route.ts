import { NextResponse } from "next/server";
import { BUILDER_SYNC_BUCKET, getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import {
  builderSyncDocumentFolder,
  latestBuilderSyncSnapshot,
  storageSnapshotByteSize,
  storageSnapshotTimestamp,
} from "@/lib/builder-sync/documents";
import { saveBuilderGlobalData } from "@/lib/builder-global/data";

const MAX_GLOBAL_JSON_BYTES = 250 * 1024 * 1024;

export async function POST() {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  try {
    const folder = builderSyncDocumentFolder(auth.user.id, "global");
    const { data: snapshots, error: listError } = await auth.supabase.storage.from(BUILDER_SYNC_BUCKET).list(folder, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });

    if (listError) throw listError;

    const latest = latestBuilderSyncSnapshot(snapshots || []);
    if (!latest) {
      return NextResponse.json({ ok: false, error: "No global JSON snapshot was found." }, { status: 404 });
    }

    const byteSize = storageSnapshotByteSize(latest);
    if (byteSize > MAX_GLOBAL_JSON_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Global JSON snapshot is too large for the safe migration route." },
        { status: 413 },
      );
    }

    const path = `${folder}/${latest.name}`;
    const { data: blob, error: downloadError } = await auth.supabase.storage.from(BUILDER_SYNC_BUCKET).download(path);
    if (downloadError) throw downloadError;

    const document = JSON.parse(await blob.text()) as Record<string, unknown>;
    const result = await saveBuilderGlobalData(auth.supabase, auth.user.id, document);
    const retrievalItems = Array.isArray(document.retrievalItems) ? document.retrievalItems : [];
    const slideTemplates = Array.isArray(document.slideTemplates) ? document.slideTemplates : [];

    return NextResponse.json({
      ok: true,
      migratedFrom: path,
      migratedAt: new Date().toISOString(),
      snapshotUpdatedAt: storageSnapshotTimestamp(latest),
      byteSize,
      counts: {
        classes: Array.isArray(document.classNames) ? document.classNames.length : 0,
        retrievalItems: retrievalItems.length,
        questionImages: countImages(retrievalItems, "images"),
        answerImages: countImages(retrievalItems, "answerImages"),
        slideTemplates: slideTemplates.length,
      },
      idMapCount: result.idMap.length,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not migrate global JSON." },
      { status: 500 },
    );
  }
}

function countImages(items: unknown[], field: "images" | "answerImages") {
  return items.reduce<number>((count, item) => {
    if (!item || typeof item !== "object") return count;
    const images = Array.isArray((item as Record<string, unknown>)[field])
      ? ((item as Record<string, unknown>)[field] as unknown[])
      : [];
    return count + images.filter(Boolean).length;
  }, 0);
}
