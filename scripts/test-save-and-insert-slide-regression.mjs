import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");
const indexHtml = readFileSync(resolve(root, "public", "builder", "index.html"), "utf8");
const stylesCss = readFileSync(resolve(root, "public", "builder", "styles.css"), "utf8");

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

const saveCurrentLesson = extractFunction(appJs, "saveCurrentLesson");
assert(
  saveCurrentLesson.includes('if (!String(doc.className || "").trim())') &&
    saveCurrentLesson.includes("Choose a class before saving this lesson."),
  "Saving a lesson should require a class before any upload work begins."
);
assert(
  saveCurrentLesson.indexOf('if (!String(doc.className || "").trim())') <
    saveCurrentLesson.indexOf("SAVED_LESSON_UPLOAD_URL"),
  "Class validation should run before requesting a saved-lesson upload URL."
);

assert(
  indexHtml.includes('id="quick-lesson-save"') &&
    indexHtml.includes('id="quick-lesson-save-copy"') &&
    indexHtml.includes('id="quick-lesson-new"'),
  "The main interface should expose top-left Save, Save as, and New lesson buttons."
);

const quickActionsIndex = indexHtml.indexOf('class="lesson-quick-actions"');
const panelNavIndex = indexHtml.indexOf('class="panel-nav"');
assert(
  quickActionsIndex >= 0 && quickActionsIndex < panelNavIndex,
  "Quick lesson actions should sit in the top-left lesson controls before the tool navigation."
);

const wireInputs = extractFunction(appJs, "wireInputs");
assert(
  wireInputs.includes('$("quick-lesson-save").addEventListener("click", () => saveCurrentLesson({ copy: false }));') &&
    wireInputs.includes('$("quick-lesson-save-copy").addEventListener("click", () => saveCurrentLesson({ copy: true }));') &&
    wireInputs.includes('$("quick-lesson-new").addEventListener("click", newCurrentLesson);'),
  "Quick lesson buttons should call the same save, save-as, and new-lesson flows."
);

const setSavedLessonBusy = extractFunction(appJs, "setSavedLessonBusy");
assert(
  setSavedLessonBusy.includes('"quick-lesson-new"') &&
    setSavedLessonBusy.includes('"quick-lesson-save"') &&
    setSavedLessonBusy.includes('"quick-lesson-save-copy"'),
  "Quick lesson buttons should be disabled while saved-lesson actions are busy."
);

assert(
  appJs.includes("let selectedPreviewSlideIds = new Set();") &&
    appJs.includes("let previewInsertAnchorSlideId = \"\";"),
  "The deck preview should keep track of selected slides and the selected insertion anchor."
);
assert(
  appJs.includes("function getSelectedSlideInsertIndex(") &&
    appJs.includes("function insertSlidesAfterSelectedSlide(") &&
    appJs.includes("function toggleSelectedPreviewSlide("),
  "Slide insertion should be routed through selected-preview-slide helpers."
);

const addSlide = extractFunction(appJs, "addSlide");
assert(
  addSlide.includes("insertSlidesAfterSelectedSlide([slide])") && !addSlide.includes("state.slides.push"),
  "Adding one slide should insert after the selected preview slide instead of always appending."
);

const addSlides = extractFunction(appJs, "addSlides");
assert(
  addSlides.includes("insertSlidesAfterSelectedSlide(slides)") && !addSlides.includes("state.slides.push"),
  "Adding many slides should insert after the selected preview slide instead of always appending."
);

const renderPreview = extractFunction(appJs, "renderPreview");
assert(
  renderPreview.includes("is-selected") &&
    renderPreview.includes('aria-selected="${isSelected ? "true" : "false"}') &&
    renderPreview.includes("toggleSelectedPreviewSlide(id)") &&
    renderPreview.includes('event.target.closest(".slide-actions")'),
  "Deck preview slides should visibly select/deselect without toolbar buttons toggling selection."
);

const deleteSlide = extractFunction(appJs, "deleteSlide");
assert(
  deleteSlide.includes("selectedPreviewSlideIds.delete(id)") &&
    deleteSlide.includes("previewInsertAnchorSlideId === id"),
  "Deleting a selected preview slide should update the multi-select insertion anchor."
);

const clearPreviewSelection = extractFunction(appJs, "clearPreviewSelection");
assert(
  clearPreviewSelection.includes("selectedPreviewSlideIds = new Set();") &&
    clearPreviewSelection.includes('previewInsertAnchorSlideId = "";'),
  "Preview selection clearing should reset the selected slide set and insertion anchor."
);

const newCurrentLesson = extractFunction(appJs, "newCurrentLesson");
assert(
  newCurrentLesson.includes("clearPreviewSelection();"),
  "Starting a new lesson should clear the selected preview slide."
);

const applyLessonDocument = extractFunction(appJs, "applyLessonDocument");
assert(
  applyLessonDocument.includes("clearPreviewSelection();"),
  "Opening a saved lesson should clear the selected preview slide."
);

assert(
  stylesCss.includes(".lesson-quick-actions") &&
    stylesCss.includes(".slide-item.is-selected"),
  "Styles should cover the quick lesson actions and selected deck preview cue."
);

console.log("Save safety and selected slide insertion regression checks passed.");
