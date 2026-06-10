import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");
const uploadRoute = readFileSync(resolve(root, "src", "app", "api", "builder-sync", "upload-url", "route.ts"), "utf8");
const completeRoute = readFileSync(resolve(root, "src", "app", "api", "builder-sync", "complete", "route.ts"), "utf8");
const latestRoute = readFileSync(resolve(root, "src", "app", "api", "builder-sync", "latest", "route.ts"), "utf8");
const authHelpers = readFileSync(resolve(root, "src", "lib", "builder-sync", "auth.ts"), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

const documentsHelperPath = resolve(root, "src", "lib", "builder-sync", "documents.ts");
assert(existsSync(documentsHelperPath), "Builder sync document helper should exist.");
const documentsHelper = readFileSync(documentsHelperPath, "utf8");

assert(
  documentsHelper.includes('export const BUILDER_SYNC_DOCUMENT_KINDS = ["workspace", "global"] as const;'),
  "Sync documents should be split into workspace and global documents."
);
assert(
  documentsHelper.includes("export const BUILDER_SYNC_RETAINED_SNAPSHOTS = 4;"),
  "Builder sync should retain only the latest document plus three recovery snapshots per kind."
);
assert(
  documentsHelper.includes("function builderSyncDocumentFolder(") &&
    documentsHelper.includes("function builderSyncDocumentPath(") &&
    documentsHelper.includes("${builderSyncDocumentFolder(userId, kind)}/"),
  "Sync helper should build deterministic per-kind storage folders and timestamped paths."
);
assert(
  uploadRoute.includes("normalizeBuilderSyncKind(body.kind)") &&
    uploadRoute.includes("builderSyncDocumentPath(auth.user.id, kind)"),
  "Upload route should write per-kind sync documents instead of one combined state file."
);
assert(
  completeRoute.includes("cleanupOldBuilderSyncSnapshots") &&
    completeRoute.includes("BUILDER_SYNC_RETAINED_SNAPSHOTS"),
  "Complete route should clean up old sync snapshots after successful upload."
);
assert(
  latestRoute.includes("latestBuilderSyncSnapshot") &&
    latestRoute.includes("normalizeBuilderSyncKind(request.nextUrl.searchParams.get(\"kind\"))"),
  "Latest route should read the newest per-kind sync document from Storage."
);
assert(
  authHelpers.includes("isBuilderSyncDocumentPath"),
  "Auth helpers should validate per-kind builder sync document paths."
);

const workspaceStateForSync = extractFunction(appJs, "workspaceStateForSync");
const globalStateForRelationalSync = extractFunction(appJs, "globalStateForRelationalSync");
const saveStateToSupabase = extractFunction(appJs, "saveStateToSupabase");
const persistLessonChange = extractFunction(appJs, "persistLessonChange");
const persistGlobalChange = extractFunction(appJs, "persistGlobalChange");
const addRetrievalItem = extractFunction(appJs, "addRetrievalItem");

assert(
  workspaceStateForSync.includes('syncKind: SYNC_WORKSPACE') &&
    workspaceStateForSync.includes("slides: clonePlain(nextState.slides || [])") &&
    !workspaceStateForSync.includes("retrievalItems"),
  "Workspace sync should include lesson workspace fields but not the retrieval bank."
);
assert(
  globalStateForRelationalSync.includes("retrievalItems: (nextState.retrievalItems || []).map") &&
    globalStateForRelationalSync.includes("slideTemplates: clonePlain(nextState.slideTemplates") &&
    !globalStateForRelationalSync.includes("slides:"),
  "Relational global sync should include retrieval/templates/classes but not current lesson slides."
);
assert(
  saveStateToSupabase.includes("syncDocumentForKind(nextState, syncKind)") &&
    saveStateToSupabase.includes("saveGlobalStateToSupabase(nextState)") &&
    saveStateToSupabase.includes("kind: syncKind"),
  "Supabase save should upload workspace JSON and route global data to relational storage."
);
assert(
  persistLessonChange.includes("persist(SYNC_WORKSPACE);"),
  "Lesson changes should only queue workspace sync."
);
assert(
  persistGlobalChange.includes("persistLightweightState();") &&
    !persistGlobalChange.includes("scheduleRelationalGlobalPersist") &&
    !persistGlobalChange.includes("persist(SYNC_GLOBAL);"),
  "Global changes should update local recovery state without queueing whole-bank Supabase sync."
);
assert(
  addRetrievalItem.includes("persistGlobalChange();") &&
    addRetrievalItem.includes("queueRetrievalItemSave(item)"),
  "Retrieval-bank changes should queue targeted item sync, not the current workspace document or whole bank."
);

console.log("Builder sync split regression checks passed.");
