import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DOWNLOAD_CONCURRENCY = 8;

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function safeBackupPath(root, storagePath) {
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(root, ...String(storagePath).split("/"));
  if (!resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Unsafe Storage path: ${storagePath}`);
  }
  return resolvedFile;
}

async function mapLimit(items, concurrency, worker) {
  let cursor = 0;
  const results = new Array(items.length);
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, run),
  );
  return results;
}

export async function downloadStorageBackup(
  manifest,
  backupRoot,
  fetcher = fetch,
) {
  if (
    manifest?.backupKind !== "lesson-builder-storage-manifest" ||
    manifest?.schemaVersion !== 1 ||
    manifest?.bucket !== "lesson-assets" ||
    !Array.isArray(manifest?.objects) ||
    manifest.objectCount !== manifest.objects.length
  ) {
    throw new Error("The Storage backup manifest is invalid or incomplete.");
  }

  const storageRoot = path.join(
    path.resolve(backupRoot),
    "storage",
    manifest.bucket,
  );
  let completed = 0;
  const index = await mapLimit(
    manifest.objects,
    DOWNLOAD_CONCURRENCY,
    async (object) => {
      const outputPath = safeBackupPath(storageRoot, object.path);
      let buffer;
      try {
        const existing = await stat(outputPath);
        if (
          existing.isFile() &&
          (!object.reportedSize || existing.size === object.reportedSize)
        ) {
          buffer = await readFile(outputPath);
        }
      } catch {
        // Missing or partial files are downloaded below.
      }

      if (!buffer) {
        const response = await fetcher(object.signedUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(
            `Could not download ${object.path} (${response.status}).`,
          );
        }
        buffer = Buffer.from(await response.arrayBuffer());
        if (object.reportedSize && buffer.byteLength !== object.reportedSize) {
          throw new Error(
            `Storage size mismatch for ${object.path}: expected ${object.reportedSize}, received ${buffer.byteLength}.`,
          );
        }
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, buffer);
      }

      completed += 1;
      if (completed % 100 === 0 || completed === manifest.objects.length) {
        console.log(`Backed up Storage ${completed}/${manifest.objects.length}`);
      }
      return {
        path: object.path,
        contentType: object.contentType || "application/octet-stream",
        reportedSize: Number(object.reportedSize || 0),
        bytes: buffer.byteLength,
        sha256: sha256(buffer),
      };
    },
  );

  const result = {
    completedAt: new Date().toISOString(),
    bucket: manifest.bucket,
    objectCount: index.length,
    totalBytes: index.reduce((total, object) => total + object.bytes, 0),
    index,
  };
  await mkdir(path.resolve(backupRoot), { recursive: true });
  await writeFile(
    path.join(path.resolve(backupRoot), "storage-index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(path.resolve(backupRoot), "storage-download.json"),
    `${JSON.stringify({ ...result, index: "storage-index.json" }, null, 2)}\n`,
    "utf8",
  );
  return result;
}

function parseArguments(argv) {
  return Object.fromEntries(
    argv
      .filter((argument) => argument.startsWith("--") && argument.includes("="))
      .map((argument) => {
        const separator = argument.indexOf("=");
        return [argument.slice(2, separator), argument.slice(separator + 1)];
      }),
  );
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (!args.manifest || !args["backup-dir"]) {
    throw new Error(
      "Usage: node scripts/download-storage-backup.mjs --manifest=<file> --backup-dir=<dir>",
    );
  }
  const manifest = JSON.parse(await readFile(args.manifest, "utf8"));
  const result = await downloadStorageBackup(manifest, args["backup-dir"]);
  console.log(
    `Storage backup complete: ${result.objectCount} objects, ${result.totalBytes} bytes.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
