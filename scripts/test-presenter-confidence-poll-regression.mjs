import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");
const styles = readFileSync(resolve(root, "public", "builder", "styles.css"), "utf8");
const mapper = readFileSync(resolve(root, "src", "lib", "builder-sync", "saved-lessons.ts"), "utf8");
const completeRoute = readFileSync(resolve(root, "src", "app", "api", "builder-lessons", "complete", "route.ts"), "utf8");
const listRoute = readFileSync(resolve(root, "src", "app", "api", "builder-lessons", "route.ts"), "utf8");
const openRoute = readFileSync(resolve(root, "src", "app", "api", "builder-lessons", "open", "route.ts"), "utf8");
const migrationsDir = resolve(root, "supabase", "migrations");
const migrations = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => readFileSync(resolve(migrationsDir, file), "utf8"));

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
  migrations.some((sql) => sql.includes("alter table public.builder_lessons") && sql.includes("confidence_summary jsonb")),
  "A migration should add builder_lessons.confidence_summary JSON metadata.",
);
assert(
  mapper.includes("confidence_summary") &&
    mapper.includes("confidenceSummary") &&
    mapper.includes("normalizeConfidenceSummary"),
  "Saved lesson mapper should normalize and expose confidenceSummary.",
);
assert(
  completeRoute.includes("normalizeConfidenceSummary") &&
    completeRoute.includes('Object.prototype.hasOwnProperty.call(body, "confidenceSummary")') &&
    completeRoute.includes("lessonRow.confidence_summary = normalizeConfidenceSummary(body.confidenceSummary)"),
  "Saved lesson completion should persist validated confidence summary only when the request sends poll data.",
);
assert(
  listRoute.includes("confidence_summary") && openRoute.includes("confidence_summary"),
  "Saved lesson list/open routes should return confidence summary metadata.",
);

const presenterHtml = extractFunction(appJs, "standalonePresenterHtml");
assert(
  presenterHtml.includes('id="presenter-poll"') &&
    presenterHtml.includes("Poll") &&
    presenterHtml.includes("hidden"),
  "Hosted presenter toolbar should include a hidden Poll button.",
);

const presenterScript = extractFunction(appJs, "standalonePresenterScript");
for (const expected of [
  'var pollBtn = document.getElementById("presenter-poll")',
  "var confidencePoll = defaultConfidencePollState();",
  "function defaultConfidencePollState(",
  "function showConfidencePollSlide(",
  "function incrementConfidencePoll(",
  "function endLessonWithConfidencePoll(",
  "function confidenceSummaryForSave(",
  "confidencePoll: confidenceSummaryForSave()",
  "metadata: {",
  "confidencePoll: confidenceSummaryForSave()",
  "pollBtn.addEventListener(\"click\", showConfidencePollSlide)",
]) {
  assert(presenterScript.includes(expected), `Expected confidence poll presenter marker: ${expected}`);
}
assert(
  presenterScript.includes("if (slide.dataset.generatedPoll === \"true\") return false;"),
  "Presenter save-back should not persist the temporary poll slide as lesson content.",
);
assert(
  presenterScript.includes("data-confidence-total") &&
    !presenterScript.includes("data-confidence-count"),
  "Confidence poll choices should not show per-level counts; only the total response count should be visible.",
);
assert(
  presenterScript.includes("confidenceSummary: doc.metadata.confidencePoll"),
  "Presenter save-back should pass confidence summary to the saved lesson completion API.",
);

const renderSavedLessons = extractFunction(appJs, "renderSavedLessons");
assert(
  renderSavedLessons.includes("confidenceStyleForLesson(lesson)") &&
    renderSavedLessons.includes("data-saved-action=\"confidence\"") &&
    renderSavedLessons.includes("Confidence"),
  "Saved lesson rows should colour confidence-marked taught lessons and expose a histogram button.",
);
const handleSavedLessonsClick = extractFunction(appJs, "handleSavedLessonsClick");
assert(
  handleSavedLessonsClick.includes('action === "confidence"') &&
    handleSavedLessonsClick.includes("showSavedLessonConfidence(id)"),
  "Saved lesson confidence buttons should route to the histogram dialog.",
);
for (const expectedFunction of [
  "confidenceAverageColor",
  "confidenceStyleForLesson",
  "showSavedLessonConfidence",
  "confidenceHistogramHtml",
]) {
  extractFunction(appJs, expectedFunction);
}
assert(
  styles.includes(".confidence-dialog") &&
    styles.includes(".confidence-histogram") &&
    styles.includes(".saved-lesson-item.has-confidence"),
  "Builder styles should include the confidence histogram and confidence-coloured saved rows.",
);
assert(
  existsSync(resolve(root, "scripts", "test-presenter-confidence-poll-regression.mjs")),
  "Confidence poll regression script should exist.",
);

console.log("Presenter confidence poll regression checks passed.");
