import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");
const indexHtml = readFileSync(resolve(root, "public", "builder", "index.html"), "utf8");
const stylesCss = readFileSync(resolve(root, "public", "builder", "styles.css"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
  packageJson.dependencies && packageJson.dependencies.pptxgenjs,
  "PowerPoint bundle export should add pptxgenjs as an application dependency."
);
assert(
  existsSync(resolve(root, "public", "builder", "vendor", "pptxgen.bundle.js")),
  "The builder should serve a local PptxGenJS browser bundle."
);
assert(
  indexHtml.includes("./vendor/pptxgen.bundle.js") &&
    indexHtml.indexOf("./vendor/pptxgen.bundle.js") < indexHtml.indexOf("./app.js"),
  "The PptxGenJS bundle should load before app.js."
);
assert(
  appJs.includes('data-saved-action="ppt-bundle"'),
  "Each saved lesson should expose a PPT bundle action."
);

const handleSavedLessonsClick = extractFunction(appJs, "handleSavedLessonsClick");
assert(
  handleSavedLessonsClick.includes('action === "ppt-bundle"') &&
    handleSavedLessonsClick.includes("downloadSavedLessonPowerPointBundle(id)"),
  "Saved lesson clicks should route PPT bundle actions to the PPT bundle exporter."
);

const downloadSavedLesson = extractFunction(appJs, "downloadSavedLesson");
assert(
  downloadSavedLesson.includes("buildStandaloneHtml(") && downloadSavedLesson.includes(".html"),
  "The existing saved lesson Download action should remain the presenter HTML export."
);

const downloadSavedLessonPowerPointBundle = extractFunction(appJs, "downloadSavedLessonPowerPointBundle");
assert(
  downloadSavedLessonPowerPointBundle.includes("SAVED_LESSON_OPEN_URL") &&
    downloadSavedLessonPowerPointBundle.includes("prepareStandaloneLessonDownloadState(") &&
    downloadSavedLessonPowerPointBundle.includes("buildPowerPointBundleZip("),
  "Saved lesson PPT bundle export should fetch, hydrate, inline, and package the saved lesson document."
);

const buildPowerPointBundleZip = extractFunction(appJs, "buildPowerPointBundleZip");
assert(
  buildPowerPointBundleZip.includes("new window.JSZip()") &&
    buildPowerPointBundleZip.includes("buildPowerPointBlob(") &&
    buildPowerPointBundleZip.includes("buildPdfFromRenderedSlides(") &&
    buildPowerPointBundleZip.includes("collectWorksheetFilesForBundle(") &&
    buildPowerPointBundleZip.includes('"README.txt"') &&
    buildPowerPointBundleZip.includes("worksheets/"),
  "PowerPoint bundle generation should include PPTX, PDF, worksheets, and a README in one ZIP."
);
assert(
  buildPowerPointBundleZip.includes("describeStaticExportBehavior("),
  "The bundle README should describe whether saved classroom state or generated answer variants were exported."
);

const describeStaticExportBehavior = extractFunction(appJs, "describeStaticExportBehavior");
assert(
  describeStaticExportBehavior.includes("hasPresentationState(") &&
    describeStaticExportBehavior.includes("saved classroom visibility") &&
    describeStaticExportBehavior.includes("answers hidden") &&
    describeStaticExportBehavior.includes("answers shown"),
  "Bundle export messaging should cover taught-state and legacy answer-variant behavior."
);

const expandSlidesForStaticExport = extractFunction(appJs, "expandSlidesForStaticExport");
assert(
  expandSlidesForStaticExport.includes("hasPresentationState(") &&
    expandSlidesForStaticExport.includes('answerMode: "saved"') &&
    expandSlidesForStaticExport.includes("slideHasAnswerImages(") &&
    expandSlidesForStaticExport.includes('answerMode: "hidden"') &&
    expandSlidesForStaticExport.includes('answerMode: "shown"'),
  "Static bundle export should preserve taught slide state while retaining legacy hidden-answer and shown-answer variants."
);

const renderStaticExportSlides = extractFunction(appJs, "renderStaticExportSlides");
assert(
  renderStaticExportSlides.includes("prepareSavedPresentationStateForStaticExport(") &&
    renderStaticExportSlides.includes("revealHiddenQuestionContent(") &&
    renderStaticExportSlides.includes("applyAnswerVisibilityForStaticExport("),
  "Static bundle rendering should preserve saved state or control answer visibility for legacy variants."
);
assert(
  renderStaticExportSlides.includes("prepareStaticBundleSlideLayout("),
  "Static bundle rendering should apply export-only layout constraints before slides are captured."
);

const renderSlideToJpegPage = extractFunction(appJs, "renderSlideToJpegPage");
assert(
  renderSlideToJpegPage.includes("await inlineRemoteDomResources(clone)") &&
    renderSlideToJpegPage.indexOf("await inlineRemoteDomResources(clone)") < renderSlideToJpegPage.indexOf("new XMLSerializer()"),
  "Static bundle/PDF rendering should inline remote DOM image sources before SVG canvas capture to avoid tainted canvases."
);

const inlineRemoteDomResources = extractFunction(appJs, "inlineRemoteDomResources");
assert(
  inlineRemoteDomResources.includes("img[src]") &&
    inlineRemoteDomResources.includes("source[srcset]") &&
    inlineRemoteDomResources.includes("inlineRemoteStyleUrls("),
  "DOM resource inlining should cover image src/srcset and CSS url() resources inside imported/presenter-saved slides."
);

const prepareStaticBundleSlideLayout = extractFunction(appJs, "prepareStaticBundleSlideLayout");
assert(
  prepareStaticBundleSlideLayout.includes("static-bundle-export-slide"),
  "Static bundle layout preparation should mark rendered slides with an export-only class."
);

assert(
  stylesCss.includes(".live-starter-image-host") &&
    stylesCss.includes("width: 100%;") &&
    stylesCss.includes("height: 100%;"),
  "Builder CSS should constrain live starter image hosts so starter images use object-fit inside their quadrant."
);
assert(
  stylesCss.includes(".static-bundle-export-slide.example-slide .example-images") &&
    stylesCss.includes("height: calc(50% - 14px);") &&
    stylesCss.includes(".static-bundle-export-slide.example-slide .single-image") &&
    stylesCss.includes("width: 50%;"),
  "Static bundle example slides should constrain example images to at most one quadrant."
);

const revealHiddenQuestionContent = extractFunction(appJs, "revealHiddenQuestionContent");
assert(
  revealHiddenQuestionContent.includes("[data-example-reveal-region]") &&
    revealHiddenQuestionContent.includes("example-reveal-button"),
  "Hidden example question content should be forced visible for static bundle exports."
);

const applyAnswerVisibilityForStaticExport = extractFunction(appJs, "applyAnswerVisibilityForStaticExport");
assert(
  applyAnswerVisibilityForStaticExport.includes(".qa-answer-layer") &&
    applyAnswerVisibilityForStaticExport.includes(".qa-question-layer") &&
    applyAnswerVisibilityForStaticExport.includes(".example-answer-region") &&
    applyAnswerVisibilityForStaticExport.includes("showAnswers"),
  "Answer visibility helper should handle replacement and below-question answer reveal regions."
);

console.log("Saved lesson PPT bundle regression checks passed.");
