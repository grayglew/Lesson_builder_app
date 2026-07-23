import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_HELPER_VERSION = "2.0.9";

export async function buildDrFrostImportManifest({
  captureRoot,
  registerFiles,
  expectedTotal = 1809,
  requireAllChecked = true,
  partialFinal = false,
  targetProjectRef,
  ownerEmail,
}) {
  if (!targetProjectRef || !ownerEmail) {
    throw new Error("Target project ref and owner email are required for an import inventory.");
  }
  if (partialFinal && requireAllChecked) {
    throw new Error("A partial-final inventory cannot require every register item to be checked.");
  }

  const register = await readRegisterState(registerFiles);
  if (register.codes.size !== expectedTotal) {
    throw new Error(
      `Register contains ${register.codes.size} unique codes; expected ${expectedTotal}.`,
    );
  }
  if (requireAllChecked && register.checked.size !== expectedTotal) {
    throw new Error(
      `Capture register is incomplete: ${register.checked.size} checked and ${expectedTotal - register.checked.size} remaining.`,
    );
  }

  const candidates = new Map();
  const directories = await readdir(captureRoot, { withFileTypes: true });
  for (const directoryEntry of directories) {
    if (!directoryEntry.isDirectory()) continue;
    const directory = path.resolve(captureRoot, directoryEntry.name);
    const candidate = await inspectCapture(directory).catch(() => null);
    if (!candidate || !register.checked.has(candidate.code)) continue;
    const previous = candidates.get(candidate.code);
    if (!previous || candidate.completedAt > previous.completedAt) {
      candidates.set(candidate.code, candidate);
    }
  }

  const missing = [...register.checked]
    .filter((code) => !candidates.has(code))
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
  if (requireAllChecked && missing.length) {
    throw new Error(
      `No valid helper ${MIN_HELPER_VERSION}+ capture found for ${missing.length} checked code(s): ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? "…" : ""}`,
    );
  }

  const omissions = missing.map((code) => ({
    code,
    reason: `no-valid-helper-${MIN_HELPER_VERSION}+-capture`,
  }));
  const unchecked = [...register.codes]
    .filter((code) => !register.checked.has(code))
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }))
    .map((code) => ({ code, reason: "unchecked-register-item" }));
  const exclusions = [...omissions, ...unchecked].sort((left, right) =>
    left.code.localeCompare(right.code, "en", { numeric: true }),
  );

  return {
    schemaVersion: "drfrost-import-manifest/v1",
    inventoryMode: partialFinal
      ? "partial-final"
      : requireAllChecked
        ? "final"
        : "inspection-only",
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    targetProjectRef,
    ownerEmail: ownerEmail.trim().toLowerCase(),
    register: {
      expectedTotal,
      checked: register.checked.size,
      unchecked: expectedTotal - register.checked.size,
      eligibleChecked: candidates.size,
    },
    omissions,
    exclusions,
    entries: [...candidates.values()].sort((left, right) =>
      left.code.localeCompare(right.code, "en", { numeric: true }),
    ),
  };
}

export function hashImportManifest(manifest) {
  return createHash("sha256").update(stableStringify(manifest)).digest("hex");
}

export function assertApplyApproval({ manifest, manifestHash, approval }) {
  if (!approval?.approved) {
    throw new Error("Explicit import approval is required before any upload client is created.");
  }
  if (approval.targetProjectRef !== manifest.targetProjectRef) {
    throw new Error("Approval target project does not match the import manifest.");
  }
  if (String(approval.ownerEmail || "").toLowerCase() !== manifest.ownerEmail.toLowerCase()) {
    throw new Error("Approval owner email does not match the import manifest.");
  }
  if (approval.manifestHash !== manifestHash) {
    throw new Error("Approval manifest hash does not match the immutable inventory.");
  }
  if (approval.runId !== manifest.runId) {
    throw new Error("Approval run ID does not match the import manifest.");
  }
  if (!approval.approvedAt || Number.isNaN(Date.parse(approval.approvedAt))) {
    throw new Error("Approval must include a valid approvedAt timestamp.");
  }
}

