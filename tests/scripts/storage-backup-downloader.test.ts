import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const downloaderModule = "../../scripts/download-storage-backup.mjs";
const temporaryFolders: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryFolders.splice(0).map((folder) =>
      rm(folder, { recursive: true, force: true }),
    ),
  );
});

describe("Storage backup downloader", () => {
  it("downloads every signed object and records its size and checksum", async () => {
    const root = await mkdtemp(join(tmpdir(), "lesson-storage-backup-"));
    temporaryFolders.push(root);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }),
    );
    const { downloadStorageBackup } = await import(
      /* @vite-ignore */ downloaderModule
    );

    const result = await downloadStorageBackup(
      {
        backupKind: "lesson-builder-storage-manifest",
        schemaVersion: 1,
        bucket: "lesson-assets",
        objectCount: 1,
        objects: [
          {
            path: "owner-id/retrieval/question.png",
            contentType: "image/png",
            reportedSize: 4,
            signedUrl: "https://storage.test/question",
          },
        ],
      },
      root,
    );

    expect(
      new Uint8Array(
        await readFile(
          join(
            root,
            "storage",
            "lesson-assets",
            "owner-id",
            "retrieval",
            "question.png",
          ),
        ),
      ),
    ).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(result).toEqual(
      expect.objectContaining({
        objectCount: 1,
        totalBytes: 4,
        index: [
          expect.objectContaining({
            path: "owner-id/retrieval/question.png",
            bytes: 4,
            sha256:
              "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
          }),
        ],
      }),
    );
  });
});
