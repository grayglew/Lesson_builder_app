import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");
const liveHelper = readFileSync(resolve(root, "src", "lib", "builder-sync", "live-retrieval.ts"), "utf8");
const migrationsDir = resolve(root, "supabase", "migrations");
const routePath = resolve(root, "src", "app", "api", "presenter", "retrieval-next", "route.ts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(resolve(migrationsDir, name), "utf8"));
const migration = migrations.find((sql) => sql.includes("current_image_slot"));

assert(migration, "A migration should add retrieval_items.current_image_slot.");
assert(
  migration.includes("current_image_slot") &&
    migration.includes("between 1 and 8") &&
    migration.includes("advance_retrieval_image_slot"),
  "Migration should constrain current_image_slot and add an advance function."
);
assert(
  migration.includes("role = 'question'") && migration.includes("array_agg"),
  "Advance function should move through available question-image slots."
);

assert(existsSync(routePath), "Live presenter retrieval-next API route should exist.");
const route = readFileSync(routePath, "utf8");

assert(
  route.includes("getAuthorizedBuilderSyncClient()") &&
    route.includes("advanceLiveRetrievalQuestion") &&
    route.includes("retrievalItemId"),
  "Retrieval-next route should require auth and pass retrieval item context to the helper."
);

assert(
  liveHelper.includes("current_image_slot") &&
    liveHelper.includes("advanceLiveRetrievalQuestion") &&
    liveHelper.includes(".from(\"retrieval_class_progress\")") &&
    liveHelper.includes(".from(\"retrieval_lo_images\")") &&
    liveHelper.includes("nextRetrievalSlot") &&
    !liveHelper.includes("advance_retrieval_image_slot") &&
    liveHelper.includes("createSignedUrls"),
  "Live retrieval helper should advance shared class progress display pointers and return signed image URLs."
);
assert(
  liveHelper.includes("getLiveRetrievalQuestion") &&
    liveHelper.includes("answerImage") &&
    liveHelper.includes("questionImage"),
  "Live retrieval helper should return the current question and corresponding answer image."
);

assert(
    appJs.includes("PRESENTER_RETRIEVAL_NEXT_URL") &&
    appJs.includes("hydrateLiveStarterSlots") &&
    appJs.includes("data-live-retrieval-next") &&
    appJs.includes(">&#8635;</button>"),
  "Builder should hydrate live starter images and render a compact loop-arrow button in live presenter mode."
);
assert(
  appJs.includes("replaceLiveStarterImage") &&
    appJs.includes("data-live-image-host") &&
    appJs.includes("currentImageSlot") &&
    appJs.includes("retrievalItemId"),
  "Live presenter script should replace starter question/answer images and track the current image slot."
);
assert(
  appJs.includes("data-live-item-id") &&
    appJs.includes("data-live-current-image-slot"),
  "Live presenter buttons should carry retrieval item id and current image slot metadata."
);

console.log("Live starter next-question regression checks passed.");