export async function applyApprovedImport({
  manifest,
  manifestHash,
  approval,
  createAdapter,
  onCheckpoint = async () => undefined,
  uploadConcurrency = 1,
}) {
  const computedHash = hashImportManifest(manifest);
  if (computedHash !== manifestHash) {
    throw new Error("The supplied manifest hash does not match the manifest content.");
  }

  assertImportManifestStructure(manifest);

  // This gate intentionally runs before environment credentials are read or an
  // adapter capable of network/storage writes is constructed.
  assertApplyApproval({ manifest, manifestHash, approval });
  assertPartialImportApproval({ manifest, approval });
  if (!Number.isInteger(uploadConcurrency) || uploadConcurrency < 1 || uploadConcurrency > 16) {
    throw new Error("Image upload concurrency must be an integer between 1 and 16.");
  }
  const adapter = await createAdapter();
  const ownerId = await adapter.resolveOwnerId(manifest.ownerEmail);
  const report = {
    schemaVersion: "drfrost-import-report/v1",
    runId: manifest.runId,
    manifestHash,
    targetProjectRef: manifest.targetProjectRef,
    ownerEmail: manifest.ownerEmail,
    startedAt: new Date().toISOString(),
    completedAt: null,
    created: 0,
    replaced: 0,
    entries: [],
  };

  for (const entry of manifest.entries) {
    const existing = await adapter.findActiveLo(ownerId, entry.code);
    const retrievalLo = existing || (await adapter.createActiveLo(ownerId, entry.code, entry.lo));
    const previous = existing && adapter.snapshotCanonicalContent
      ? await adapter.snapshotCanonicalContent(ownerId, retrievalLo.id)
      : existing;
    const reportEntry = {
      code: entry.code,
      retrievalLoId: retrievalLo.id,
      action: existing ? "replaced" : "created",
      status: "uploading",
      previous,
      newLo: entry.lo,
      uploadedImages: [],
    };
    report.entries.push(reportEntry);
    await onCheckpoint(structuredClone(report));
    const uploadedImages = [];
    for (let imageIndex = 0; imageIndex < entry.images.length; imageIndex += uploadConcurrency) {
      const batch = entry.images.slice(imageIndex, imageIndex + uploadConcurrency);
      const uploadedBatch = await Promise.all(
        batch.map((image) =>
          adapter.uploadImmutableImage({
          ...image,
          ownerId,
          retrievalLoId: retrievalLo.id,
          code: entry.code,
          manifestHash,
          }),
        ),
      );
      uploadedImages.push(...uploadedBatch);
      reportEntry.uploadedImages = uploadedImages.map((uploaded) => ({
        assetId: uploaded.assetId,
        storagePath: uploaded.storagePath,
      }));
      await onCheckpoint(structuredClone(report));
    }
    reportEntry.status = "replacing";
    await onCheckpoint(structuredClone(report));
    await adapter.replaceCanonicalContent({
      ownerId,
      retrievalLoId: retrievalLo.id,
      code: entry.code,
      lo: entry.lo,
      images: uploadedImages,
      previous,
    });
    if (existing) report.replaced += 1;
    else report.created += 1;
    reportEntry.status = "complete";
    reportEntry.imageCount = uploadedImages.length;
    await onCheckpoint(structuredClone(report));
  }
  report.completedAt = new Date().toISOString();
  await onCheckpoint(structuredClone(report));
  return report;
}

function assertImportManifestStructure(manifest) {
  const register = manifest?.register;
  const omissions = Array.isArray(manifest?.omissions) ? manifest.omissions : [];
  const exclusions = Array.isArray(manifest?.exclusions) ? manifest.exclusions : [];
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const hasBasicCounts =
    Number.isInteger(register?.expectedTotal) &&
    register.expectedTotal > 0 &&
    Number.isInteger(register.checked) &&
    Number.isInteger(register.unchecked) &&
    Number.isInteger(register.eligibleChecked) &&
    register.checked + register.unchecked === register.expectedTotal &&
    register.eligibleChecked === entries.length &&
    register.checked === entries.length + omissions.length;
  const codes = [...entries.map((entry) => entry.code), ...exclusions.map((item) => item.code)];
  const hasExactCodePartition =
    codes.length === register?.expectedTotal && new Set(codes).size === codes.length;
  const isFinal =
    manifest?.inventoryMode === "final" &&
    register?.checked === register?.expectedTotal &&
    register?.unchecked === 0 &&
    register?.eligibleChecked === register?.expectedTotal &&
    entries.length === register?.expectedTotal &&
    omissions.length === 0 &&
    exclusions.length === 0;
  const isPartialFinal =
    manifest?.inventoryMode === "partial-final" &&
    hasBasicCounts &&
    hasExactCodePartition &&
    exclusions.length === register.expectedTotal - entries.length &&
    exclusions.filter((item) => item.reason === "unchecked-register-item").length ===
      register.unchecked &&
    exclusions.filter((item) => item.reason !== "unchecked-register-item").length ===
      omissions.length;

  if (!isFinal && !isPartialFinal) {
    throw new Error(
      "Inspection-only or incomplete Doctor Frost inventories cannot be applied.",
    );
  }
}

