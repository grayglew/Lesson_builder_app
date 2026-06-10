import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const routePath = resolve(root, "src", "app", "api", "admin", "cleanup-legacy-builder-state", "route.ts");
const helperPath = resolve(root, "src", "lib", "builder-sync", "legacy-cleanup.ts");
const pagePath = resolve(root, "src", "app", "admin", "cleanup-storage", "CleanupStorageClient.tsx");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(existsSync(routePath), "Legacy cleanup API route should exist.");
assert(existsSync(helperPath), "Legacy cleanup helper should exist.");
assert(existsSync(pagePath), "Legacy cleanup page should exist.");

const route = readFileSync(routePath, "utf8");
const helper = readFileSync(helperPath, "utf8");
const page = readFileSync(pagePath, "utf8");

assert(
  route.includes("getAuthorizedBuilderSyncClient()"),
  "Cleanup route must require the existing signed-in allow-listed user check."
);
assert(
  route.includes(".storage") && route.includes(".remove(summary.removable.map"),
  "Cleanup route must delete through the Supabase Storage API, not by deleting storage.objects rows."
);
assert(
  route.includes('const CONFIRMATION = "delete-older-legacy-builder-state";') &&
    route.includes("body.confirm !== CONFIRMATION"),
  "Cleanup route must require an explicit confirmation body before deleting files."
);
assert(
  helper.includes("legacyBuilderStateFolder(userId)") &&
    helper.includes('return `${userId}/builder-state`;') &&
    helper.includes('snapshot.name.endsWith(".json")'),
  "Cleanup helper should target only direct legacy JSON snapshots in the builder-state folder."
);
assert(
  helper.includes("LEGACY_BUILDER_STATE_RETAINED_SNAPSHOTS = 1") &&
    helper.includes(".slice(0, normalizedRetainedCount)") &&
    helper.includes(".slice(normalizedRetainedCount)"),
  "Cleanup helper should retain the newest legacy snapshot and mark only older files as removable."
);
assert(
  page.includes("Delete older legacy snapshots") && page.includes("saved lessons"),
  "Cleanup page should expose the cleanup clearly and explain that saved lessons are not deleted."
);

console.log("Legacy builder-state cleanup regression checks passed.");
