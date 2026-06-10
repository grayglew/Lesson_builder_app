import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");
const liveRetrieval = readFileSync(resolve(root, "src", "lib", "builder-sync", "live-retrieval.ts"), "utf8");
const migrationsDir = resolve(root, "supabase", "migrations");
const globalApiPath = resolve(root, "src", "app", "api", "builder-global", "route.ts");
const globalHelperPath = resolve(root, "src", "lib", "builder-global", "data.ts");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function latestMigrationContaining(text) {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({
      name,
      sql: readFileSync(resolve(migrationsDir, name), "utf8"),
    }))
    .find((entry) => entry.sql.includes(text));
}

const migration = latestMigrationContaining("create table if not exists public.slide_templates");

assert(migration, "A migration should add relational slide_templates storage.");
assert(
  migration.sql.includes("alter table public.retrieval_images") &&
    migration.sql.includes("role text") &&
    migration.sql.includes("question") &&
    migration.sql.includes("answer"),
  "Migration should add question/answer roles to retrieval_images."
);
assert(
  migration.sql.includes("legacy_json_id") && migration.sql.includes("lo_key"),
  "Migration should preserve legacy JSON item IDs and add a normalized LO lookup key."
);
assert(
  migration.sql.includes("apply_retrieval_seen_delta") && migration.sql.includes("greatest(0"),
  "Migration should include an atomic seen-count delta function that clamps at zero."
);

assert(existsSync(globalApiPath), "Relational builder-global API route should exist.");
assert(existsSync(globalHelperPath), "Relational builder-global data helper should exist.");

const globalApi = readFileSync(globalApiPath, "utf8");
const globalHelper = readFileSync(globalHelperPath, "utf8");

assert(
  globalApi.includes("loadBuilderGlobalData") && globalApi.includes("saveBuilderGlobalData"),
  "Builder-global route should load and save relational global builder data."
);
assert(
  globalHelper.includes(".from(\"classes\")") &&
    globalHelper.includes(".from(\"retrieval_los\")") &&
    globalHelper.includes(".from(\"retrieval_class_progress\")") &&
    globalHelper.includes(".from(\"retrieval_lo_images\")") &&
    globalHelper.includes(".from(\"slide_templates\")"),
  "Builder-global helper should use shared retrieval relational tables instead of builder-state JSON."
);
assert(
  globalHelper.includes("createSignedUrl") && globalHelper.includes("role"),
  "Relational global loader should return signed image URLs for question and answer image roles."
);

assert(
  appJs.includes("BUILDER_GLOBAL_URL") &&
    appJs.includes("loadGlobalStateFromSupabase") &&
    appJs.includes("saveGlobalStateToSupabase"),
  "Builder UI should have dedicated relational global load/save functions."
);
assert(
  !appJs.includes("function globalStateForSync("),
  "Builder UI should no longer serialize retrieval/templates/classes into global JSON sync."
);
assert(
  !appJs.includes("persist(SYNC_GLOBAL);"),
  "Retrieval, class, and template edits should not queue global JSON sync."
);

assert(
  liveRetrieval.includes(".from(\"retrieval_class_progress\")") &&
    liveRetrieval.includes(".from(\"retrieval_los\")") &&
    !liveRetrieval.includes("apply_retrieval_seen_delta") &&
    !liveRetrieval.includes("builderSyncDocumentFolder(userId, \"global\")"),
  "Hosted presenter seen buttons should update shared retrieval class progress rows, not global JSON snapshots."
);

console.log("Relational global storage regression checks passed.");
