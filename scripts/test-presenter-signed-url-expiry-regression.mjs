import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const expiryPath = resolve(root, "src", "lib", "builder-sync", "signed-url-expiry.ts");
const savedLessonOpenRoute = readFileSync(resolve(root, "src", "app", "api", "builder-lessons", "open", "route.ts"), "utf8");
const builderGlobalData = readFileSync(resolve(root, "src", "lib", "builder-global", "data.ts"), "utf8");
const liveRetrieval = readFileSync(resolve(root, "src", "lib", "builder-sync", "live-retrieval.ts"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(existsSync(expiryPath), "Presenter signed URL expiry should live in a shared helper.");

const expirySource = readFileSync(expiryPath, "utf8");
assert(
  expirySource.includes("export const PRESENTER_SIGNED_URL_SECONDS = 8 * 60 * 60;"),
  "Presenter signed URLs should last exactly 8 hours.",
);

for (const [label, source] of [
  ["saved lesson open route", savedLessonOpenRoute],
  ["builder global retrieval data", builderGlobalData],
  ["live retrieval helper", liveRetrieval],
]) {
  assert(
    source.includes('PRESENTER_SIGNED_URL_SECONDS'),
    `${label} should use the shared 8-hour signed URL expiry constant.`,
  );
}

assert(
  !savedLessonOpenRoute.includes("createSignedUrl(String(row.storage_path || \"\"), 60 * 60") &&
    !builderGlobalData.includes("const SIGNED_URL_SECONDS = 60 * 60") &&
    !liveRetrieval.includes("createSignedUrls(uniquePaths, 60 * 60"),
  "Presenter-facing signed URLs should no longer use the old 1-hour expiry.",
);

console.log("Presenter signed URL expiry regression checks passed.");
