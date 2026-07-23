import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyApprovedImport,
  buildDrFrostImportManifest,
  hashImportManifest,
  loadImportCheckpoint,
} from "../../scripts/lib/drfrost-import.mjs";

const temporaryRoots: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Doctor Frost import inventory", () => {
  it("selects the newest valid 2.0.9+ capture and fingerprints all sixteen PNGs", async () => {
    const root = await makeRoot();
    await writeFile(path.join(root, "lane-1.md"), "- [x] 101a\n");
    await makeCapture(root, "20260720T000000Z-101a", "101a", "2.0.9", "2026-07-20T00:00:00Z");
    await makeCapture(root, "20260721T000000Z-101a", "101a", "2.1.0", "2026-07-21T00:00:00Z");

    const manifest = await buildDrFrostImportManifest({
      captureRoot: path.join(root, "captures"),
      registerFiles: [path.join(root, "lane-1.md")],
      expectedTotal: 1,
      requireAllChecked: true,
      targetProjectRef: "project-ref",
      ownerEmail: "grayglew@gmail.com",
    });

    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]).toMatchObject({
      code: "101a",
      helperVersion: "2.1.0",
      lo: "101a: High-quality heading",
    });
    expect(manifest.entries[0].images).toHaveLength(16);
    expect(
      manifest.entries[0].images.every(
        (image: { sha256: string }) => image.sha256.length === 64,
      ),
    ).toBe(true);
  });

  it("builds an inspection-only inventory when checked captures are not all eligible", async () => {
    const root = await makeRoot();
    await writeFile(
      path.join(root, "lane-1.md"),
      "- [x] 101a\n- [x] 101b\n- [ ] 101c\n",
    );
    await makeCapture(root, "20260720T000000Z-101a", "101a", "2.0.9", "2026-07-20T00:00:00Z");
    await makeCapture(root, "20260720T000000Z-101b", "101b", "2.0.8", "2026-07-20T00:00:00Z");

    const manifest = await buildDrFrostImportManifest({
      captureRoot: path.join(root, "captures"),
      registerFiles: [path.join(root, "lane-1.md")],
      expectedTotal: 3,
      requireAllChecked: false,
      targetProjectRef: "project-ref",
      ownerEmail: "grayglew@gmail.com",
    });

    expect(manifest).toMatchObject({
      inventoryMode: "inspection-only",
      register: {
        expectedTotal: 3,
        checked: 2,
        unchecked: 1,
        eligibleChecked: 1,
      },
      omissions: [
        {
          code: "101b",
          reason: "no-valid-helper-2.0.9+-capture",
        },
      ],
    });
    expect(manifest.entries.map((entry: { code: string }) => entry.code)).toEqual(["101a"]);
  });

  it("builds a partial-final manifest with the exact eligible and excluded scope", async () => {
    const root = await makeRoot();
    await writeFile(
      path.join(root, "lane-1.md"),
      "- [x] 101a\n- [x] 101b\n- [ ] 101c\n",
    );
    await makeCapture(root, "20260720T000000Z-101a", "101a", "2.0.9", "2026-07-20T00:00:00Z");
    await makeCapture(root, "20260720T000000Z-101b", "101b", "2.0.8", "2026-07-20T00:00:00Z");

    const manifest = await buildDrFrostImportManifest({
      captureRoot: path.join(root, "captures"),
      registerFiles: [path.join(root, "lane-1.md")],
      expectedTotal: 3,
      requireAllChecked: false,
      partialFinal: true,
      targetProjectRef: "project-ref",
      ownerEmail: "grayglew@gmail.com",
    });

    expect(manifest).toMatchObject({
      inventoryMode: "partial-final",
      register: {
        expectedTotal: 3,
        checked: 2,
        unchecked: 1,
        eligibleChecked: 1,
      },
      omissions: [
        {
          code: "101b",
          reason: "no-valid-helper-2.0.9+-capture",
        },
      ],
      exclusions: [
        {
          code: "101b",
          reason: "no-valid-helper-2.0.9+-capture",
        },
        {
          code: "101c",
          reason: "unchecked-register-item",
        },
      ],
    });
    expect(manifest.entries.map((entry: { code: string }) => entry.code)).toEqual(["101a"]);
  });
});

