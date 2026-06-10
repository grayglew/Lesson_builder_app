import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_DOWNLOADS = "C:/Users/grayg/Downloads";
const FUNCTION_URL = "https://fjrukfawhmbdmrztznlf.functions.supabase.co/import-relational-retrieval-bank";
const OWNER_EMAIL = "grayglew@gmail.com";
const MAX_BATCH_BYTES = Number(process.env.IMPORT_BATCH_BYTES || 250_000);

const token = process.env.IMPORT_TOKEN;
if (!token) {
  throw new Error("Set IMPORT_TOKEN to the one-time import token before running this script.");
}

const backupPath = process.argv[2] || (await newestBackupPath(DEFAULT_DOWNLOADS));
const raw = await readFile(backupPath, "utf8");
const backup = JSON.parse(raw);
const builder = backup.lessonBuilder || backup;
const retrievalItems = Array.isArray(builder.retrievalItems) ? builder.retrievalItems : [];
const classNames = Array.isArray(builder.classNames) ? builder.classNames : [];
const slideTemplates = Array.isArray(builder.slideTemplates) ? builder.slideTemplates : [];

if (!retrievalItems.length) {
  throw new Error(`No retrievalItems were found in ${backupPath}`);
}

const expected = summarizeBackup(retrievalItems);
console.log(`Using backup: ${backupPath}`);
console.log(
  JSON.stringify(
    {
      exportedAt: backup.exportedAt || null,
      updatedAt: builder.updatedAt || null,
      retrievalItems: retrievalItems.length,
      classNames,
      questionImages: expected.questionImages,
      answerImages: expected.answerImages,
      classCounts: expected.classCounts,
    },
    null,
    2,
  ),
);

const sourceIds = retrievalItems.map((item) => sourceKeyForItem(item)).filter(Boolean);
const batches = createBatches(retrievalItems, MAX_BATCH_BYTES);

if (process.env.IMPORT_SKIP_START === "1") {
  console.log("Skipping start/checkpoint step because IMPORT_SKIP_START=1.");
} else {
  const start = await postImport({
    mode: "start",
    ownerEmail: OWNER_EMAIL,
    source: {
      backupPath,
      exportedAt: backup.exportedAt || null,
      updatedAt: builder.updatedAt || null,
    },
    classNames,
    slideTemplates,
    expected,
  });

  console.log(`Checkpoint saved: ${start.checkpointPath}`);
}

const startBatch = Math.max(0, Number(process.env.IMPORT_START_BATCH || 1) - 1);
let imported = batches.slice(0, startBatch).reduce((count, batch) => count + batch.length, 0);
for (let index = startBatch; index < batches.length; index += 1) {
  const batch = batches[index];
  const result = await postImport({
    mode: "batch",
    ownerEmail: OWNER_EMAIL,
    batchIndex: index,
    batchCount: batches.length,
    items: batch,
  });
  imported += result.savedItems || batch.length;
  console.log(
    `Batch ${index + 1}/${batches.length}: saved ${result.savedItems || batch.length} items, ` +
      `${result.uploadedImages || 0} images uploaded/reused (${imported}/${retrievalItems.length})`,
  );
}

const finish = await postImport({
  mode: "finish",
  ownerEmail: OWNER_EMAIL,
  sourceIds,
  expected,
});

console.log("Final database summary:");
console.log(JSON.stringify(finish.summary, null, 2));

async function postImport(payload) {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-import-token": token,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok || body.ok === false) {
    throw new Error(`Import request failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function newestBackupPath(folder) {
  const entries = await readdir(folder);
  const candidates = [];
  for (const name of entries) {
    if (!/\.lesson-builder-backup(?:\(\d+\))?\.json$/i.test(name)) continue;
    const fullPath = join(folder, name);
    const info = await stat(fullPath);
    candidates.push({ fullPath, mtimeMs: info.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!candidates.length) throw new Error(`No lesson-builder backup JSON files found in ${folder}`);
  return candidates[0].fullPath;
}

function createBatches(items, maxBytes) {
  const batches = [];
  let current = [];
  let currentBytes = 0;

  for (const item of items) {
    const itemBytes = Buffer.byteLength(JSON.stringify(item), "utf8");
    if (current.length && currentBytes + itemBytes > maxBytes) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(item);
    currentBytes += itemBytes;
  }

  if (current.length) batches.push(current);
  return batches;
}

function summarizeBackup(items) {
  const classCounts = {};
  let questionImages = 0;
  let answerImages = 0;

  for (const item of items) {
    const className = String(item.className || "").trim() || "(blank)";
    classCounts[className] = (classCounts[className] || 0) + 1;
    questionImages += countImages(item.images);
    answerImages += countImages(item.answerImages);
  }

  return {
    retrievalItems: items.length,
    questionImages,
    answerImages,
    classCounts,
  };
}

function countImages(images) {
  return Array.isArray(images) ? images.filter(Boolean).length : 0;
}

function sourceKeyForItem(item) {
  return String(item.legacyJsonId || item.id || "").trim();
}
