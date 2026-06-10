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

for (const [id, label] of [
  ["retrieval-select-all", "Select all"],
  ["retrieval-select-due", "Select all due"],
  ["retrieval-deselect-all", "Deselect all"],
]) {
  assert(
    indexHtml.includes(`id="${id}"`) && indexHtml.includes(`>${label}</button>`),
    `Expected retrieval bulk selection button "${label}".`,
  );
  assert(
    appJs.includes(`$("${id}").addEventListener("click"`),
    `Expected ${id} click listener to be registered.`,
  );
}

const setVisibleRetrievalSelection = extractFunction(appJs, "setVisibleRetrievalSelection");
assert(
  setVisibleRetrievalSelection.includes("getVisibleRetrievalItems()") &&
    setVisibleRetrievalSelection.includes("getDueRetrievalItems()"),
  "Bulk retrieval selection should operate on visible rows and use the existing due calculation.",
);
assert(
  setVisibleRetrievalSelection.includes('mode === "due"') &&
    setVisibleRetrievalSelection.includes("item.selected = dueIds.has(item.id);"),
  "Select all due should select due visible rows and deselect visible rows that are not due.",
);
assert(
  setVisibleRetrievalSelection.includes('mode === "all"') &&
    setVisibleRetrievalSelection.includes("item.selected = true;") &&
    setVisibleRetrievalSelection.includes('mode === "none"') &&
    setVisibleRetrievalSelection.includes("item.selected = false;"),
  "Select all and deselect all should set visible row selection directly.",
);
assert(
  setVisibleRetrievalSelection.includes("persistGlobalChange()") &&
    setVisibleRetrievalSelection.includes("renderRetrievalRows()") &&
    !setVisibleRetrievalSelection.includes("queueRetrievalItemSave") &&
    !setVisibleRetrievalSelection.includes("saveRetrievalItemToSupabase"),
  "Bulk selection should persist local checkbox state only, without targeted Supabase item saves.",
);

console.log("Retrieval bulk selection regression checks passed.");