function assertPartialImportApproval({ manifest, approval }) {
  if (manifest.inventoryMode !== "partial-final") return;
  if (
    approval.allowPartial !== true ||
    approval.inventoryMode !== "partial-final" ||
    approval.approvedEntryCount !== manifest.entries.length ||
    approval.excludedEntryCount !== manifest.exclusions.length
  ) {
    throw new Error(
      "Partial-final imports require explicit approval of the exact included and excluded counts.",
    );
  }
}

export async function rollbackApprovedImport({ report, approval, createAdapter }) {
  const manifest = {
    runId: report.runId,
    targetProjectRef: report.targetProjectRef,
    ownerEmail: report.ownerEmail,
  };
  assertApplyApproval({
    manifest,
    manifestHash: report.manifestHash,
    approval,
  });
  const adapter = await createAdapter();
  const ownerId = await adapter.resolveOwnerId(report.ownerEmail);
  const results = [];
  for (const entry of [...report.entries].reverse()) {
    if (entry.status !== "complete") continue;
    if (entry.action === "created") {
      await adapter.archiveCreatedLo(ownerId, entry.retrievalLoId);
    } else {
      await adapter.restoreCanonicalContent({
        ownerId,
        retrievalLoId: entry.retrievalLoId,
        snapshot: entry.previous,
      });
    }
    results.push({ code: entry.code, action: entry.action });
  }
  return {
    schemaVersion: "drfrost-rollback-report/v1",
    runId: report.runId,
    completedAt: new Date().toISOString(),
    results,
  };
}

async function readRegisterState(registerFiles) {
  const codes = new Set();
  const checked = new Set();
  for (const file of registerFiles) {
    const text = await readFile(file, "utf8");
    for (const match of text.matchAll(/^\s*-\s*\[([ xX])\]\s*([0-9]{2,3}[a-z])\s*$/gim)) {
      const code = match[2].toLowerCase();
      codes.add(code);
      if (match[1].toLowerCase() === "x") checked.add(code);
    }
  }
  return { codes, checked };
}

async function inspectCapture(directory) {
  const manifestPath = path.join(directory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    manifest.schema_version !== "drfrost-example-batch/v1" ||
    manifest.status !== "complete" ||
    manifest.target_examples !== 8 ||
    manifest.completed_examples !== 8 ||
    !Array.isArray(manifest.items) ||
    manifest.items.length !== 8 ||
    !isVersionAtLeast(manifest.helper_version, MIN_HELPER_VERSION)
  ) {
    throw new Error("Capture manifest is not eligible for import.");
  }
  const code = String(manifest.requested_code || "").trim().toLowerCase();
  const lo = String(manifest.skill_heading || "").trim();
  if (!/^[0-9]{2,3}[a-z]$/.test(code) || !lo) {
    throw new Error("Capture code or canonical heading is missing.");
  }
  const completedAt = new Date(manifest.completed_at).toISOString();
  await stat(path.join(directory, "batch.complete"));
  const records = (await readFile(path.join(directory, "records.jsonl"), "utf8"))
    .split(/\r?\n/)
    .filter(Boolean);
  if (records.length !== 8) throw new Error("Capture does not contain eight records.");
  records.forEach((record) => JSON.parse(record));

  const images = [];
  for (const [index, item] of manifest.items.entries()) {
    if (Number(item.index) !== index + 1) throw new Error("Capture item indices are invalid.");
    images.push(
      await inspectPng(directory, item.question_file, "question", index + 1),
      await inspectPng(directory, item.feedback_file, "answer", index + 1),
    );
  }
  if (
    images.filter((image) => image.role === "question").length !== 8 ||
    images.filter((image) => image.role === "answer").length !== 8
  ) {
    throw new Error("Capture does not contain eight question and eight feedback PNGs.");
  }
  return {
    code,
    lo,
    helperVersion: manifest.helper_version,
    captureDirectory: directory,
    completedAt,
    images,
  };
}

async function inspectPng(directory, fileName, role, seenCount) {
  const safeName = path.basename(String(fileName || ""));
  if (!safeName || safeName !== fileName) throw new Error("Unsafe image path in capture manifest.");
  const filePath = path.join(directory, safeName);
  const buffer = await readFile(filePath);
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${safeName} is not a PNG file.`);
  }
  return {
    role,
    seenCount,
    filePath,
    byteSize: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

function isVersionAtLeast(value, minimum) {
  const parse = (version) => String(version || "").split(".").map((part) => Number(part));
  const left = parse(value);
  const right = parse(minimum);
  if (left.length < 3 || left.some((part) => !Number.isInteger(part))) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return true;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
