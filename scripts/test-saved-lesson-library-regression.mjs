import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");
const indexHtml = readFileSync(resolve(root, "public", "builder", "index.html"), "utf8");
const migrationsDir = resolve(root, "supabase", "migrations");
const builderLessonMigration = readdirSync(migrationsDir).find((file) => file.endsWith("_builder_lessons.sql"));
assert(builderLessonMigration, "Expected a builder_lessons migration file.");
const migrationSql = readFileSync(resolve(migrationsDir, builderLessonMigration), "utf8");

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

const currentLessonDocument = extractFunction(appJs, "currentLessonDocument");
assert(
  currentLessonDocument.includes('lessonKind: "saved-builder-lesson"'),
  "Saved lesson documents should be explicitly typed."
);
assert(
  currentLessonDocument.includes("slides: clonePlain(state.slides || [])"),
  "Saved lesson documents should include the current slide list."
);
assert(
  !currentLessonDocument.includes("retrievalItems"),
  "Saved lesson documents must not duplicate the retrieval bank."
);
assert(
  !currentLessonDocument.includes("slideTemplates"),
  "Saved lesson documents must not duplicate slide templates."
);
assert(
  !currentLessonDocument.includes("classNames"),
  "Saved lesson documents must not duplicate the global class list."
);

const applyLessonDocument = extractFunction(appJs, "applyLessonDocument");
assert(
  !/state\.retrievalItems\s*=/.test(applyLessonDocument),
  "Opening a saved lesson must not overwrite the retrieval bank."
);
assert(
  !/state\.slideTemplates\s*=/.test(applyLessonDocument),
  "Opening a saved lesson must not overwrite slide templates."
);
const openSavedLesson = extractFunction(appJs, "openSavedLesson");
assert(
  openSavedLesson.includes("await prepareSavedLessonOpenDocument("),
  "Opening a saved lesson should refresh retrieval-backed starter image URLs before rendering the deck preview."
);
const prepareSavedLessonOpenDocument = extractFunction(appJs, "prepareSavedLessonOpenDocument");
assert(
  prepareSavedLessonOpenDocument.includes("lessonExportStateFromDocument(") &&
    prepareSavedLessonOpenDocument.includes("hydrateLiveStarterSlots("),
  "Saved lesson open preparation should reuse the lesson export shape and hydrate live starter slots."
);
assert(
  indexHtml.includes('id="saved-lesson-list"'),
  "The builder should include the saved lesson list."
);
assert(
  indexHtml.includes('data-panel="saved-lessons"') && indexHtml.includes('id="panel-saved-lessons"'),
  "Saved lessons should be a full workspace panel opened from the sidebar navigation."
);
assert(
  !indexHtml.includes('<section class="lesson-library"'),
  "Saved lessons should not be embedded as a compact sidebar section."
);
assert(
  indexHtml.includes('id="saved-lesson-filter-class"') &&
    indexHtml.includes('id="saved-lesson-filter-from"') &&
    indexHtml.includes('id="saved-lesson-filter-to"'),
  "Saved lesson screen should include class and date range filters."
);
assert(
  appJs.includes('data-saved-action="download"'),
  "Each saved lesson should expose a direct download action."
);
assert(
  appJs.includes('data-saved-action="change-class"'),
  "Each saved lesson should expose a class-change action."
);
const handleSavedLessonsClick = extractFunction(appJs, "handleSavedLessonsClick");
assert(
  handleSavedLessonsClick.includes('action === "change-class"') &&
    handleSavedLessonsClick.includes("changeSavedLessonClass(id)"),
  "Saved lesson class-change buttons should route to the class update flow."
);
const changeSavedLessonClass = extractFunction(appJs, "changeSavedLessonClass");
assert(
  changeSavedLessonClass.includes("window.prompt(\"Class\"") &&
    changeSavedLessonClass.includes("SAVED_LESSON_RENAME_URL"),
  "Saved lesson class changes should prompt for a class and reuse the existing metadata update endpoint."
);
assert(
  changeSavedLessonClass.includes("title: lesson.title") &&
    changeSavedLessonClass.includes("className,") &&
    changeSavedLessonClass.includes("teachingDate: lesson.teachingDate"),
  "Changing a saved lesson class should preserve that lesson's title and teaching date."
);
assert(
  changeSavedLessonClass.includes("state.className = data.lesson.className") &&
    changeSavedLessonClass.includes("state.activeLessonId === id"),
  "Changing the currently open saved lesson's class should update the active builder state."
);
const exportHtml = extractFunction(appJs, "exportHtml");
assert(
  appJs.includes("async function exportHtml(") &&
    exportHtml.includes("await prepareStandaloneLessonDownloadState(standaloneBuilderState(state))"),
  "Direct HTML export should refresh and inline retrieval-backed images before downloading."
);
const downloadSavedLesson = extractFunction(appJs, "downloadSavedLesson");
assert(
  downloadSavedLesson.includes("buildStandaloneHtml("),
  "Saved lesson download should render the lesson as standalone presenter HTML."
);
assert(
  downloadSavedLesson.includes("await prepareStandaloneLessonDownloadState("),
  "Saved lesson download should refresh and inline retrieval-backed images before rendering standalone HTML."
);
assert(
  downloadSavedLesson.includes(".html") && !downloadSavedLesson.includes(".lesson.json"),
  "Saved lesson download should produce an HTML file, not the saved JSON document."
);
const prepareStandaloneLessonDownloadState = extractFunction(appJs, "prepareStandaloneLessonDownloadState");
assert(
  prepareStandaloneLessonDownloadState.includes("hydrateLiveStarterSlots(") &&
    prepareStandaloneLessonDownloadState.includes("inlineRemoteLessonImages("),
  "Standalone lesson downloads should refresh starter image URLs and then inline remote images."
);
const inlineRemoteLessonImages = extractFunction(appJs, "inlineRemoteLessonImages");
assert(
  inlineRemoteLessonImages.includes("inlineRemoteImagesInValue("),
  "Standalone lesson downloads should walk the lesson state looking for remote images."
);
const inlineRemoteImagesInValue = extractFunction(appJs, "inlineRemoteImagesInValue");
assert(
  inlineRemoteImagesInValue.includes("isRemoteImageUrl(") &&
    inlineRemoteImagesInValue.includes("dataUrlFromRemoteImage("),
  "Standalone lesson downloads should convert remote image URLs to embedded data URLs where possible."
);
assert(
  /create table if not exists public\.builder_lessons/.test(migrationSql),
  "The migration should create the builder_lessons metadata table."
);
assert(
  /alter table public\.builder_lessons enable row level security/.test(migrationSql),
  "The builder_lessons table should have RLS enabled."
);
for (const route of ["", "upload-url", "complete", "open", "rename", "delete"]) {
  const routePath = resolve(root, "src", "app", "api", "builder-lessons", route, "route.ts");
  assert(existsSync(routePath), `Expected builder-lessons/${route || "list"} API route.`);
}

console.log("Saved lesson library regression checks passed.");