describe("Doctor Frost apply approval gate", () => {
  it("loads an existing checkpoint and treats a missing path as a fresh run", async () => {
    const root = await makeRoot();
    const checkpointPath = path.join(root, "checkpoint.json");
    const checkpoint = { runId: "run-1", entries: [{ code: "101a" }] };
    await writeFile(checkpointPath, JSON.stringify(checkpoint));

    await expect(loadImportCheckpoint(checkpointPath)).resolves.toEqual(checkpoint);
    await expect(loadImportCheckpoint(path.join(root, "missing.json"))).resolves.toBeNull();
  });

  it("does not construct an upload adapter when approval is absent or mismatched", async () => {
    const manifest = sampleManifest();
    const manifestHash = hashImportManifest(manifest);
    const createAdapter = vi.fn();

    await expect(
      applyApprovedImport({ manifest, manifestHash, approval: null, createAdapter }),
    ).rejects.toThrow(/approval/i);
    await expect(
      applyApprovedImport({
        manifest,
        manifestHash,
        approval: {
          approved: true,
          targetProjectRef: "wrong-project",
          ownerEmail: manifest.ownerEmail,
          manifestHash,
          runId: manifest.runId,
          approvedAt: "2026-07-22T00:00:00Z",
        },
        createAdapter,
      }),
    ).rejects.toThrow(/target project/i);

    expect(createAdapter).not.toHaveBeenCalled();
  });

  it("overrides canonical content while preserving the existing LO identity", async () => {
    const manifest = sampleManifest();
    const manifestHash = hashImportManifest(manifest);
    const adapter = {
      resolveOwnerId: vi.fn().mockResolvedValue("owner-id"),
      findActiveLo: vi.fn().mockResolvedValue({
        id: "existing-lo-id",
        lo_text: "101a: Older wording",
      }),
      uploadImmutableImage: vi.fn(async (image: { role: string; seenCount: number }) => ({
        assetId: `asset-${image.role}-${image.seenCount}`,
        ...image,
      })),
      replaceCanonicalContent: vi.fn().mockResolvedValue(undefined),
    };
    const createAdapter = vi.fn().mockResolvedValue(adapter);

    const report = await applyApprovedImport({
      manifest,
      manifestHash,
      approval: {
        approved: true,
        targetProjectRef: manifest.targetProjectRef,
        ownerEmail: manifest.ownerEmail,
        manifestHash,
        runId: manifest.runId,
        approvedAt: "2026-07-22T00:00:00Z",
      },
      createAdapter,
    });

    expect(adapter.replaceCanonicalContent).toHaveBeenCalledWith(
      expect.objectContaining({
        retrievalLoId: "existing-lo-id",
        lo: "101a: New wording",
      }),
    );
    expect(adapter.uploadImmutableImage).toHaveBeenCalledTimes(16);
    expect(report.replaced).toBe(1);
  });

  it("rejects an inspection-only manifest before constructing an upload adapter", async () => {
    const manifest = {
      ...sampleManifest(),
      inventoryMode: "inspection-only",
      register: { expectedTotal: 2, checked: 1, unchecked: 1, eligibleChecked: 1 },
      omissions: [],
    };
    const manifestHash = hashImportManifest(manifest);
    const createAdapter = vi.fn();

    await expect(
      applyApprovedImport({
        manifest,
        manifestHash,
        approval: {
          approved: true,
          targetProjectRef: manifest.targetProjectRef,
          ownerEmail: manifest.ownerEmail,
          manifestHash,
          runId: manifest.runId,
          approvedAt: "2026-07-22T00:00:00Z",
        },
        createAdapter,
      }),
    ).rejects.toThrow(/inspection|incomplete/i);

    expect(createAdapter).not.toHaveBeenCalled();
  });

  it("requires an explicit exact-scope acknowledgement for a partial-final manifest", async () => {
    const manifest = samplePartialManifest();
    const manifestHash = hashImportManifest(manifest);
    const createAdapter = vi.fn();

    await expect(
      applyApprovedImport({
        manifest,
        manifestHash,
        approval: approvalFor(manifest, manifestHash),
        createAdapter,
      }),
    ).rejects.toThrow(/partial/i);

    expect(createAdapter).not.toHaveBeenCalled();
  });

  it("accepts a partial-final manifest only with matching included and excluded counts", async () => {
    const manifest = samplePartialManifest();
    const manifestHash = hashImportManifest(manifest);
    const adapter = {
      resolveOwnerId: vi.fn().mockResolvedValue("owner-id"),
      findActiveLo: vi.fn().mockResolvedValue({
        id: "existing-lo-id",
        lo_text: "101a: Older wording",
      }),
      uploadImmutableImage: vi.fn(async (image: { role: string; seenCount: number }) => ({
        assetId: `asset-${image.role}-${image.seenCount}`,
        ...image,
      })),
      replaceCanonicalContent: vi.fn().mockResolvedValue(undefined),
    };
    const createAdapter = vi.fn().mockResolvedValue(adapter);

    const report = await applyApprovedImport({
      manifest,
      manifestHash,
      approval: {
        ...approvalFor(manifest, manifestHash),
        allowPartial: true,
        inventoryMode: "partial-final",
        approvedEntryCount: 1,
        excludedEntryCount: 1,
      },
      createAdapter,
    });

    expect(createAdapter).toHaveBeenCalledTimes(1);
    expect(adapter.uploadImmutableImage).toHaveBeenCalledTimes(16);
    expect(report.replaced).toBe(1);
  });

  it("uses bounded image-upload concurrency without exceeding the requested limit", async () => {
    const manifest = sampleManifest();
    const manifestHash = hashImportManifest(manifest);
    let activeUploads = 0;
    let maximumActiveUploads = 0;
    const adapter = {
      resolveOwnerId: vi.fn().mockResolvedValue("owner-id"),
      findActiveLo: vi.fn().mockResolvedValue({ id: "existing-lo-id" }),
      uploadImmutableImage: vi.fn(async (image: { role: string; seenCount: number }) => {
        activeUploads += 1;
        maximumActiveUploads = Math.max(maximumActiveUploads, activeUploads);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeUploads -= 1;
        return { assetId: `asset-${image.role}-${image.seenCount}`, ...image };
      }),
      replaceCanonicalContent: vi.fn().mockResolvedValue(undefined),
    };

    await applyApprovedImport({
      manifest,
      manifestHash,
      approval: approvalFor(manifest, manifestHash),
      createAdapter: vi.fn().mockResolvedValue(adapter),
      uploadConcurrency: 4,
    });

    expect(maximumActiveUploads).toBe(4);
    expect(adapter.uploadImmutableImage).toHaveBeenCalledTimes(16);
  });

  it("resumes an incomplete created LO without reclassifying it as replaced", async () => {
    const manifest = sampleManifest();
    const manifestHash = hashImportManifest(manifest);
    const createdLo = { id: "created-lo-id", lo_text: manifest.entries[0].lo };
    const adapter = {
      resolveOwnerId: vi.fn().mockResolvedValue("owner-id"),
      findActiveLo: vi.fn().mockResolvedValue(createdLo),
      createActiveLo: vi.fn(),
      snapshotCanonicalContent: vi.fn(),
      uploadImmutableImage: vi.fn(async (image: { role: string; seenCount: number }) => ({
        assetId: `asset-${image.role}-${image.seenCount}`,
        storagePath: `retrieval/${image.role}-${image.seenCount}.png`,
        ...image,
      })),
      replaceCanonicalContent: vi.fn().mockResolvedValue(undefined),
    };

    const report = await applyApprovedImport({
      manifest,
      manifestHash,
      approval: approvalFor(manifest, manifestHash),
      createAdapter: vi.fn().mockResolvedValue(adapter),
      resumeReport: {
        schemaVersion: "drfrost-import-report/v1",
        runId: manifest.runId,
        manifestHash,
        targetProjectRef: manifest.targetProjectRef,
        ownerEmail: manifest.ownerEmail,
        startedAt: "2026-07-22T01:00:00Z",
        completedAt: null,
        created: 0,
        replaced: 0,
        entries: [
          {
            code: manifest.entries[0].code,
            retrievalLoId: createdLo.id,
            action: "created",
            status: "uploading",
            previous: null,
            newLo: manifest.entries[0].lo,
            uploadedImages: [],
          },
        ],
      },
    });

    expect(adapter.createActiveLo).not.toHaveBeenCalled();
    expect(adapter.snapshotCanonicalContent).not.toHaveBeenCalled();
    expect(report.entries[0]).toMatchObject({
      code: manifest.entries[0].code,
      retrievalLoId: createdLo.id,
      action: "created",
      status: "complete",
    });
    expect(report.created).toBe(1);
    expect(report.replaced).toBe(0);
  });

  it("rejects a mismatched checkpoint before constructing an upload adapter", async () => {
    const manifest = sampleManifest();
    const manifestHash = hashImportManifest(manifest);
    const createAdapter = vi.fn();

    await expect(
      applyApprovedImport({
        manifest,
        manifestHash,
        approval: approvalFor(manifest, manifestHash),
        createAdapter,
        resumeReport: {
          schemaVersion: "drfrost-import-report/v1",
          runId: "different-run",
          manifestHash,
          targetProjectRef: manifest.targetProjectRef,
          ownerEmail: manifest.ownerEmail,
          startedAt: "2026-07-22T01:00:00Z",
          completedAt: null,
          created: 0,
          replaced: 0,
          entries: [],
        },
      }),
    ).rejects.toThrow(/checkpoint.*manifest/i);

    expect(createAdapter).not.toHaveBeenCalled();
  });
});

