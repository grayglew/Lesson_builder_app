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
  const asyncStart = source.indexOf(`async function ${name}(`);
  const syncStart = source.indexOf(`function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : syncStart;
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
  indexHtml.includes('for="overall-lesson-lo"') &&
    indexHtml.includes('id="overall-lesson-lo"') &&
    indexHtml.includes("Overall lesson LO"),
  "Starter panel should include an overall lesson LO entry box.",
);

assert(
  indexHtml.includes('id="handout-lesson"') &&
    indexHtml.includes(">Hand out</button>") &&
    indexHtml.indexOf('id="handout-lesson"') < indexHtml.indexOf('id="preview-collapse-toggle"'),
  "Deck preview header should include a Hand out button before collapse/reset controls.",
);

for (const functionName of [
  "createInitialState",
  "normalizeImportedState",
  "mergeSyncedStateDocuments",
  "workspaceStateForSync",
  "currentLessonDocument",
  "normalizeLessonDocument",
  "lessonExportStateFromDocument",
  "standaloneBuilderState",
  "syncStateFields",
]) {
  assert(
    extractFunction(appJs, functionName).includes("overallLessonLo"),
    `${functionName}() should preserve overallLessonLo.`,
  );
}

assert(
  appJs.includes("let selectedPreviewSlideIds = new Set();") &&
    appJs.includes("let previewInsertAnchorSlideId = \"\";"),
  "Deck preview should track multiple selected slides and a separate insertion anchor.",
);

const renderPreview = extractFunction(appJs, "renderPreview");
assert(
  renderPreview.includes("selectedPreviewSlideIds.has(slide.id)") &&
    renderPreview.includes('aria-selected="${isSelected ? "true" : "false"}'),
  "Deck preview rendering should mark every selected slide card.",
);

const getSelectedSlideInsertIndex = extractFunction(appJs, "getSelectedSlideInsertIndex");
assert(
  getSelectedSlideInsertIndex.includes("previewInsertAnchorSlideId") &&
    !getSelectedSlideInsertIndex.includes("selectedPreviewSlideId"),
  "Slide insertion should use the insertion anchor, not a single selected slide id.",
);

for (const functionName of [
  "getSelectedPreviewSlides",
  "validateHandoutSelection",
  "buildHandoutHtml",
  "handoutImageHtml",
  "openHandout",
  "handoutStarterHtml",
  "handoutExampleQuestionsHtml",
  "handoutExampleAnswersHtml",
]) {
  extractFunction(appJs, functionName);
}

const validateHandoutSelection = extractFunction(appJs, "validateHandoutSelection");
assert(
  validateHandoutSelection.includes('slide.type === "starter"') &&
    validateHandoutSelection.includes('slide.type === "example"') &&
    validateHandoutSelection.includes("starters.length !== 1") &&
    validateHandoutSelection.includes("examples.length < 1") &&
    validateHandoutSelection.includes("examples.length > 2"),
  "Handout validation should require exactly one starter and one or two example slides.",
);

const buildHandoutHtml = extractFunction(appJs, "buildHandoutHtml");
const handoutPage2Index = buildHandoutHtml.indexOf('aria-label="Handout page 2"');
const handoutPage2QuestionsIndex = buildHandoutHtml.indexOf("${handoutExampleQuestionsHtml(examples)}", handoutPage2Index);
const handoutPage2AnswersIndex = buildHandoutHtml.indexOf("${handoutExampleAnswersHtml(examples)}", handoutPage2Index);
assert(
  buildHandoutHtml.includes("@page { size: A4 portrait; margin: 8mm; }") &&
    buildHandoutHtml.includes("width: 194mm;") &&
    buildHandoutHtml.includes("height: 281mm;") &&
    buildHandoutHtml.includes("min-height: 281mm;") &&
    buildHandoutHtml.includes("max-height: 281mm;") &&
    buildHandoutHtml.includes("overflow: hidden;") &&
    buildHandoutHtml.includes("width: calc(210mm - 16mm);") &&
    buildHandoutHtml.includes("height: calc(297mm - 16mm);") &&
    buildHandoutHtml.includes("min-height: calc(297mm - 16mm);") &&
    buildHandoutHtml.includes("max-height: calc(297mm - 16mm);") &&
    !buildHandoutHtml.includes("width: auto;") &&
    !buildHandoutHtml.includes("@page { size: A4 landscape; margin: 8mm; }") &&
    !buildHandoutHtml.includes("width: 281mm;") &&
    !buildHandoutHtml.includes("min-height: 194mm;") &&
    buildHandoutHtml.includes("handout-page") &&
    buildHandoutHtml.includes("handout-column") &&
    buildHandoutHtml.includes("glue") &&
    buildHandoutHtml.includes("overallLessonLo") &&
    buildHandoutHtml.includes("teachingDate"),
  "Handout HTML should use A4 portrait print CSS, two-column pages, glue, date, and lesson LO.",
);

assert(
  handoutPage2Index >= 0 &&
    handoutPage2QuestionsIndex > handoutPage2Index &&
    handoutPage2AnswersIndex > handoutPage2Index &&
    handoutPage2QuestionsIndex < handoutPage2AnswersIndex,
  "Handout page 2 should put worked example questions in the left column and answer prompts in the right column.",
);

const handoutStarterHtml = extractFunction(appJs, "handoutStarterHtml");
const handoutImageHtml = extractFunction(appJs, "handoutImageHtml");
const handoutExampleQuestionsHtml = extractFunction(appJs, "handoutExampleQuestionsHtml");
const handoutExampleAnswersHtml = extractFunction(appJs, "handoutExampleAnswersHtml");
assert(
  handoutStarterHtml.includes("handout-starter-number") &&
    handoutStarterHtml.includes("${index + 1}") &&
    buildHandoutHtml.includes("grid-template-rows: repeat(4, minmax(0, 1fr));") &&
    buildHandoutHtml.includes(".handout-starter-column { display: grid; grid-template-rows: auto minmax(0, 1fr);") &&
    buildHandoutHtml.includes(".handout-starter { height: 100%;") &&
    !buildHandoutHtml.includes("grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr"),
  "Handout starter questions should render as a numbered single column, not a 2x2 grid.",
);

assert(
    !handoutImageHtml.includes("No image") &&
    !handoutExampleQuestionsHtml.includes("Blank question space") &&
    !handoutExampleAnswersHtml.includes("Your turn") &&
    !handoutExampleAnswersHtml.includes("handout-answer-box handout-student-space") &&
    !buildHandoutHtml.includes("repeating-linear-gradient"),
  "Handout printouts should not show missing-image placeholders or a boxed/labelled Your turn area.",
);

assert(
  stylesCss.includes(".slide-item.is-selected") &&
    stylesCss.includes(".preview-head-actions"),
  "Existing preview selection and header action styling should remain available for handout controls.",
);

console.log("Builder handout regression checks passed.");
