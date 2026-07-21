import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAuthorizedAdminContext,
  logAdminAction,
} from "@/lib/auth/app-users";
import { BUILDER_SYNC_BUCKET } from "@/lib/builder-sync/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SIGNED_URL_SECONDS = 60 * 60;
const SIGN_BATCH_SIZE = 100;

type StorageObject = {
  path: string;
  contentType: string;
  reportedSize: number;
};

export async function GET() {
  const auth = await getAuthorizedAdminContext();
  if ("response" in auth) return auth.response;

  const ownerId = auth.actorUser.id;
  try {
    const objects = await listStorageObjects(auth.adminSupabase, ownerId);
    const signedUrlByPath = await signStorageObjects(
      auth.adminSupabase,
      objects.map((object) => object.path),
    );
    const createdAt = new Date();
    const totalBytes = objects.reduce(
      (total, object) => total + object.reportedSize,
      0,
    );
    const manifest = {
      backupKind: "lesson-builder-storage-manifest",
      schemaVersion: 1,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(
        createdAt.getTime() + SIGNED_URL_SECONDS * 1000,
      ).toISOString(),
      bucket: BUILDER_SYNC_BUCKET,
      ownerId,
      objectCount: objects.length,
      totalBytes,
      objects: objects.map((object) => ({
        ...object,
        signedUrl: signedUrlByPath.get(object.path),
      })),
    };

    if (manifest.objects.some((object) => !object.signedUrl)) {
      throw new Error("One or more Storage objects could not be signed.");
    }

    await logAdminAction(
      auth.adminSupabase,
      ownerId,
      "builder_storage_backup_manifest_export",
      ownerId,
      { objectCount: objects.length, totalBytes, createdAt: manifest.createdAt },
    );

    return new Response(JSON.stringify(manifest, null, 2), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="lesson-builder-storage-manifest-${manifest.createdAt.slice(0, 10)}.json"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not create the Storage backup manifest.",
      },
      { status: 500 },
    );
  }
}

async function listStorageObjects(client: SupabaseClient, ownerId: string) {
  const queue = [ownerId];
  const objects: StorageObject[] = [];

  while (queue.length > 0) {
    const folder = queue.shift();
    if (!folder) continue;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client.storage
        .from(BUILDER_SYNC_BUCKET)
        .list(folder, {
          limit: 1000,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
      if (error) {
        throw new Error(
          `Could not list Storage folder ${folder}: ${error.message}`,
        );
      }

      for (const entry of data || []) {
        const fullPath = `${folder}/${entry.name}`;
        if (entry.id) {
          objects.push({
            path: fullPath,
            contentType: String(
              entry.metadata?.mimetype || "application/octet-stream",
            ),
            reportedSize: Number(entry.metadata?.size || 0),
          });
        } else {
          queue.push(fullPath);
        }
      }
      if (!data || data.length < 1000) break;
    }
  }
  return objects;
}

async function signStorageObjects(client: SupabaseClient, paths: string[]) {
  const signedUrlByPath = new Map<string, string>();
  for (let offset = 0; offset < paths.length; offset += SIGN_BATCH_SIZE) {
    const batch = paths.slice(offset, offset + SIGN_BATCH_SIZE);
    const { data, error } = await client.storage
      .from(BUILDER_SYNC_BUCKET)
      .createSignedUrls(batch, SIGNED_URL_SECONDS);
    if (error) throw error;
    for (const entry of data || []) {
      if (entry.path && entry.signedUrl) {
        signedUrlByPath.set(entry.path, entry.signedUrl);
      }
    }
  }
  return signedUrlByPath;
}
