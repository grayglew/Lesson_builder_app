import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const routePath = resolve(root, "src", "app", "api", "admin", "storage-report", "route.ts");
const imageUploadRoutePath = resolve(root, "src", "app", "api", "builder-global", "image-upload-url", "route.ts");
const imageCompleteRoutePath = resolve(root, "src", "app", "api", "builder-global", "image-complete", "route.ts");
const cleanupClientPath = resolve(root, "src", "app", "admin", "cleanup-storage", "CleanupStorageClient.tsx");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");
const globalData = readFileSync(resolve(root, "src", "lib", "builder-global", "data.ts"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(existsSync(routePath), "Expected an admin storage-report API route.");
const reportRoute = readFileSync(routePath, "utf8");
assert(
  reportRoute.includes("builder_lessons") &&
    reportRoute.includes("legacyBuilderStateCleanupSummary") &&
    reportRoute.includes("unreferencedRetrievalAssets") &&
    reportRoute.includes("savedLessonBytes"),
  "Storage report should include saved lesson size, legacy snapshots, and unreferenced retrieval asset estimates.",
);

const cleanupClient = readFileSync(cleanupClientPath, "utf8");
assert(
  cleanupClient.includes("/api/admin/storage-report") &&
    cleanupClient.includes("Unreferenced retrieval images") &&
    cleanupClient.includes("Saved lessons"),
  "Storage cleanup page should expose the storage report in the admin UI.",
);

assert(
  appJs.includes("sha256Blob(") &&
    appJs.includes("checksum: image.checksum") &&
    appJs.includes("upload.reusedImage"),
  "Builder image upload flow should compute checksums and handle reused retrieval image assets.",
);

assert(
  globalData.includes("checksum?: string") &&
    globalData.includes("findReusableImageAsset") &&
    globalData.includes("reusedImage") &&
    globalData.includes("checksum: input.checksum"),
  "Builder global data helpers should support checksum-based retrieval image reuse.",
);

const imageUploadRoute = readFileSync(imageUploadRoutePath, "utf8");
const imageCompleteRoute = readFileSync(imageCompleteRoutePath, "utf8");
assert(
  imageUploadRoute.includes("checksum") &&
    imageUploadRoute.includes("reusedImage") &&
    imageCompleteRoute.includes("checksum"),
  "Retrieval image upload and complete routes should carry image checksums.",
);

console.log("Storage capacity report regression checks passed.");
