import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
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
  appJs.includes('const PRESENTER_PDF_SNAPSHOT_UPLOAD_URL = "/api/presenter/pdf-snapshot/upload-url";') &&
    appJs.includes('const PRESENTER_PDF_URL = "/api/presenter/pdf";'),
  "Builder should define hosted presenter PDF endpoints.",
);

const buildStandaloneHtml = extractFunction(appJs, "buildStandaloneHtml");
assert(
  buildStandaloneHtml.includes("presenterConfig") &&
    buildStandaloneHtml.includes('id="lesson-presenter-config"') &&
    buildStandaloneHtml.includes("SAVED_LESSON_UPLOAD_URL") &&
    buildStandaloneHtml.includes("SAVED_LESSON_COMPLETE_URL") &&
    buildStandaloneHtml.includes("SAVED_LESSON_TAUGHT_URL"),
  "Hosted presenter HTML should embed save-back endpoint configuration.",
);

const presentSavedLesson = extractFunction(appJs, "presentSavedLesson");
assert(
  presentSavedLesson.includes("presenterConfig:") &&
    presentSavedLesson.includes("sourceLessonId: id") &&
    presentSavedLesson.includes("pdfSnapshotUploadEndpoint: PRESENTER_PDF_SNAPSHOT_UPLOAD_URL") &&
    presentSavedLesson.includes("pdfEndpoint: PRESENTER_PDF_URL"),
  "Opening a hosted presenter should pass source lesson and PDF/save endpoints into the presenter config.",
);

const presenterHtml = extractFunction(appJs, "standalonePresenterHtml");
assert(
  presenterHtml.includes('id="presenter-save-builder"') &&
    presenterHtml.includes("Save to Builder") &&
    presenterHtml.includes("hidden"),
  "Presenter toolbar should include a hosted-only Save to Builder action.",
);

const presenterScript = extractFunction(appJs, "standalonePresenterScript");
for (const expected of [
  'var presenterConfigElement = document.getElementById("lesson-presenter-config")',
  'var saveBuilderBtn = document.getElementById("presenter-save-builder")',
  "var presentedLessonId = \"\";",
  "function savePresentedLessonToBuilder(",
  "function presentedLessonDocument(",
  'lessonKind: "presented-builder-lesson"',
  "sourceLessonId: presenterConfig.sourceLessonId",
  "presentedAt:",
  "uploadPresentedLessonDocument(",
  "presentedLessonId = completed.lesson.id",
  "markPresentedLessonTaught(",
  "saveBuilderBtn.addEventListener(\"click\", savePresentedLessonToBuilder)",
]) {
  assert(presenterScript.includes(expected), `Expected save-back marker: ${expected}`);
}

console.log("Presenter save-back regression checks passed.");
