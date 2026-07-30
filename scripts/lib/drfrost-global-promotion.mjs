import { createHash } from "node:crypto";

export const APPROVED_DRFROST_MANIFEST_HASH =
  "ed76a3c2d9e6a42dd41097fc79c4b84725494a04305fba69b5ca98e765c6288b";
export const APPROVED_DRFROST_LO_COUNT = 1645;
export const APPROVED_DRFROST_IMAGE_COUNT = 26320;

export async function inspectGlobalPromotion({
  manifest,
  manifestHash,
  adapter,
}) {
  validateApprovedSource(manifest, manifestHash);
  const ownerId = await adapter.resolveOwnerId(manifest.ownerEmail);
  const codes = manifest.entries.map((entry) => String(entry.code).toLowerCase());
  const canonicalLos = await adapter.loadCanonicalPersonalLos(ownerId, codes);
  const canonicalByCode = new Map(canonicalLos.map((row) => [row.lo_code, row]));
  const missingCodes = codes.filter((code) => !canonicalByCode.has(code));
  if (missingCodes.length) {
    throw new Error(`Promotion inventory is missing ${missingCodes.length} canonical LOs.`);
  }

  const canonicalIds = canonicalLos.map((row) => row.id);
  const canonicalImages = await adapter.loadCanonicalPersonalImages(ownerId, canonicalIds);
  if (canonicalImages.length !== APPROVED_DRFROST_IMAGE_COUNT) {
    throw new Error(
      `Expected ${APPROVED_DRFROST_IMAGE_COUNT} canonical image references; found ${canonicalImages.length}.`,
    );
  }

  const relatedLos = await adapter.loadOtherPersonalLos(ownerId, codes);
  const targetBySourceId = new Map(
    relatedLos.map((row) => [row.id, canonicalByCode.get(row.lo_code)?.id]),
  );
  const relevantIds = [...canonicalIds, ...relatedLos.map((row) => row.id)];
  const [progressRows, personalImageRows] = await Promise.all([
    adapter.loadProgressRows(relevantIds),
    adapter.loadPersonalImageRows(relevantIds),
  ]);
  const conflicts = findPromotionConflicts({
    canonicalIds: new Set(canonicalIds),
    targetBySourceId,
    progressRows,
    personalImageRows,
  });

  const plan = {
    schemaVersion: "drfrost-global-promotion/v1",
    sourceManifestHash: manifestHash,
    targetProjectRef: manifest.targetProjectRef,
    ownerEmail: manifest.ownerEmail,
    ownerId,
    loCount: canonicalLos.length,
    imageReferenceCount: canonicalImages.length,
    conflictCount: conflicts.length,
    canonicalLoIds: canonicalIds,
    canonicalImageIds: canonicalImages.map((row) => row.id),
    repointProgress: progressRows
      .filter((row) => targetBySourceId.has(row.retrieval_lo_id))
      .map((row) => ({ id: row.id, from: row.retrieval_lo_id, to: targetBySourceId.get(row.retrieval_lo_id) })),
    repointImages: personalImageRows
      .filter((row) => targetBySourceId.has(row.retrieval_lo_id))
      .map((row) => ({ id: row.id, from: row.retrieval_lo_id, to: targetBySourceId.get(row.retrieval_lo_id) })),
    archivePersonalLos: relatedLos.map((row) => ({ id: row.id, previousArchivedAt: row.archived_at || null })),
    conflicts,
    inspectedAt: new Date().toISOString(),
  };
  return { plan, planHash: hashPromotionPlan(plan) };
}

export async function applyApprovedGlobalPromotion({ plan, approval, adapter }) {
  validatePromotionApproval(plan, approval);
  const rollback = await adapter.applyPromotion(plan);
  return {
    schemaVersion: "drfrost-global-promotion-report/v1",
    planHash: hashPromotionPlan(plan),
    sourceManifestHash: plan.sourceManifestHash,
    targetProjectRef: plan.targetProjectRef,
    ownerEmail: plan.ownerEmail,
    loCount: plan.loCount,
    imageReferenceCount: plan.imageReferenceCount,
    conflictCount: plan.conflictCount,
    appliedAt: new Date().toISOString(),
    rollback,
  };
}

export function validatePromotionApproval(plan, approval) {
  if (!approval?.approved) throw new Error("Explicit global-promotion approval is required.");
  const planHash = hashPromotionPlan(plan);
  const checks = [
    [approval.planHash, planHash, "promotion plan hash"],
    [approval.sourceManifestHash, plan.sourceManifestHash, "source manifest hash"],
    [approval.targetProjectRef, plan.targetProjectRef, "target project"],
    [String(approval.ownerEmail).toLowerCase(), String(plan.ownerEmail).toLowerCase(), "owner email"],
    [Number(approval.loCount), plan.loCount, "LO count"],
    [Number(approval.imageReferenceCount), plan.imageReferenceCount, "image reference count"],
    [Number(approval.conflictCount), plan.conflictCount, "conflict count"],
  ];
  for (const [actual, expected, label] of checks) {
    if (actual !== expected) throw new Error(`Approval ${label} does not match the promotion plan.`);
  }
  if (plan.conflictCount !== 0) {
    throw new Error("Promotion has unresolved progress or image conflicts.");
  }
}

export function hashPromotionPlan(plan) {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

function validateApprovedSource(manifest, manifestHash) {
  if (manifestHash !== APPROVED_DRFROST_MANIFEST_HASH) {
    throw new Error("Source manifest hash is not the approved partial-final import.");
  }
  if (manifest.entries?.length !== APPROVED_DRFROST_LO_COUNT) {
    throw new Error(`Expected ${APPROVED_DRFROST_LO_COUNT} LOs in the approved manifest.`);
  }
  const imageCount = manifest.entries.reduce(
    (total, entry) => total + (Array.isArray(entry.images) ? entry.images.length : 0),
    0,
  );
  if (imageCount !== APPROVED_DRFROST_IMAGE_COUNT) {
    throw new Error(`Expected ${APPROVED_DRFROST_IMAGE_COUNT} image references in the approved manifest.`);
  }
}

function findPromotionConflicts({ canonicalIds, targetBySourceId, progressRows, personalImageRows }) {
  const conflicts = [];
  const progressKeys = new Map();
  for (const row of progressRows) {
    const target = targetBySourceId.get(row.retrieval_lo_id) || row.retrieval_lo_id;
    if (!canonicalIds.has(target)) continue;
    const key = `${row.owner_id}|${target}|${String(row.class_name).trim().toLowerCase()}`;
    if (progressKeys.has(key)) {
      conflicts.push({ type: "progress", key, rowIds: [progressKeys.get(key), row.id] });
    } else progressKeys.set(key, row.id);
  }
  const imageKeys = new Map();
  for (const row of personalImageRows) {
    const target = targetBySourceId.get(row.retrieval_lo_id) || row.retrieval_lo_id;
    if (!canonicalIds.has(target) || row.scope === "global") continue;
    const key = `${row.owner_id}|${target}|${row.seen_count}|${row.role}`;
    if (imageKeys.has(key)) {
      conflicts.push({ type: "image", key, rowIds: [imageKeys.get(key), row.id] });
    } else imageKeys.set(key, row.id);
  }
  return conflicts;
}
