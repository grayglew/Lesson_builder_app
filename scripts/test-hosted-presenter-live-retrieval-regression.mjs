import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJsPath = resolve(root, "public", "builder", "app.js");
const routePath = resolve(root, "src", "app", "api", "presenter", "retrieval-log", "route.ts");
const helperPath = resolve(root, "src", "lib", "builder-sync", "live-retrieval.ts");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const appJs = readFileSync(appJsPath, "utf8");

assert(existsSync(routePath), "Live presenter retrieval-log API route should exist.");
assert(existsSync(helperPath), "Live retrieval sync helper should exist.");

const route = readFileSync(routePath, "utf8");
const helper = readFileSync(helperPath, "utf8");

assert(
  appJs.includes('data-saved-action="present"') && appJs.includes(">Present</button>"),
  "Saved lessons list should include a Present action separate from Download."
);
assert(
  appJs.includes("async function presentSavedLesson(id)") && appJs.includes("buildStandaloneHtml(exportState,"),
  "Builder should open a hosted presenter window from saved lesson JSON using the existing presenter HTML builder."
);
assert(
  appJs.includes("liveRetrieval") &&
    appJs.includes("standaloneLiveRetrievalScript") &&
    appJs.includes("/api/presenter/retrieval-log"),
  "Standalone presenter HTML should support optional live retrieval logging without changing offline export."
);
assert(
  appJs.includes("data-live-retrieval") &&
    appJs.includes("data-live-lo") &&
    appJs.includes("data-live-slide-index") &&
    appJs.includes('data-live-delta="-1"') &&
    appJs.includes('data-live-delta="1"') &&
    appJs.includes(">-1</button>") &&
    appJs.includes(">+1</button>"),
  "Starter slides in live presenter mode should render separate compact -1 and +1 buttons with LO and slide context."
);
assert(
  route.includes("getAuthorizedBuilderSyncClient()") &&
    route.includes("logLiveRetrievalEvent") &&
    route.includes("lessonId"),
  "Live retrieval route should require the existing signed-in allow-listed user check and pass lesson context to the helper."
);
assert(
  helper.includes(".from(\"retrieval_class_progress\")") &&
    helper.includes(".from(\"retrieval_los\")") &&
    helper.includes("retrieval_lo:retrieval_los") &&
    !helper.includes("apply_retrieval_seen_delta") &&
    !helper.includes("builderSyncDocumentFolder(userId, \"global\")") &&
    !helper.includes(".upload("),
  "Live retrieval helper should update shared-bank class progress rows instead of legacy global sync snapshots."
);
assert(
  helper.includes("seenCount") &&
    helper.includes("deltaSeen") &&
    helper.includes("normalizeSeenDelta") &&
    helper.includes("lastTaught") &&
    helper.includes("spacing_factor") &&
    helper.includes("createLiveRetrievalItem"),
  "Live retrieval helper should update or create retrieval-bank items through the relational tracker."
);

console.log("Hosted presenter live retrieval regression checks passed.");
