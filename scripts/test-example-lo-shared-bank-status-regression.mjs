import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const indexHtml = readFileSync(resolve(root, "public", "builder", "index.html"), "utf8");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");

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

assert(
  indexHtml.includes('id="example-lo-bank-status"') &&
    indexHtml.includes("shared retrieval bank"),
  "Example panel should include a visible shared retrieval-bank status line under the LO box.",
);

const extractRetrievalLoCode = extractFunction(appJs, "extractRetrievalLoCode");
assert(
  extractRetrievalLoCode.includes("[0-9]{2,3}") &&
    extractRetrievalLoCode.includes("toLowerCase"),
  "Builder UI should extract the LO code at the start of pasted example LOs.",
);

const findSharedRetrievalBankStatus = extractFunction(appJs, "findSharedRetrievalBankStatus");
assert(
  findSharedRetrievalBankStatus.includes("contentId") &&
    findSharedRetrievalBankStatus.includes("loCode") &&
    findSharedRetrievalBankStatus.includes("trackedForClass"),
  "Example status should distinguish shared-bank existence from class tracking.",
);

const updateExampleRetrievalBankStatus = extractFunction(appJs, "updateExampleRetrievalBankStatus");
for (const message of [
  "Already in shared retrieval bank; tracked for this class.",
  "Already in shared retrieval bank; not yet tracked for this class.",
  "New LO code; adding will create a shared bank entry.",
  "No LO code detected.",
]) {
  assert(updateExampleRetrievalBankStatus.includes(message), `Expected example LO status message: ${message}`);
}
assert(
  appJs.includes("updateExampleRetrievalBankStatus();") &&
    appJs.includes('draft.example.lo = event.target.value;'),
  "Example LO input should refresh shared-bank status as the user types or pastes.",
);

console.log("Example LO shared-bank status regression checks passed.");
