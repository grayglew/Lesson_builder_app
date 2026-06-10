import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const data = readFileSync(resolve(root, "src", "lib", "builder-global", "data.ts"), "utf8");
const live = readFileSync(resolve(root, "src", "lib", "builder-sync", "live-retrieval.ts"), "utf8");
const storageReport = readFileSync(resolve(root, "src", "app", "api", "admin", "storage-report", "route.ts"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Expected ${name}() to exist.`);
  let depth = 0;
  let seenBody = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
      seenBody = true;
    } else if (char === "}") {
      depth -= 1;
      if (seenBody && depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Could not extract ${name}().`);
}

for (const name of [
  "retrieval_los",
  "retrieval_class_progress",
  "retrieval_lo_images",
]) {
  assert(data.includes(`"${name}"`), `Builder global helper should use ${name}.`);
  assert(live.includes(`"${name}"`), `Live retrieval helper should use ${name}.`);
}

const buildRetrievalItemsFromRows = extractFunction(data, "buildRetrievalItemsFromRows");
assert(
  buildRetrievalItemsFromRows.includes("contentId") &&
    buildRetrievalItemsFromRows.includes("loCode") &&
    buildRetrievalItemsFromRows.includes("trackingId") &&
    buildRetrievalItemsFromRows.includes("retrieval_lo_id"),
  "Bootstrap should return class-progress-shaped retrieval items with shared LO metadata.",
);

const saveRetrievalItemData = data.slice(data.indexOf("export async function saveRetrievalItemData"));
assert(
  saveRetrievalItemData.includes("upsertSharedRetrievalLo") &&
    saveRetrievalItemData.includes("upsertClassProgress") &&
    saveRetrievalItemData.includes("contentId"),
  "Saving an item should upsert shared LO content separately from class progress.",
);

assert(
  data.includes("resolveRetrievalLoForProgress") &&
    data.includes("loadRetrievalLoImages") &&
    data.includes("retrieval_lo_id"),
  "Image resolve/upload helpers should resolve class progress IDs to shared LO image rows.",
);

assert(
  live.includes("retrieval_class_progress") &&
    live.includes("retrieval_lo_images") &&
    live.includes("retrieval_lo:retrieval_los") &&
    !live.includes(".eq(\"class_name\", className)\n    .eq(\"lo_key\""),
  "Live retrieval should update class progress and load shared LO images, not legacy class-specific images.",
);

assert(
  storageReport.includes("retrieval-image") &&
    storageReport.includes("duplicateRetrievalImageChecksums") &&
    storageReport.includes("estimatedDuplicateRetrievalBytes"),
  "Storage report should count retrieval-image assets and duplicate checksums.",
);

console.log("Shared retrieval API regression checks passed.");
