import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");
const globalData = readFileSync(resolve(root, "src", "lib", "builder-global", "data.ts"), "utf8");

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

for (const route of [
  "bootstrap",
  "retrieval-items",
  "retrieval-images/resolve",
  "retrieval-log",
  "retrieval-next",
  "classes",
  "templates",
]) {
  assert(
    existsSync(resolve(root, "src", "app", "api", "builder-global", route, "route.ts")),
    `Expected targeted builder-global/${route} API route.`,
  );
}

assert(
  appJs.includes("BUILDER_GLOBAL_BOOTSTRAP_URL") &&
    appJs.includes("BUILDER_GLOBAL_RETRIEVAL_ITEMS_URL") &&
    appJs.includes("BUILDER_GLOBAL_RETRIEVAL_IMAGES_RESOLVE_URL"),
  "Builder UI should define targeted retrieval sync API URLs.",
);

const loadGlobalStateFromSupabase = extractFunction(appJs, "loadGlobalStateFromSupabase");
assert(
  loadGlobalStateFromSupabase.includes("BUILDER_GLOBAL_BOOTSTRAP_URL") &&
    !loadGlobalStateFromSupabase.includes("BUILDER_GLOBAL_URL"),
  "Boot/global load should use lightweight bootstrap instead of the full builder-global route.",
);

const persistGlobalChange = extractFunction(appJs, "persistGlobalChange");
assert(
  !persistGlobalChange.includes("scheduleRelationalGlobalPersist") &&
    !persistGlobalChange.includes("saveGlobalStateToSupabase"),
  "Normal global persistence should remain local and should not queue whole-bank Supabase sync.",
);

const scheduleTargetedGlobalPersist = extractFunction(appJs, "scheduleTargetedGlobalPersist");
assert(
  appJs.includes("TARGETED_SYNC_QUEUED_STATUS") &&
    appJs.includes("TARGETED_SYNCED_STATUS") &&
    scheduleTargetedGlobalPersist.includes("maybeShowTargetedSyncSuccess") &&
    scheduleTargetedGlobalPersist.includes("flushTargetedGlobalSync()"),
  "Successful targeted retrieval sync should clear the queued warning instead of leaving it stuck.",
);

const updateDatabaseNow = extractFunction(appJs, "updateDatabaseNow");
assert(
  updateDatabaseNow.includes("flushTargetedGlobalSync()") &&
    !updateDatabaseNow.includes("saveGlobalStateToSupabase(state)"),
  "Update Database should flush targeted sync queues instead of posting the whole retrieval bank.",
);

const renderRetrievalRows = extractFunction(appJs, "renderRetrievalRows");
assert(
  renderRetrievalRows.includes("queueRetrievalItemSave(item)") &&
    renderRetrievalRows.includes('field !== "selected"') &&
    !renderRetrievalRows.includes("persistGlobalChange();\n          if"),
  "Inline retrieval row edits should queue one item save, while selected checkboxes remain local only.",
);

const addRetrievalItem = extractFunction(appJs, "addRetrievalItem");
assert(
  addRetrievalItem.includes("queueRetrievalItemSave(item)") && addRetrievalItem.includes("return item;"),
  "Adding a seeded retrieval item should queue a targeted item save and return the item.",
);

const saveRetrievalEditor = extractFunction(appJs, "saveRetrievalEditor");
assert(
  saveRetrievalEditor.includes("saveRetrievalItemToSupabase(item)") &&
    saveRetrievalEditor.includes("syncRetrievalItemImages(item)"),
  "Saving the retrieval editor should save one item and sync only that item's images.",
);

const addRetrievalSlide = extractFunction(appJs, "addRetrievalSlide");
assert(
  appJs.includes("async function addRetrievalSlide(") &&
    addRetrievalSlide.includes("resolveRetrievalImagePairs") &&
    addRetrievalSlide.includes("queueRetrievalNextSync(selectedItems)"),
  "Add selected slide should resolve only selected image pairs and queue targeted current-image-slot updates.",
);

const suggestStarterLos = extractFunction(appJs, "suggestStarterLos");
assert(
  appJs.includes("async function suggestStarterLos(") &&
    suggestStarterLos.includes("resolveRetrievalImagePairs"),
  "Starter suggestions should resolve only the selected starter image pairs.",
);

const generateRevisionLesson = extractFunction(appJs, "generateRevisionLesson");
assert(
  appJs.includes("async function generateRevisionLesson(") &&
    generateRevisionLesson.includes("resolveRetrievalImagePairs"),
  "Revision lesson generation should resolve only selected revision image pairs.",
);

const openRetrievalEditor = extractFunction(appJs, "openRetrievalEditor");
assert(
  appJs.includes("async function openRetrievalEditor(") &&
    openRetrievalEditor.includes("resolveRetrievalEditorImages(item)"),
  "Opening the retrieval editor should lazily resolve all image slots for that one item.",
);

const saveStateToIndexedDb = extractFunction(appJs, "saveStateToIndexedDb");
assert(
  saveStateToIndexedDb.includes("indexedDbRecoveryState(nextState)") &&
    appJs.includes("function stripSignedImageUrls(") &&
    appJs.includes("key === \"dataUrl\" && isRemoteImageUrl(entry)"),
  "IndexedDB recovery state should strip signed remote image URLs while preserving lightweight metadata.",
);

assert(
  globalData.includes("loadBuilderGlobalBootstrapData") &&
    globalData.includes("saveRetrievalItemData") &&
    globalData.includes("resolveRetrievalImageRequests") &&
    globalData.includes("saveSlideTemplatesData") &&
    globalData.includes("saveClassNamesData"),
  "Builder global helper should expose lightweight bootstrap and targeted persistence helpers.",
);

assert(
  globalData.includes("includeSignedUrls?: boolean") &&
    globalData.includes("imagePayloadFromAsset(asset, includeSignedUrls ?"),
  "Global retrieval loaders should be able to return asset metadata without signed URLs.",
);

console.log("Granular retrieval sync regression checks passed.");
