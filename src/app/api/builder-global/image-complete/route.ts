import { NextResponse } from "next/server";
import { getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import {
  completeRetrievalImageUpload,
  deleteRetrievalImageReference,
  isUuid,
  normalizeImageRole,
} from "@/lib/builder-global/data";

export async function POST(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const itemId = String(body.itemId || "");
  const role = normalizeImageRole(body.role);
  const seenIndex = Number(body.seenIndex);
  const clear = Boolean(body.clear);

  if (!isUuid(itemId)) {
    return NextResponse.json({ ok: false, error: "Invalid retrieval item id." }, { status: 400 });
  }

  if (!Number.isInteger(seenIndex) || seenIndex < 0 || seenIndex > 7) {
    return NextResponse.json({ ok: false, error: "Invalid retrieval image slot." }, { status: 400 });
  }

  try {
    if (clear) {
      await deleteRetrievalImageReference(auth.supabase, auth.user.id, { itemId, role, seenIndex });
      return NextResponse.json({ ok: true, image: null });
    }

    const image = await completeRetrievalImageUpload(auth.supabase, auth.user.id, {
      itemId,
      role,
      seenIndex,
      assetId: String(body.assetId || ""),
      path: String(body.path || ""),
      fileName: String(body.fileName || "retrieval-image"),
      mimeType: String(body.mimeType || "image/png"),
      byteSize: Number(body.byteSize || 0),
      checksum: String(body.checksum || ""),
    });

    return NextResponse.json({ ok: true, image });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not complete retrieval image upload." },
      { status: 500 },
    );
  }
}
