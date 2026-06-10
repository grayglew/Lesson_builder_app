import { NextResponse } from "next/server";
import { getAuthorizedBuilderSyncClient } from "@/lib/builder-sync/auth";
import {
  createRetrievalImageUploadUrl,
  isUuid,
  normalizeImageRole,
} from "@/lib/builder-global/data";

const MAX_IMAGE_BYTES = 80 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await getAuthorizedBuilderSyncClient();
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const itemId = String(body.itemId || "");
  const role = normalizeImageRole(body.role);
  const seenIndex = Number(body.seenIndex);
  const fileName = String(body.fileName || "retrieval-image");
  const mimeType = String(body.mimeType || "image/png");
  const byteSize = Number(body.byteSize || 0);
  const checksum = String(body.checksum || "");

  if (!isUuid(itemId)) {
    return NextResponse.json({ ok: false, error: "Invalid retrieval item id." }, { status: 400 });
  }

  if (!Number.isInteger(seenIndex) || seenIndex < 0 || seenIndex > 7) {
    return NextResponse.json({ ok: false, error: "Invalid retrieval image slot." }, { status: 400 });
  }

  if (!mimeType.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "Retrieval uploads must be image files." }, { status: 400 });
  }

  if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > MAX_IMAGE_BYTES) {
    return NextResponse.json({ ok: false, error: "Invalid retrieval image size." }, { status: 400 });
  }

  try {
    const upload = await createRetrievalImageUploadUrl(auth.supabase, auth.user.id, {
      itemId,
      role,
      seenIndex,
      fileName,
      mimeType,
      byteSize,
      checksum,
    });
    if ("reusedImage" in upload) {
      return NextResponse.json({ ok: true, upload: { ...upload, reusedImage: upload.reusedImage } });
    }
    return NextResponse.json({ ok: true, upload });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not create retrieval image upload URL." },
      { status: 500 },
    );
  }
}
