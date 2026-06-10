import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetKind, AssetRef } from "./types";

type UploadOptions = {
  userId: string;
  lessonId?: string;
  retrievalItemId?: string;
  kind: AssetKind;
};

export async function uploadAsset(
  supabase: SupabaseClient,
  file: File,
  options: UploadOptions,
): Promise<AssetRef> {
  const id = crypto.randomUUID();
  const extension = inferExtension(file.name, file.type);
  const scope = options.lessonId
    ? `lessons/${options.lessonId}`
    : `retrieval/${options.retrievalItemId || "unlinked"}`;
  const path = `${options.userId}/${scope}/${id}.${extension}`;

  const upload = await supabase.storage.from("lesson-assets").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (upload.error) {
    throw upload.error;
  }

  const asset = {
    id,
    owner_id: options.userId,
    lesson_id: options.lessonId || null,
    retrieval_item_id: options.retrievalItemId || null,
    kind: options.kind,
    bucket: "lesson-assets",
    storage_path: path,
    file_name: file.name,
    mime_type: file.type || "application/octet-stream",
    byte_size: file.size,
  };

  const insert = await supabase.from("assets").insert(asset).select().single();
  if (insert.error) {
    await supabase.storage.from("lesson-assets").remove([path]);
    throw insert.error;
  }

  return {
    id,
    bucket: "lesson-assets",
    path,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    kind: options.kind,
  };
}

export async function assetToDataUrl(supabase: SupabaseClient, asset: AssetRef) {
  if (asset.path.startsWith("data:")) {
    return asset.path;
  }

  const download = await supabase.storage.from(asset.bucket).download(asset.path);
  if (download.error) {
    throw download.error;
  }

  return blobToDataUrl(download.data);
}

export async function assetToSignedUrl(supabase: SupabaseClient, asset: AssetRef) {
  if (asset.path.startsWith("data:")) {
    return asset.path;
  }

  const signed = await supabase.storage.from(asset.bucket).createSignedUrl(asset.path, 60 * 60);
  if (signed.error) {
    throw signed.error;
  }

  return signed.data.signedUrl;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function inferExtension(fileName: string, mimeType: string) {
  const fromName = fileName.split(".").pop();
  if (fromName && fromName.length <= 8 && fromName !== fileName) {
    return fromName.toLowerCase();
  }

  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "application/pdf") return "pdf";
  return "bin";
}