async function makeRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "drfrost-import-"));
  temporaryRoots.push(root);
  await mkdir(path.join(root, "captures"));
  return root;
}

async function makeCapture(
  root: string,
  directoryName: string,
  code: string,
  helperVersion: string,
  completedAt: string,
) {
  const directory = path.join(root, "captures", directoryName);
  await mkdir(directory);
  const items = Array.from({ length: 8 }, (_, index) => ({
    index: index + 1,
    question_file: `${String(index + 1).padStart(2, "0")}-question.png`,
    feedback_file: `${String(index + 1).padStart(2, "0")}-feedback.png`,
  }));
  await writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify({
      schema_version: "drfrost-example-batch/v1",
      status: "complete",
      requested_code: code,
      skill_heading: `${code}: High-quality heading`,
      helper_version: helperVersion,
      target_examples: 8,
      completed_examples: 8,
      completed_at: completedAt,
      items,
    }),
  );
  await writeFile(
    path.join(directory, "records.jsonl"),
    Array.from({ length: 8 }, (_, index) => JSON.stringify({ index: index + 1 })).join("\n") + "\n",
  );
  await writeFile(path.join(directory, "batch.complete"), `${code}\n`);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  await Promise.all(
    items.flatMap((item) => [
      writeFile(path.join(directory, item.question_file), png),
      writeFile(path.join(directory, item.feedback_file), png),
    ]),
  );
}

