import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJs = readFileSync(resolve(root, "public", "builder", "app.js"), "utf8");

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

const renderPdfPageSlide = extractFunction(appJs, "renderPdfPageSlide");
assert(
  renderPdfPageSlide.includes('class="lesson-slide pdf-page-slide'),
  "PDF pages should keep an identifiable slide class for presenter sizing."
);
assert(
  renderPdfPageSlide.includes('data-slide-aspect="${escapeAttr(aspect)}"'),
  "PDF pages should preserve their real page aspect for height/PDF export calculations."
);

const standalonePresenterScript = extractFunction(appJs, "standalonePresenterScript");
assert(
  standalonePresenterScript.includes("function usesDefaultPresenterWidth(slide) {"),
  "The standalone presenter should identify slides that must keep the standard lesson width."
);
assert(
  standalonePresenterScript.includes('slide.classList.contains("pdf-page-slide")'),
  "PDF page slides should be sized to the standard lesson width in the presenter."
);
assert(
  standalonePresenterScript.includes("var fitWidth = usesDefaultPresenterWidth(slide) ? defaultFitWidth : Math.floor(Math.min(availableWidth, availableHeight * aspect));"),
  "Presenter layout should keep PDF slide width aligned with the standard slide width."
);

assert(
  appJs.includes("body.focus-mode .lesson-slide.pdf-page-slide,body.fullscreen-mode .lesson-slide.pdf-page-slide{max-height:none;align-self:start;scroll-snap-align:start center;}"),
  "Fullscreen/focus PDF page slides should be allowed to become taller instead of being squeezed narrow."
);

console.log("PDF slide output regression checks passed.");
