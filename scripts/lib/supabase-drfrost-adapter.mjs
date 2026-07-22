import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const IMAGE_BUCKET = "lesson-assets";

export function createSupabaseDrFrostAdapter(supabase) {
  return {
    async resolveOwnerId(ownerEmail) {
      const normalizedEmail = ownerEmail.trim().toLowerCase();
      for (let page = 1; page <= 100; page += 1) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        const match = data.users.find(
          (user) => String(user.email || "").trim().toLowerCase() === normalizedEmail,
        );
        if (match) return match.id;
        if (data.users.length < 1000) break;
      }
      throw new Error(`No Supabase user found for ${ownerEmail}.`);
    },

    async findActiveLo(ownerId, code) {
      const { data, error } = await supabase
        .from("retrieval_los")
        .select("id,lo_code,code_source,legacy_lo_id,lo_text")
        .eq("owner_id", ownerId)
        .eq("lo_code", code)
        .is("archived_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async createActiveLo(ownerId, code, lo) {
      const { data, error } = await supabase
        .from("retrieval_los")
        .insert({
          owner_id: ownerId,
          lo_code: code,
          code_source: "prefix",
          lo_text: lo,
          archived_at: null,
        })
        .select("id,lo_code,code_source,legacy_lo_id,lo_text")
        .single();
      if (error) throw error;
      return data;
    },

    async snapshotCanonicalContent(ownerId, retrievalLoId) {
      const [{ data: lo, error: loError }, { data: images, error: imageError }] =
        await Promise.all([
          supabase
            .from("retrieval_los")
            .select("id,lo_code,code_source,legacy_lo_id,lo_text,archived_at")
            .eq("owner_id", ownerId)
            .eq("id", retrievalLoId)
            .single(),
          supabase
            .from("retrieval_lo_images")
            .select("seen_count,role,asset_id")
            .eq("owner_id", ownerId)
            .eq("retrieval_lo_id", retrievalLoId)
            .order("role")
            .order("seen_count"),
        ]);
      if (loError) throw loError;
      if (imageError) throw imageError;
      return { lo, images: images || [] };
    },

    async uploadImmutableImage(image) {
      const storagePath = `${image.ownerId}/retrieval/drfrost/${image.code}/${image.role}-${image.seenCount}-${image.sha256}.png`;
      const existing = await findAssetByPath(supabase, image.ownerId, storagePath);
      if (existing) {
        if (existing.checksum !== image.sha256) {
          throw new Error(`Stored asset checksum mismatch at ${storagePath}.`);
        }
        return { ...image, assetId: existing.id, storagePath };
      }

      const buffer = await readFile(image.filePath);
      const upload = await supabase.storage.from(IMAGE_BUCKET).upload(storagePath, buffer, {
        contentType: "image/png",
        cacheControl: "31536000",
        upsert: false,
      });
      if (upload.error && !isAlreadyExistsError(upload.error)) throw upload.error;

      const assetId = randomUUID();
      const { data, error } = await supabase
        .from("assets")
        .insert({
          id: assetId,
          owner_id: image.ownerId,
          lesson_id: null,
          retrieval_item_id: null,
          kind: "retrieval-image",
          bucket: IMAGE_BUCKET,
          storage_path: storagePath,
          file_name: `${image.code}-${image.role}-${image.seenCount}.png`,
          mime_type: "image/png",
          byte_size: image.byteSize,
          checksum: image.sha256,
        })
        .select("id,bucket,storage_path,checksum")
        .single();
      if (error) {
        const raced = await findAssetByPath(supabase, image.ownerId, storagePath);
        if (!raced || raced.checksum !== image.sha256) throw error;
        return { ...image, assetId: raced.id, storagePath };
      }
      return { ...image, assetId: data.id, storagePath };
    },

    async replaceCanonicalContent({ ownerId, retrievalLoId, code, lo, images }) {
      if (images.length !== 16) throw new Error(`Expected 16 images for ${code}.`);
      const { error: loError } = await supabase
        .from("retrieval_los")
        .update({ lo_code: code, code_source: "prefix", lo_text: lo })
        .eq("owner_id", ownerId)
        .eq("id", retrievalLoId)
        .is("archived_at", null);
      if (loError) throw loError;

      const rows = images.map((image) => ({
        owner_id: ownerId,
        retrieval_lo_id: retrievalLoId,
        seen_count: image.seenCount,
        role: image.role,
        asset_id: image.assetId,
      }));
      const { error: imageError } = await supabase
        .from("retrieval_lo_images")
        .upsert(rows, { onConflict: "owner_id,retrieval_lo_id,seen_count,role" });
      if (imageError) throw imageError;
    },

    async restoreCanonicalContent({ ownerId, retrievalLoId, snapshot }) {
      if (!snapshot?.lo) throw new Error(`Rollback snapshot missing for ${retrievalLoId}.`);
      const { error: loError } = await supabase
        .from("retrieval_los")
        .update({
          lo_code: snapshot.lo.lo_code,
          code_source: snapshot.lo.code_source,
          legacy_lo_id: snapshot.lo.legacy_lo_id,
          lo_text: snapshot.lo.lo_text,
          archived_at: snapshot.lo.archived_at,
        })
        .eq("owner_id", ownerId)
        .eq("id", retrievalLoId);
      if (loError) throw loError;
      const { error: deleteError } = await supabase
        .from("retrieval_lo_images")
        .delete()
        .eq("owner_id", ownerId)
        .eq("retrieval_lo_id", retrievalLoId);
      if (deleteError) throw deleteError;
      if (snapshot.images?.length) {
        const { error: imageError } = await supabase.from("retrieval_lo_images").insert(
          snapshot.images.map((image) => ({
            owner_id: ownerId,
            retrieval_lo_id: retrievalLoId,
            seen_count: image.seen_count,
            role: image.role,
            asset_id: image.asset_id,
          })),
        );
        if (imageError) throw imageError;
      }
    },

    async archiveCreatedLo(ownerId, retrievalLoId) {
      const { error } = await supabase
        .from("retrieval_los")
        .update({ archived_at: new Date().toISOString() })
        .eq("owner_id", ownerId)
        .eq("id", retrievalLoId);
      if (error) throw error;
    },
  };
}

async function findAssetByPath(supabase, ownerId, storagePath) {
  const { data, error } = await supabase
    .from("assets")
    .select("id,bucket,storage_path,checksum")
    .eq("owner_id", ownerId)
    .eq("bucket", IMAGE_BUCKET)
    .eq("storage_path", storagePath)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function isAlreadyExistsError(error) {
  const status = Number(error?.statusCode || error?.status);
  return status === 409 || /already exists|duplicate/i.test(String(error?.message || ""));
}
