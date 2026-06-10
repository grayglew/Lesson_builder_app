import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const appPath = resolve(process.cwd(), "public", "builder", "app.js");
const app = readFileSync(appPath, "utf8");

assert(
  app.includes("function mergeGlobalFieldsFromCloudState(targetState, cloudState)") &&
    app.includes("targetState.retrievalItems = Array.isArray(cloudState.retrievalItems) ? cloudState.retrievalItems : targetState.retrievalItems;"),
  "The cloud/local conflict path should merge the newer Supabase retrieval bank into the current lesson state.",
);

assert(
  app.includes("mergeGlobalFieldsFromCloudState(state, cloudState);") &&
    app.includes("Local lesson changes were kept"),
  "When local lesson changes are present, the warning path should keep lesson changes but refresh global retrieval data.",
);

console.log("Cloud conflict global merge regression checks passed.");
