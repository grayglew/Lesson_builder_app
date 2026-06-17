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

const renderStarterSlide = extractFunction(appJs, "renderStarterSlide");
assert(
  renderStarterSlide.includes("starter-answer-${index}") &&
    renderStarterSlide.includes("revealIsShown(slide"),
  "Starter answer controls should use stable per-quadrant reveal keys and restore saved visibility.",
);

const renderRevisionSlide = extractFunction(appJs, "renderRevisionSlide");
assert(
  renderRevisionSlide.includes("revision-answer-${index}") &&
    renderRevisionSlide.includes("revealIsShown(slide"),
  "Revision answer controls should use stable per-question reveal keys and restore saved visibility.",
);

const renderExampleSlide = extractFunction(appJs, "renderExampleSlide");
assert(
  renderExampleSlide.includes("example-answer-${index}") &&
    renderExampleSlide.includes('"example-second-image"') &&
    renderExampleSlide.includes("revealIsShown(slide"),
  "Example answers and the optional second image should restore their independent saved visibility.",
);

const toggleableImageTag = extractFunction(appJs, "toggleableImageTag");
assert(
  toggleableImageTag.includes("data-reveal-key") &&
    toggleableImageTag.includes("is-showing-answer") &&
    toggleableImageTag.includes('aria-pressed="${'),
  "Replacement question/answer controls should render stable reveal metadata and initial state.",
);

const captureLiveDomStateForSlide = extractFunction(appJs, "captureLiveDomStateForSlide");
assert(
  captureLiveDomStateForSlide.includes("[data-reveal-key]") &&
    captureLiveDomStateForSlide.includes("presentationState") &&
    captureLiveDomStateForSlide.includes("reveals") &&
    captureLiveDomStateForSlide.indexOf("[data-reveal-key]") <
      captureLiveDomStateForSlide.indexOf('slideState.type === "starter"'),
  "Presenter save-back should rebuild reveal state for every slide before starter-specific capture.",
);

const replaceLiveStarterImage = extractFunction(appJs, "replaceLiveStarterImage");
assert(
  replaceLiveStarterImage.includes("data-live-slot-index") &&
    replaceLiveStarterImage.includes("starter-answer-"),
  "A live next-question replacement should retain its starter quadrant reveal key.",
);

const expandSlidesForStaticExport = extractFunction(appJs, "expandSlidesForStaticExport");
assert(
  expandSlidesForStaticExport.includes("hasPresentationState") &&
    expandSlidesForStaticExport.includes('answerMode: "saved"') &&
    expandSlidesForStaticExport.includes('answerMode: "hidden"') &&
    expandSlidesForStaticExport.includes('answerMode: "shown"'),
  "Static export should use one saved-state variant for taught slides and retain paired variants for legacy slides.",
);

const renderStaticExportSlides = extractFunction(appJs, "renderStaticExportSlides");
assert(
  renderStaticExportSlides.includes('variants[index].answerMode === "saved"') &&
    renderStaticExportSlides.includes("prepareSavedPresentationStateForStaticExport"),
  "Static rendering should preserve saved visibility instead of forcing all hidden content visible.",
);

console.log("Presenter reveal state regression checks passed.");
