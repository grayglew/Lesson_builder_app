import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const helperPath = resolve(root, "src", "lib", "builder-global", "data.ts");
const helper = readFileSync(helperPath, "utf8");

assert(
  helper.includes("allowEmptyRetrievalBank?: boolean"),
  "Builder global payload should require an explicit flag before an empty bank can replace existing retrieval rows.",
);

assert(
  helper.includes("if (inputItems.length || payload.allowEmptyRetrievalBank === true)") &&
    helper.includes("await archiveMissingRetrievalItems(supabase, userId, savedItemIds);"),
  "saveBuilderGlobalData should not archive existing retrieval rows when a normal client save sends retrievalItems: [].",
);

console.log("Empty retrieval-bank save guard regression checks passed.");