function sampleManifest() {
  return {
    schemaVersion: "drfrost-import-manifest/v1",
    inventoryMode: "final",
    runId: "run-1",
    createdAt: "2026-07-22T00:00:00Z",
    targetProjectRef: "project-ref",
    ownerEmail: "grayglew@gmail.com",
    register: { expectedTotal: 1, checked: 1, unchecked: 0, eligibleChecked: 1 },
    omissions: [],
    entries: [
      {
        code: "101a",
        lo: "101a: New wording",
        helperVersion: "2.0.9",
        captureDirectory: "C:/captures/101a",
        completedAt: "2026-07-22T00:00:00Z",
        images: Array.from({ length: 16 }, (_, index) => ({
          role: index < 8 ? "question" : "answer",
          seenCount: (index % 8) + 1,
          filePath: `C:/captures/101a/${index}.png`,
          byteSize: 11,
          sha256: String(index).padStart(64, "0"),
        })),
      },
    ],
  };
}

function samplePartialManifest() {
  return {
    ...sampleManifest(),
    inventoryMode: "partial-final",
    register: { expectedTotal: 2, checked: 1, unchecked: 1, eligibleChecked: 1 },
    exclusions: [{ code: "101b", reason: "unchecked-register-item" }],
  };
}

function approvalFor(manifest: ReturnType<typeof sampleManifest>, manifestHash: string) {
  return {
    approved: true,
    targetProjectRef: manifest.targetProjectRef,
    ownerEmail: manifest.ownerEmail,
    manifestHash,
    runId: manifest.runId,
    approvedAt: "2026-07-22T00:00:00Z",
  };
}
