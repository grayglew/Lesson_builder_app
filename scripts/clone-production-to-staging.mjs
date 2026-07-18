import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const TABLES = [
  "classes",
  "retrieval_items",
  "retrieval_los",
  "lessons",
  "builder_lessons",
  "builder_state_sync",
  "slide_templates",
  "lesson_versions",
  "assets",
  "retrieval_images",
  "retrieval_lo_images",
  "retrieval_class_progress",
  "retrieval_shared_migration_audit",
];

const SOURCE_REF = "fjrukfawhmbdmrztznlf";
const TARGET_REF = "sbtzyrakbbymahfmdfth";
const STORAGE_BUCKET = "lesson-assets";
const PAGE_SIZE = 500;
const INSERT_BATCH_SIZE = 100;
const STORAGE_CONCURRENCY = 8;
const TARGET_OMITTED_COLUMNS = {
  retrieval_images: new Set(["updated_at"]),
};

function parseArguments(argv) {
  const args = {};
  for (const value of argv) {
    if (!value.startsWith("--")) continue;
    const separator = value.indexOf("=");
    if (separator === -1) {
      args[value.slice(2)] = true;
    } else {
      args[value.slice(2, separator)] = value.slice(separator + 1);
    }
  }
  return args;
}

function parseEnvFile(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function loadEnvironment(filename) {
  const values = parseEnvFile(await readFile(filename, "utf8"));
  const url = String(values.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = String(values.SUPABASE_SERVICE_ROLE_KEY || values.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !key) {
    throw new Error(`${filename} does not contain a Supabase URL and server-side secret key.`);
  }
  return { url, key };
}

function projectRef(url) {
  const hostname = new URL(url).hostname;
  return hostname.split(".")[0] || "";
}

function createAdminClient(environment) {
  return createClient(environment.url, environment.key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function withRetry(label, operation, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await operation();
      if (result?.error) throw result.error;
      return result;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      console.warn(`${label} failed (attempt ${attempt}/${attempts}); retrying in ${delay} ms.`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function replaceOwner(value, sourceOwnerId, targetOwnerId) {
  if (typeof value === "string") {
    return value.split(sourceOwnerId).join(targetOwnerId);
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceOwner(item, sourceOwnerId, targetOwnerId));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceOwner(item, sourceOwnerId, targetOwnerId),
      ]),
    );
  }
  return value;
}

async function matchingAdminUsers(source, target) {
  const select = "id,email,role,status";
  const [sourceResult, targetResult] = await Promise.all([
    source.from("app_users").select(select).eq("role", "admin").eq("status", "active"),
    target.from("app_users").select(select).eq("role", "admin").eq("status", "active"),
  ]);
  if (sourceResult.error) throw sourceResult.error;
  if (targetResult.error) throw targetResult.error;

  const sourceByEmail = new Map(
    (sourceResult.data || []).map((user) => [String(user.email || "").trim().toLowerCase(), user]),
  );
  const matches = (targetResult.data || [])
    .map((targetUser) => {
      const email = String(targetUser.email || "").trim().toLowerCase();
      return { source: sourceByEmail.get(email), target: targetUser };
    })
    .filter((match) => match.source);

  if (matches.length !== 1) {
    throw new Error(`Expected one matching active admin account, found ${matches.length}.`);
  }
  return matches[0];
}

async function fetchOwnedRows(client, table, ownerId) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .eq("owner_id", ownerId)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not export ${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function listStorageObjects(client, prefix) {
  const queue = [prefix];
  const objects = [];

  while (queue.length > 0) {
    const folder = queue.shift();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await withRetry(`List ${folder}`, () => {
        return client.storage.from(STORAGE_BUCKET).list(folder, {
          limit: 1000,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
      });
      if (error) throw new Error(`Could not list storage folder ${folder}: ${error.message}`);

      for (const entry of data || []) {
        const fullPath = `${folder}/${entry.name}`;
        if (entry.id) {
          objects.push({
            path: fullPath,
            contentType: String(entry.metadata?.mimetype || "application/octet-stream"),
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

function safeBackupPath(root, storagePath) {
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(root, ...storagePath.split("/"));
  if (!resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Unsafe storage path: ${storagePath}`);
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
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function exportStorage(client, objects, backupRoot) {
  let completed = 0;
  let totalBytes = 0;
  const storageRoot = path.join(backupRoot, "storage", STORAGE_BUCKET);

  const index = await mapLimit(objects, STORAGE_CONCURRENCY, async (object) => {
    const outputPath = safeBackupPath(storageRoot, object.path);
    let buffer;
    try {
      const existing = await readFile(outputPath);
      if (!object.reportedSize || existing.byteLength === object.reportedSize) {
        buffer = existing;
      }
    } catch {
      // A missing or partial file is downloaded below.
    }

    if (!buffer) {
      const { data, error } = await withRetry(`Download ${object.path}`, () => {
        return client.storage.from(STORAGE_BUCKET).download(object.path);
      });
      if (error || !data) {
        throw new Error(`Could not download ${object.path}: ${error?.message || "empty response"}`);
      }
      buffer = Buffer.from(await data.arrayBuffer());
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, buffer);
    }

    const record = {
      ...object,
      bytes: buffer.byteLength,
      sha256: sha256(buffer),
    };
    completed += 1;
    totalBytes += buffer.byteLength;
    if (completed % 100 === 0 || completed === objects.length) {
      console.log(`Backed up storage ${completed}/${objects.length}`);
    }
    return record;
  });

  return { index, totalBytes };
}

async function removeTargetRows(client, targetOwnerId) {
  for (const table of [...TABLES].reverse()) {
    const { error } = await client.from(table).delete().eq("owner_id", targetOwnerId);
    if (error) throw new Error(`Could not clear staging table ${table}: ${error.message}`);
  }
}

async function removeTargetStorage(client, targetOwnerId) {
  const objects = await listStorageObjects(client, targetOwnerId);
  for (let offset = 0; offset < objects.length; offset += 100) {
    const paths = objects.slice(offset, offset + 100).map((object) => object.path);
    const { error } = await client.storage.from(STORAGE_BUCKET).remove(paths);
    if (error) throw new Error(`Could not clear staging storage: ${error.message}`);
  }
}

async function uploadStorage(client, storageIndex, backupRoot, sourceOwnerId, targetOwnerId) {
  let completed = 0;
  const storageRoot = path.join(backupRoot, "storage", STORAGE_BUCKET);
  await mapLimit(storageIndex, STORAGE_CONCURRENCY, async (object) => {
    const inputPath = safeBackupPath(storageRoot, object.path);
    const buffer = await readFile(inputPath);
    if (buffer.byteLength !== object.bytes || sha256(buffer) !== object.sha256) {
      throw new Error(`Backup integrity check failed for ${object.path}.`);
    }
    const targetPath = replaceOwner(object.path, sourceOwnerId, targetOwnerId);
    const { error } = await withRetry(`Upload ${targetPath}`, () => {
      return client.storage.from(STORAGE_BUCKET).upload(targetPath, buffer, {
        cacheControl: "3600",
        contentType: object.contentType,
        upsert: true,
      });
    });
    if (error) throw new Error(`Could not upload ${targetPath}: ${error.message}`);
    completed += 1;
    if (completed % 100 === 0 || completed === storageIndex.length) {
      console.log(`Copied storage ${completed}/${storageIndex.length}`);
    }
  });
}

async function insertRows(client, table, rows, sourceOwnerId, targetOwnerId) {
  const omittedColumns = TARGET_OMITTED_COLUMNS[table] || new Set();
  const remapped = rows.map((row) => {
    const compatibleRow = Object.fromEntries(
      Object.entries(row).filter(([column]) => !omittedColumns.has(column)),
    );
    return replaceOwner(compatibleRow, sourceOwnerId, targetOwnerId);
  });
  for (let offset = 0; offset < remapped.length; offset += INSERT_BATCH_SIZE) {
    const batch = remapped.slice(offset, offset + INSERT_BATCH_SIZE);
    const { error } = await client.from(table).insert(batch);
    if (error) throw new Error(`Could not import ${table}: ${error.message}`);
  }
}

async function countOwnedRows(client, ownerId) {
  const counts = {};
  for (const table of TABLES) {
    const { count, error } = await client
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("owner_id", ownerId);
    if (error) throw new Error(`Could not verify ${table}: ${error.message}`);
    counts[table] = count || 0;
  }
  return counts;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const sourceEnvFile = String(args["source-env"] || "");
  const targetEnvFile = String(args["target-env"] || "");
  const backupRoot = path.resolve(String(args["backup-dir"] || ""));
  if (!sourceEnvFile || !targetEnvFile || !args["backup-dir"]) {
    throw new Error(
      "Usage: node scripts/clone-production-to-staging.mjs --source-env=<file> --target-env=<file> --backup-dir=<dir> [--apply]",
    );
  }

  const [sourceEnvironment, targetEnvironment] = await Promise.all([
    loadEnvironment(sourceEnvFile),
    loadEnvironment(targetEnvFile),
  ]);
  const sourceRef = projectRef(sourceEnvironment.url);
  const targetRef = projectRef(targetEnvironment.url);
  if (sourceRef !== SOURCE_REF || targetRef !== TARGET_REF || sourceRef === targetRef) {
    throw new Error(`Refusing unsafe project mapping ${sourceRef} -> ${targetRef}.`);
  }

  const source = createAdminClient(sourceEnvironment);
  const target = createAdminClient(targetEnvironment);
  const users = await matchingAdminUsers(source, target);
  const sourceOwnerId = users.source.id;
  const targetOwnerId = users.target.id;
  let tables;
  let storage;
  let manifest;

  if (args["restore-only"]) {
    manifest = JSON.parse(await readFile(path.join(backupRoot, "manifest.json"), "utf8"));
    if (
      !manifest.completed ||
      manifest.sourceProjectRef !== sourceRef ||
      manifest.targetProjectRef !== targetRef ||
      manifest.sourceOwnerId !== sourceOwnerId ||
      manifest.targetOwnerId !== targetOwnerId
    ) {
      throw new Error("The existing backup manifest does not match the guarded project mapping.");
    }
    tables = {};
    for (const table of TABLES) {
      tables[table] = JSON.parse(
        await readFile(path.join(backupRoot, "tables", `${table}.json`), "utf8"),
      );
    }
    storage = {
      index: JSON.parse(await readFile(path.join(backupRoot, "storage-index.json"), "utf8")),
      totalBytes: manifest.storage.totalBytes,
    };
    console.log(`Loaded completed backup from ${backupRoot}`);
  } else {
    tables = {};
    await mkdir(path.join(backupRoot, "tables"), { recursive: true });
    for (const table of TABLES) {
      const rows = await fetchOwnedRows(source, table, sourceOwnerId);
      tables[table] = rows;
      await writeFile(
        path.join(backupRoot, "tables", `${table}.json`),
        `${JSON.stringify(rows, null, 2)}\n`,
        "utf8",
      );
      console.log(`Backed up ${table}: ${rows.length} rows`);
    }

    const storageObjects = await listStorageObjects(source, sourceOwnerId);
    storage = await exportStorage(source, storageObjects, backupRoot);
    await writeFile(
      path.join(backupRoot, "storage-index.json"),
      `${JSON.stringify(storage.index, null, 2)}\n`,
      "utf8",
    );

    manifest = {
      createdAt: new Date().toISOString(),
      completed: true,
      sourceProjectRef: sourceRef,
      targetProjectRef: targetRef,
      sourceOwnerId,
      targetOwnerId,
      excluded: [
        "auth users and credentials",
        "app_users",
        "admin audit and impersonation records",
        "live presentation sessions",
        "data owned by non-matching users",
      ],
      tableCounts: Object.fromEntries(TABLES.map((table) => [table, tables[table].length])),
      storage: {
        bucket: STORAGE_BUCKET,
        objectCount: storage.index.length,
        totalBytes: storage.totalBytes,
        sha256Index: "storage-index.json",
      },
    };
    await writeFile(
      path.join(backupRoot, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    console.log(`Backup complete at ${backupRoot}`);
  }

  if (!args.apply) {
    console.log("Backup-only run complete. Pass --apply to replace the staging snapshot.");
    return;
  }

  let targetStorage = await listStorageObjects(target, targetOwnerId);
  if (args["reuse-target-storage"]) {
    const expectedPaths = new Set(
      storage.index.map((object) => replaceOwner(object.path, sourceOwnerId, targetOwnerId)),
    );
    const actualPaths = new Set(targetStorage.map((object) => object.path));
    if (
      expectedPaths.size !== actualPaths.size ||
      [...expectedPaths].some((storagePath) => !actualPaths.has(storagePath))
    ) {
      throw new Error("Existing staging Storage does not exactly match the completed backup.");
    }
    console.log(`Reusing ${targetStorage.length} verified staging Storage paths`);
  }

  await removeTargetRows(target, targetOwnerId);
  if (!args["reuse-target-storage"]) {
    await removeTargetStorage(target, targetOwnerId);
    await uploadStorage(
      target,
      storage.index,
      backupRoot,
      sourceOwnerId,
      targetOwnerId,
    );
  }
  for (const table of TABLES) {
    await insertRows(target, table, tables[table], sourceOwnerId, targetOwnerId);
    console.log(`Copied ${table}: ${tables[table].length} rows`);
  }

  const targetCounts = await countOwnedRows(target, targetOwnerId);
  for (const table of TABLES) {
    if (targetCounts[table] !== tables[table].length) {
      throw new Error(
        `Verification failed for ${table}: expected ${tables[table].length}, found ${targetCounts[table]}.`,
      );
    }
  }
  targetStorage = await listStorageObjects(target, targetOwnerId);
  if (targetStorage.length !== storage.index.length) {
    throw new Error(
      `Storage verification failed: expected ${storage.index.length}, found ${targetStorage.length}.`,
    );
  }

  const verified = {
    ...manifest,
    appliedAt: new Date().toISOString(),
    targetTableCounts: targetCounts,
    targetStorageObjectCount: targetStorage.length,
    verified: true,
  };
  await writeFile(
    path.join(backupRoot, "manifest.json"),
    `${JSON.stringify(verified, null, 2)}\n`,
    "utf8",
  );
  console.log("Staging clone verified successfully.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
